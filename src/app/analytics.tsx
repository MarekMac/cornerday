import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY } from '@/constants/storage-keys';
import { usePurchases } from '@/context/purchases';
import { useUser } from '@/context/user';

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'USD') {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency;
  return `${s}${Math.round(amount * 100) / 100}`;
}

function fmtCompact(amount: number, currency = 'USD') {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency;
  if (amount >= 10000) return `${s}${(amount / 1000).toFixed(0)}k`;
  if (amount >= 1000) return `${s}${(amount / 1000).toFixed(1)}k`;
  return `${s}${Math.round(amount)}`;
}

function parseQuitDate(quitDate: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(quitDate)) {
    const [y, m, d] = quitDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(quitDate);
}

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MILESTONES = [
  { days: 1, label: '1 day', emoji: '🌱' },
  { days: 7, label: '1 week', emoji: '⭐' },
  { days: 30, label: '1 month', emoji: '🔥' },
  { days: 60, label: '60 days', emoji: '🏆' },
  { days: 180, label: '6 months', emoji: '💎' },
  { days: 365, label: '1 year', emoji: '👑' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  currency: string;
  quitDate: string | null;
  longestStreak: number;
  currentStreakDays: number;
  totalSavings: number;
  savingsGoal: number | null;
  savingsGoalFor: string;
  savingsGoalIcon: string;
  totalDebts: number;
  totalDebtPaid: number;
  urgeCount: number;
  urgesOvercome: number;
  urgesByDay: number[];
  moodLast30: { date: string; mood: number }[];
  moodSparkline: (number | null)[];
  checkInDays: number;
  savingsTimeline: { date: string; amount: number; cumulative: number }[];
  monthlySavings: { month: string; amount: number }[];
  weekMoods: { date: string; mood: number | null }[];
  relapseCount: number;
  dailySavingsRate: number;
  streakHistory: number[];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { isPremium, isLoadingPurchases, showPaywall } = usePurchases();
  const { isAdmin } = useUser();
  const hasAccess = isPremium || isAdmin;
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    const [profileRes, streakRes, lossesRes, debtsRes, paymentsRes, urgeRes, moodRes] = await Promise.all([
      supabase.from('users').select('currency, quit_date, quit_timestamp').eq('id', user.id).single(),
      supabase.from('streaks').select('longest_streak').eq('user_id', user.id).single(),
      supabase.from('losses').select('type, amount, created_at').eq('user_id', user.id).neq('type', 'milestone_earned'),
      supabase.from('debts').select('id, total_amount').eq('user_id', user.id),
      supabase.from('debt_payments').select('debt_id, amount').eq('user_id', user.id),
      supabase.from('urge_journal').select('outcome, created_at').eq('user_id', user.id),
      supabase.from('mood_checkins').select('mood, created_at').eq('user_id', user.id).gte('created_at', thirtyDaysAgo).order('created_at', { ascending: true }),
    ]);

    const [goalRaw, goalForRaw, goalIconRaw] = await Promise.all([
      AsyncStorage.getItem(SAVINGS_GOAL_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
    ]);

    const profile = profileRes.data;
    const currency = profile?.currency ?? 'USD';
    const quitDate = profile?.quit_timestamp ?? profile?.quit_date ?? null;

    const currentStreakDays = quitDate
      ? Math.floor(Math.max(0, Date.now() - parseQuitDate(quitDate).getTime()) / 86400000)
      : 0;

    const lossRows = lossesRes.data ?? [];
    const savingRows = lossRows.filter(r => r.type === 'saving');
    const relapseRows = lossRows.filter(r => r.type === 'streak_reset');
    const totalSavings = savingRows.reduce((s, r) => s + Number(r.amount), 0);

    const sortedSavings = [...savingRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let running = 0;
    const savingsTimeline = sortedSavings.slice(-10).map(r => {
      running += Number(r.amount);
      return { date: r.created_at, amount: Number(r.amount), cumulative: running };
    });

    // Monthly savings — last 6 months
    const monthMap: Record<string, number> = {};
    savingRows.forEach(r => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] ?? 0) + Number(r.amount);
    });
    const monthlySavings: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlySavings.push({ month: d.toLocaleDateString('en', { month: 'short' }), amount: monthMap[key] ?? 0 });
    }

    const debtRows = debtsRes.data ?? [];
    const payRows = paymentsRes.data ?? [];
    const totalDebts = debtRows.reduce((s, d) => s + Number(d.total_amount), 0);
    const totalDebtPaid = payRows.reduce((s, p) => s + Number(p.amount), 0);

    const urgeRows = urgeRes.data ?? [];
    const urgesOvercome = urgeRows.filter(u => u.outcome === 'overcame').length;

    const urgesByDay = [0, 0, 0, 0, 0, 0, 0];
    urgeRows.forEach(u => { urgesByDay[new Date(u.created_at).getDay()]++; });

    const moodRows = moodRes.data ?? [];
    const moodByDate: Record<string, number> = {};
    moodRows.forEach(r => {
      const d = new Date(r.created_at).toLocaleDateString('en-CA');
      moodByDate[d] = r.mood;
    });
    const moodLast30: { date: string; mood: number }[] = moodRows.map(r => ({
      date: new Date(r.created_at).toLocaleDateString('en-CA'),
      mood: r.mood,
    }));
    const checkInDays = Object.keys(moodByDate).length;

    // 30-day daily sparkline — one entry per day
    const moodSparkline: (number | null)[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      moodSparkline.push(moodByDate[d.toLocaleDateString('en-CA')] ?? null);
    }

    const today = new Date();
    const sun = new Date(today);
    sun.setDate(today.getDate() - today.getDay());
    const weekMoods = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun);
      d.setDate(sun.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: DAY_LABELS[i], mood: moodByDate[key] ?? null };
    });

    const dailySavingsRate = currentStreakDays > 0 ? totalSavings / currentStreakDays : 0;

    // Streak history — gaps between consecutive relapses + current streak
    const sortedRelapses = [...relapseRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const streakHistory: number[] = [];
    for (let i = 1; i < sortedRelapses.length; i++) {
      const gap = Math.floor(
        (new Date(sortedRelapses[i].created_at).getTime() - new Date(sortedRelapses[i - 1].created_at).getTime()) / 86400000
      );
      if (gap > 0) streakHistory.push(gap);
    }
    streakHistory.push(currentStreakDays);

    setData({
      currency,
      quitDate,
      longestStreak: streakRes.data?.longest_streak ?? 0,
      currentStreakDays,
      totalSavings,
      savingsGoal: goalRaw ? Number(goalRaw) : null,
      savingsGoalFor: goalForRaw ?? '',
      savingsGoalIcon: goalIconRaw ?? '🎯',
      totalDebts,
      totalDebtPaid,
      urgeCount: urgeRows.length,
      urgesOvercome,
      urgesByDay,
      moodLast30,
      moodSparkline,
      checkInDays,
      savingsTimeline,
      monthlySavings,
      weekMoods,
      relapseCount: relapseRows.length,
      dailySavingsRate,
      streakHistory,
    });
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const renderHeader = () => (
    <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
      <SafeAreaView edges={['top']}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
          <Text style={s.headerTitle}>Progress Analytics</Text>
          <View style={s.backBtn} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color="#0F6E6E" size="large" />
      </View>
    );
  }

  if (!data) return null;

  // ── Derived values ─────────────────────────────────────────────────────────

  const goalPct = data.savingsGoal && data.savingsGoal > 0
    ? Math.min(1, data.totalSavings / data.savingsGoal)
    : null;

  const debtPct = data.totalDebts > 0 ? Math.min(1, data.totalDebtPaid / data.totalDebts) : null;

  const avgMoodVal = data.moodLast30.length > 0
    ? data.moodLast30.reduce((s, r) => s + r.mood, 0) / data.moodLast30.length
    : null;

  const urgeResistPct = data.urgeCount > 0
    ? Math.round((data.urgesOvercome / data.urgeCount) * 100)
    : null;

  const maxSaving = data.savingsTimeline.length > 0
    ? Math.max(...data.savingsTimeline.map(r => r.cumulative))
    : 0;

  const nextMilestone = MILESTONES.find(m => m.days > data.currentStreakDays) ?? null;
  const nextMilestoneIdx = nextMilestone ? MILESTONES.indexOf(nextMilestone) : -1;
  const prevMilestoneDays = nextMilestoneIdx > 0 ? MILESTONES[nextMilestoneIdx - 1].days : 0;
  const milestonePct = nextMilestone
    ? Math.min(1, (data.currentStreakDays - prevMilestoneDays) / (nextMilestone.days - prevMilestoneDays))
    : 1;

  const maxUrgeCount = Math.max(...data.urgesByDay);
  const maxUrgeDay = data.urgesByDay.indexOf(maxUrgeCount);

  const daysToGoal = goalPct !== null && data.dailySavingsRate > 0 && goalPct < 1
    ? Math.ceil((data.savingsGoal! - data.totalSavings) / data.dailySavingsRate)
    : null;

  // Health score
  const checkInConsistency = Math.round((data.checkInDays / 30) * 100);
  const streakComponent = Math.min(100, data.currentStreakDays >= 30 ? 100 : Math.round((data.currentStreakDays / 30) * 100));
  const urgeComponent = data.urgeCount > 0 ? (urgeResistPct ?? 0) : 100;
  const moodComponent = avgMoodVal !== null ? Math.round((avgMoodVal / 5) * 100) : 60;
  const healthScore = Math.round(streakComponent * 0.35 + urgeComponent * 0.30 + moodComponent * 0.20 + checkInConsistency * 0.15);
  const healthGrade = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Building' : 'Getting started';
  const healthColor = healthScore >= 80 ? '#0a7a4e' : healthScore >= 60 ? '#0F6E6E' : healthScore >= 40 ? '#d97706' : '#9ca3af';

  // Monthly savings
  const maxMonthSaving = Math.max(0, ...data.monthlySavings.map(m => m.amount));
  const monthsWithData = data.monthlySavings.filter(m => m.amount > 0).length;

  // Streak history
  const maxStreakHistory = Math.max(1, ...data.streakHistory);
  const isStreakImproving = data.streakHistory.length >= 3 &&
    data.streakHistory[data.streakHistory.length - 1] > data.streakHistory[0];

  // Auto-generated insights
  const insights: { emoji: string; text: string; bg: string; tc: string }[] = [];
  if (data.currentStreakDays > 0 && data.currentStreakDays >= data.longestStreak) {
    insights.push({ emoji: '🏆', text: 'This is your longest streak ever!', bg: '#fef3c7', tc: '#92400e' });
  }
  if (urgeResistPct !== null && urgeResistPct >= 70) {
    insights.push({ emoji: '💪', text: `${urgeResistPct}% urge resistance — keep it up`, bg: '#dcfce7', tc: '#166534' });
  }
  if (avgMoodVal !== null && avgMoodVal >= 3.5) {
    insights.push({ emoji: '😊', text: `Average mood ${avgMoodVal.toFixed(1)}/5 — you're doing well`, bg: '#eff6ff', tc: '#1d4ed8' });
  }
  if (data.relapseCount === 0 && data.currentStreakDays >= 7) {
    insights.push({ emoji: '🌟', text: 'Clean run — no relapses on record', bg: '#f0fdf4', tc: '#166534' });
  }
  if (maxUrgeCount > 0) {
    insights.push({ emoji: '📅', text: `${DAY_LABELS[maxUrgeDay]}s are your most challenging day`, bg: '#fef2f2', tc: '#b91c1c' });
  }
  if (data.dailySavingsRate > 0) {
    insights.push({ emoji: '💰', text: `Saving ${fmt(data.dailySavingsRate, data.currency)} per clean day`, bg: '#e6f7f7', tc: '#0F6E6E' });
  }
  if (isStreakImproving) {
    insights.push({ emoji: '📈', text: 'Your streaks are getting longer over time', bg: '#f0fdf4', tc: '#166534' });
  }

  if (isLoadingPurchases) {
    return (
      <View style={s.root}>
        {renderHeader()}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0F6E6E" />
        </View>
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={s.root}>
        {renderHeader()}
        <ScrollView contentContainerStyle={s.lockScroll}>
          <View style={s.lockTop}>
            <Text style={s.lockEmoji}>📊</Text>
            <Text style={s.lockTitle}>Detailed Analytics</Text>
            <Text style={s.lockDesc}>
              Deep insights into your recovery — see exactly how far you've come and what's driving your progress.
            </Text>
            <Pressable style={({ pressed }) => [s.lockBtn, pressed && { opacity: 0.85 }]} onPress={showPaywall}>
              <Text style={s.lockBtnTxt}>✨ Upgrade to Premium</Text>
            </Pressable>
          </View>

          <Text style={s.teaserHeading}>What you'll unlock</Text>
          {[
            { emoji: '💚', title: 'Recovery health score', desc: 'One composite score combining streak, urge resistance, mood and consistency' },
            { emoji: '🔥', title: 'Streak overview & milestone progress', desc: 'Visual countdown to every badge with % complete' },
            { emoji: '📈', title: 'Streak improvement history', desc: 'See how each of your streaks compares — are you getting stronger?' },
            { emoji: '😊', title: '30-day mood sparkline', desc: 'Daily bar chart showing your emotional wellbeing over the past month' },
            { emoji: '🧠', title: 'Urge pattern analysis', desc: 'Day-of-week breakdown — discover when you\'re most challenged' },
            { emoji: '💰', title: 'Monthly savings chart + daily rate', desc: 'Month-by-month savings and projected timeline to your goal' },
            { emoji: '✨', title: 'Personalised insights', desc: 'Auto-generated callouts based on your real data' },
          ].map((item, i) => (
            <View key={i} style={s.teaserCard}>
              <Text style={s.teaserEmoji}>{item.emoji}</Text>
              <View style={s.teaserText}>
                <Text style={s.teaserTitle}>{item.title}</Text>
                <Text style={s.teaserDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {renderHeader()}

      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F6E6E" />}>

        {/* Hero card */}
        <LinearGradient
          colors={['#0b5252', '#0F6E6E', '#1a9a9a']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.heroCard}>
          <Text style={s.heroEmoji}>🔥</Text>
          <Text style={s.heroDays}>{data.currentStreakDays}</Text>
          <Text style={s.heroLabel}>days without gambling</Text>
          {data.quitDate ? (
            <Text style={s.heroDate}>
              Since {parseQuitDate(data.quitDate).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          ) : null}
          <View style={s.heroDivider} />
          <View style={s.heroStatsRow}>
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{fmtCompact(data.totalSavings, data.currency)}</Text>
              <Text style={s.heroStatLabel}>saved</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{data.urgesOvercome}</Text>
              <Text style={s.heroStatLabel}>urges resisted</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{data.longestStreak}d</Text>
              <Text style={s.heroStatLabel}>best ever</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Recovery health score */}
        <View style={s.card}>
          <SectionHeader title="💚 Recovery Health Score" />
          <View style={s.healthRow}>
            <View style={s.healthCircleWrap}>
              <View style={[s.healthCircle, { borderColor: healthColor }]}>
                <Text style={[s.healthScoreNum, { color: healthColor }]}>{healthScore}</Text>
                <Text style={s.healthScoreOf}>/100</Text>
              </View>
              <View style={[s.healthGradeBadge, { backgroundColor: healthColor + '1a' }]}>
                <Text style={[s.healthGradeText, { color: healthColor }]}>{healthGrade}</Text>
              </View>
            </View>
            <View style={s.healthComponents}>
              {([
                { label: 'Streak', value: streakComponent },
                { label: 'Resistance', value: urgeComponent },
                { label: 'Mood', value: moodComponent },
                { label: 'Check-ins', value: checkInConsistency },
              ] as const).map(comp => (
                <View key={comp.label} style={s.healthCompRow}>
                  <Text style={s.healthCompLabel}>{comp.label}</Text>
                  <View style={s.healthCompBarBg}>
                    <View style={[s.healthCompBarFill, { width: `${comp.value}%` as any, backgroundColor: healthColor }]} />
                  </View>
                  <Text style={[s.healthCompPct, { color: healthColor }]}>{comp.value}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Streak + Next milestone */}
        <View style={s.card}>
          <SectionHeader title="🔥 Streak" />
          <View style={s.statsRow}>
            <StatBox label="Current" value={`${data.currentStreakDays}d`} color="#0F6E6E" />
            <View style={s.statsDivider} />
            <StatBox label="Best ever" value={`${data.longestStreak}d`} />
            <View style={s.statsDivider} />
            <StatBox
              label="Relapses"
              value={`${data.relapseCount}`}
              sub={data.relapseCount === 0 ? 'Clean run!' : undefined}
            />
          </View>

          {nextMilestone ? (
            <View style={s.milestoneWrap}>
              <View style={s.milestoneRow}>
                <Text style={s.milestoneEmoji}>{nextMilestone.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.milestoneTitle}>Next badge: {nextMilestone.label}</Text>
                  <Text style={s.milestoneSub}>
                    {nextMilestone.days - data.currentStreakDays} more day{nextMilestone.days - data.currentStreakDays !== 1 ? 's' : ''} to earn it
                  </Text>
                </View>
                <Text style={s.milestonePct}>{Math.round(milestonePct * 100)}%</Text>
              </View>
              <View style={s.progressBarBg}>
                <View style={[s.progressBarFill, { width: `${Math.round(milestonePct * 100)}%` as any }]} />
              </View>
            </View>
          ) : (
            <View style={s.milestoneComplete}>
              <Text style={s.milestoneCompleteTxt}>👑 All milestones earned — incredible!</Text>
            </View>
          )}
        </View>

        {/* Streak history */}
        {data.streakHistory.length > 1 && (
          <View style={s.card}>
            <SectionHeader
              title="📈 Streak history"
              subtitle={isStreakImproving ? 'Your streaks are getting longer ↑' : undefined}
            />
            <View style={s.streakHistChart}>
              {data.streakHistory.slice(-8).map((days, i, arr) => {
                const isCurrent = i === arr.length - 1;
                const barH = Math.max(6, (days / maxStreakHistory) * 64);
                return (
                  <View key={i} style={s.streakHistItem}>
                    <Text style={[s.streakHistDays, isCurrent && { color: '#0F6E6E' }]}>{days}d</Text>
                    <View style={s.streakHistBarBg}>
                      <View style={[
                        s.streakHistBarFill,
                        { height: barH },
                        isCurrent ? s.streakHistBarCurrent : s.streakHistBarPast,
                      ]} />
                    </View>
                    <Text style={[s.streakHistLabel, isCurrent && { color: '#0F6E6E', fontWeight: '700' }]}>
                      {isCurrent ? 'now' : `#${i + 1}`}
                    </Text>
                  </View>
                );
              })}
            </View>
            {isStreakImproving && (
              <Text style={s.streakHistInsight}>💪 Each attempt you go further — keep building</Text>
            )}
          </View>
        )}

        {/* Mood */}
        <View style={s.card}>
          <SectionHeader
            title="😊 Mood"
            subtitle={avgMoodVal !== null ? `30-day avg: ${MOODS[Math.round(avgMoodVal) - 1]} ${avgMoodVal.toFixed(1)}/5` : undefined}
          />
          <View style={s.weekRow}>
            {data.weekMoods.map((day, i) => {
              const isToday = i === new Date().getDay();
              return (
                <View key={i} style={s.weekDayCol}>
                  <View style={[s.weekDot, isToday && s.weekDotToday]}>
                    {day.mood !== null
                      ? <Text style={s.weekEmoji}>{MOODS[day.mood - 1]}</Text>
                      : <View style={s.weekDotEmpty} />}
                  </View>
                  <Text style={[s.weekDayLabel, isToday && s.weekDayLabelToday]}>{day.date}</Text>
                </View>
              );
            })}
          </View>

          {data.moodSparkline.some(v => v !== null) && (
            <>
              <View style={s.sparklineRow}>
                {data.moodSparkline.map((mood, i) => {
                  const h = mood !== null ? Math.max(4, (mood / 5) * 34) : 4;
                  const bg = mood === null
                    ? '#f0f0f0'
                    : mood >= 4 ? '#1a9a9a' : mood === 3 ? '#7ec8c2' : '#e0a0a0';
                  return (
                    <View key={i} style={s.sparklineBar}>
                      <View style={[s.sparklineBarFill, { height: h, backgroundColor: bg }]} />
                    </View>
                  );
                })}
              </View>
              <Text style={s.chartCaption}>Daily mood — last 30 days</Text>
            </>
          )}

          <View style={s.checkInRow}>
            <Text style={s.checkInLabel}>Check-in consistency</Text>
            <Text style={s.checkInValue}>{data.checkInDays}/30 days this month</Text>
          </View>
          <View style={s.progressBarBg}>
            <View style={[s.progressBarFill, { width: `${Math.round((data.checkInDays / 30) * 100)}%` as any }]} />
          </View>
        </View>

        {/* Urge resistance */}
        <View style={s.card}>
          <SectionHeader title="🧠 Urge resistance" />
          <View style={s.statsRow}>
            <StatBox label="Total logged" value={`${data.urgeCount}`} />
            <View style={s.statsDivider} />
            <StatBox label="Overcame" value={`${data.urgesOvercome}`} color="#0a7a4e" />
            <View style={s.statsDivider} />
            <StatBox
              label="Success rate"
              value={urgeResistPct !== null ? `${urgeResistPct}%` : '—'}
              color={urgeResistPct !== null && urgeResistPct >= 70 ? '#0a7a4e' : '#888'}
            />
          </View>
          {data.urgeCount > 0 && (
            <View style={s.progressBarWrap}>
              <View style={s.progressBarBg}>
                <View style={[s.progressBarFill, { width: `${urgeResistPct ?? 0}%` as any }]} />
              </View>
            </View>
          )}

          {maxUrgeCount > 0 ? (
            <View style={s.urgeDayWrap}>
              <Text style={s.urgeDayTitle}>By day of week</Text>
              <View style={s.urgeDayChart}>
                {data.urgesByDay.map((count, i) => {
                  const barH = count > 0 ? Math.max(4, (count / maxUrgeCount) * 44) : 4;
                  const isHardest = count === maxUrgeCount && count > 0;
                  return (
                    <View key={i} style={s.urgeDayItem}>
                      <Text style={s.urgeDayCount}>{count > 0 ? count : ''}</Text>
                      <View style={s.urgeDayBarBg}>
                        <View style={[s.urgeDayBarFill, { height: barH }, isHardest && s.urgeDayBarHardest]} />
                      </View>
                      <Text style={[s.urgeDayLabel, isHardest && s.urgeDayLabelHardest]}>{DAY_SHORT[i]}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={s.urgeDayInsight}>
                💡 {DAY_LABELS[maxUrgeDay]}s are your most challenging day
              </Text>
            </View>
          ) : data.urgeCount === 0 ? (
            <Text style={s.urgeDayInsight}>✨ No urges logged yet — keep it up!</Text>
          ) : null}
        </View>

        {/* Savings */}
        <View style={s.card}>
          <SectionHeader title="💰 Savings" />
          <View style={s.statsRow}>
            <StatBox label="Total banked" value={fmt(data.totalSavings, data.currency)} color="#0F6E6E" />
            {goalPct !== null && (
              <>
                <View style={s.statsDivider} />
                <StatBox label="Goal" value={fmtCompact(data.savingsGoal!, data.currency)} />
                <View style={s.statsDivider} />
                <StatBox label="Progress" value={`${Math.round(goalPct * 100)}%`} color={goalPct >= 1 ? '#0a7a4e' : '#0F6E6E'} />
              </>
            )}
          </View>

          {goalPct !== null && (
            <View style={s.progressBarWrap}>
              <View style={s.goalBarLabel}>
                <Text style={s.goalBarLabelTxt}>{data.savingsGoalIcon} {data.savingsGoalFor || 'My goal'}</Text>
              </View>
              <View style={s.progressBarBg}>
                <View style={[s.progressBarFill, { width: `${Math.round(goalPct * 100)}%` as any }, goalPct >= 1 && s.progressBarDone]} />
              </View>
            </View>
          )}

          {data.dailySavingsRate > 0 && (
            <View style={s.savingsRateBox}>
              <View style={s.savingsRateRow}>
                <Text style={s.savingsRateLabel}>Daily savings rate</Text>
                <Text style={s.savingsRateValue}>{fmt(data.dailySavingsRate, data.currency)}/day</Text>
              </View>
              {daysToGoal !== null && (
                <Text style={s.savingsRateHint}>
                  🎯 Goal in ~{daysToGoal} more day{daysToGoal !== 1 ? 's' : ''} at this pace
                </Text>
              )}
            </View>
          )}

          {/* Monthly savings chart */}
          {maxMonthSaving > 0 && (
            <>
              <Text style={s.chartCaption}>Monthly savings — last 6 months</Text>
              <View style={s.monthBarChart}>
                {data.monthlySavings.map((item, i) => {
                  const barH = item.amount > 0 ? Math.max(4, (item.amount / maxMonthSaving) * 64) : 4;
                  const isCurrentMonth = i === data.monthlySavings.length - 1;
                  return (
                    <View key={i} style={s.monthBarItem}>
                      <Text style={s.monthBarAmt}>{item.amount > 0 ? fmtCompact(item.amount, data.currency) : ''}</Text>
                      <View style={s.monthBarBg}>
                        <View style={[s.monthBarFill, { height: barH }, isCurrentMonth && s.monthBarFillCurrent]} />
                      </View>
                      <Text style={[s.monthBarLabel, isCurrentMonth && { color: '#0F6E6E', fontWeight: '700' }]}>{item.month}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Per-entry trajectory — only show when monthly chart has < 2 months of data */}
          {monthsWithData < 2 && data.savingsTimeline.length > 0 && (
            <>
              <Text style={s.chartCaption}>Savings trajectory</Text>
              <View style={s.barChart}>
                {data.savingsTimeline.map((item, i) => {
                  const barH = maxSaving > 0 ? Math.max(4, (item.cumulative / maxSaving) * 60) : 4;
                  return (
                    <View key={i} style={s.barItem}>
                      <Text style={s.barAmt}>{fmtCompact(item.amount, data.currency)}</Text>
                      <View style={s.barBg}>
                        <View style={[s.barFill, { height: barH }]} />
                      </View>
                      <Text style={s.barDate}>{new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* Debt recovery */}
        {data.totalDebts > 0 && (
          <View style={s.card}>
            <SectionHeader title="🏦 Debt recovery" />
            <View style={s.statsRow}>
              <StatBox label="Total owed" value={fmt(data.totalDebts, data.currency)} />
              <View style={s.statsDivider} />
              <StatBox label="Paid back" value={fmt(data.totalDebtPaid, data.currency)} color="#0a7a4e" />
              <View style={s.statsDivider} />
              <StatBox label="Remaining" value={fmt(Math.max(0, data.totalDebts - data.totalDebtPaid), data.currency)} color="#c0392b" />
            </View>
            {debtPct !== null && (
              <View style={s.progressBarWrap}>
                <View style={s.progressBarBg}>
                  <View style={[s.progressBarFill, { width: `${Math.round(debtPct * 100)}%` as any }, debtPct >= 1 && s.progressBarDone]} />
                </View>
                <Text style={s.progressBarPct}>{Math.round(debtPct * 100)}% repaid</Text>
              </View>
            )}
          </View>
        )}

        {/* Personal insights */}
        {insights.length > 0 && (
          <View style={s.card}>
            <SectionHeader title="✨ Your insights" />
            <View style={s.insightsWrap}>
              {insights.map((ins, i) => (
                <View key={i} style={[s.insightChip, { backgroundColor: ins.bg }]}>
                  <Text style={s.insightEmoji}>{ins.emoji}</Text>
                  <Text style={[s.insightText, { color: ins.tc }]}>{ins.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 30, color: '#fff', fontWeight: '300', lineHeight: 36 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },

  // Lock / paywall
  lockScroll: { padding: 20, gap: 12 },
  lockTop: { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 12 },
  lockEmoji: { fontSize: 52 },
  lockTitle: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center' },
  lockDesc: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  lockBtn: { backgroundColor: '#0F6E6E', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  lockBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  teaserHeading: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  teaserCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  teaserEmoji: { fontSize: 26, marginTop: 2 },
  teaserText: { flex: 1, gap: 3 },
  teaserTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  teaserDesc: { fontSize: 13, color: '#777', lineHeight: 19 },

  // Hero card
  heroCard: {
    borderRadius: 20, padding: 20, alignItems: 'center', gap: 6,
    shadowColor: '#0F6E6E', shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  heroEmoji: { fontSize: 32 },
  heroDays: { fontSize: 64, fontWeight: '800', color: '#fff', lineHeight: 72 },
  heroLabel: { fontSize: 15, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  heroDate: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  heroDivider: { width: '80%', height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 10 },
  heroStatsRow: { flexDirection: 'row', width: '100%' },
  heroStat: { flex: 1, alignItems: 'center', gap: 3 },
  heroStatValue: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  heroStatDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 14 },

  sectionHeader: { gap: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  sectionSub: { fontSize: 12, color: '#888' },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statsDivider: { width: 1, height: 40, backgroundColor: '#f0f0f0', marginHorizontal: 12 },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
  statSub: { fontSize: 10, color: '#0a7a4e', textAlign: 'center' },

  // Health score
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  healthCircleWrap: { alignItems: 'center', gap: 8 },
  healthCircle: {
    width: 84, height: 84, borderRadius: 42, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center', gap: 0,
  },
  healthScoreNum: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  healthScoreOf: { fontSize: 11, color: '#aaa', lineHeight: 14 },
  healthGradeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  healthGradeText: { fontSize: 11, fontWeight: '700' },
  healthComponents: { flex: 1, gap: 8 },
  healthCompRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthCompLabel: { fontSize: 11, color: '#888', width: 68 },
  healthCompBarBg: { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  healthCompBarFill: { height: '100%', borderRadius: 3 },
  healthCompPct: { fontSize: 11, fontWeight: '700', width: 32, textAlign: 'right' },

  // Milestone
  milestoneWrap: { gap: 8, backgroundColor: '#f8fffe', borderRadius: 12, padding: 12 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  milestoneEmoji: { fontSize: 28 },
  milestoneTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  milestoneSub: { fontSize: 12, color: '#888', marginTop: 2 },
  milestonePct: { fontSize: 14, fontWeight: '700', color: '#0F6E6E' },
  milestoneComplete: { alignItems: 'center', paddingVertical: 4 },
  milestoneCompleteTxt: { fontSize: 14, fontWeight: '600', color: '#0a7a4e', textAlign: 'center' },

  // Streak history
  streakHistChart: { flexDirection: 'row', alignItems: 'flex-end', height: 92, gap: 6 },
  streakHistItem: { flex: 1, alignItems: 'center', gap: 4 },
  streakHistDays: { fontSize: 9, color: '#888', fontWeight: '600', textAlign: 'center' },
  streakHistBarBg: { width: '100%', height: 64, justifyContent: 'flex-end', backgroundColor: '#f5f5f5', borderRadius: 6, overflow: 'hidden' },
  streakHistBarFill: { width: '100%', borderRadius: 6 },
  streakHistBarPast: { backgroundColor: '#a8d8d0' },
  streakHistBarCurrent: { backgroundColor: '#0F6E6E' },
  streakHistLabel: { fontSize: 9, color: '#aaa', textAlign: 'center' },
  streakHistInsight: { fontSize: 12, color: '#0a7a4e', textAlign: 'center' },

  // Week mood strip
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDayCol: { alignItems: 'center', gap: 4 },
  weekDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  weekDotToday: { backgroundColor: '#e6f7f7', borderWidth: 1.5, borderColor: '#1a9a9a' },
  weekDotEmpty: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0e0e0' },
  weekEmoji: { fontSize: 20 },
  weekDayLabel: { fontSize: 10, color: '#aaa', fontWeight: '500' },
  weekDayLabelToday: { color: '#0F6E6E', fontWeight: '700' },

  // 30-day sparkline
  sparklineRow: { flexDirection: 'row', alignItems: 'flex-end', height: 38, gap: 2 },
  sparklineBar: { flex: 1, justifyContent: 'flex-end' },
  sparklineBarFill: { width: '100%', borderRadius: 2 },

  // Check-in consistency
  checkInRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkInLabel: { fontSize: 12, color: '#555', fontWeight: '500' },
  checkInValue: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },

  chartCaption: { fontSize: 11, color: '#bbb', textAlign: 'center' },

  // Progress bar
  progressBarWrap: { gap: 6 },
  progressBarBg: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#1a9a9a', borderRadius: 4 },
  progressBarDone: { backgroundColor: '#0a7a4e' },
  progressBarPct: { fontSize: 11, color: '#888', textAlign: 'right' },
  goalBarLabel: {},
  goalBarLabelTxt: { fontSize: 12, color: '#555', fontWeight: '600' },

  // Urge day chart
  urgeDayWrap: { gap: 8, backgroundColor: '#fafafa', borderRadius: 12, padding: 12 },
  urgeDayTitle: { fontSize: 12, fontWeight: '600', color: '#888' },
  urgeDayChart: { flexDirection: 'row', alignItems: 'flex-end', height: 68, gap: 4 },
  urgeDayItem: { flex: 1, alignItems: 'center', gap: 4 },
  urgeDayCount: { fontSize: 10, color: '#888', height: 14 },
  urgeDayBarBg: { width: '100%', height: 44, justifyContent: 'flex-end', backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  urgeDayBarFill: { width: '100%', backgroundColor: '#a8d8d0', borderRadius: 4 },
  urgeDayBarHardest: { backgroundColor: '#e07070' },
  urgeDayLabel: { fontSize: 10, color: '#aaa' },
  urgeDayLabelHardest: { color: '#c0392b', fontWeight: '700' },
  urgeDayInsight: { fontSize: 12, color: '#777', textAlign: 'center', marginTop: 2 },

  // Savings rate
  savingsRateBox: { backgroundColor: '#f0fdf9', borderRadius: 10, padding: 12, gap: 4 },
  savingsRateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savingsRateLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  savingsRateValue: { fontSize: 15, fontWeight: '800', color: '#0F6E6E' },
  savingsRateHint: { fontSize: 12, color: '#0a7a4e' },

  // Monthly savings bar chart
  monthBarChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 88 },
  monthBarItem: { flex: 1, alignItems: 'center', gap: 4 },
  monthBarAmt: { fontSize: 9, color: '#0F6E6E', fontWeight: '600', textAlign: 'center', height: 12 },
  monthBarBg: { width: '100%', height: 64, justifyContent: 'flex-end', backgroundColor: '#f5f5f5', borderRadius: 6, overflow: 'hidden' },
  monthBarFill: { width: '100%', backgroundColor: '#a8d8d0', borderRadius: 6 },
  monthBarFillCurrent: { backgroundColor: '#0F6E6E' },
  monthBarLabel: { fontSize: 10, color: '#aaa', textAlign: 'center' },

  // Per-entry trajectory bar chart
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 },
  barItem: { flex: 1, alignItems: 'center', gap: 3 },
  barAmt: { fontSize: 9, color: '#0F6E6E', fontWeight: '600', textAlign: 'center' },
  barBg: { width: '100%', height: 60, justifyContent: 'flex-end', backgroundColor: '#f5f5f5', borderRadius: 4, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: '#1a9a9a', borderRadius: 4 },
  barDate: { fontSize: 9, color: '#aaa', textAlign: 'center' },

  // Personal insights chips
  insightsWrap: { gap: 8 },
  insightChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  insightEmoji: { fontSize: 18 },
  insightText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
