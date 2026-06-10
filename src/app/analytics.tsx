import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function dualTime(days: number): [string, string, string, string] {
  if (days < 7) return [String(days), days === 1 ? 'day' : 'days', '0', 'hrs'];
  if (days < 30) {
    const w = Math.floor(days / 7), d = days % 7;
    return [String(w), w === 1 ? 'week' : 'weeks', String(d), d === 1 ? 'day' : 'days'];
  }
  if (days < 365) {
    const m = Math.floor(days / 30), w = Math.floor((days % 30) / 7);
    return [String(m), m === 1 ? 'month' : 'months', String(w), w === 1 ? 'week' : 'weeks'];
  }
  const y = Math.floor(days / 365), mo = Math.floor((days % 365) / 30);
  return [String(y), y === 1 ? 'year' : 'years', String(mo), mo === 1 ? 'month' : 'months'];
}

// Like dualTime but computes real hours from elapsed milliseconds for sub-7-day display
function heroTime(ms: number): [string, string] {
  const mins  = Math.floor(ms / 60000);
  const hrs   = Math.floor(ms / 3600000);
  const days  = Math.floor(ms / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years  = Math.floor(days / 365);
  if (years  >= 1) return [String(years),  years  === 1 ? 'year'  : 'years'];
  if (months >= 1) return [String(months), months === 1 ? 'month' : 'months'];
  if (weeks  >= 1) return [String(weeks),  weeks  === 1 ? 'week'  : 'weeks'];
  if (days   >= 1) return [String(days),   days   === 1 ? 'day'   : 'days'];
  if (hrs    >= 1) return [String(hrs),    hrs    === 1 ? 'hr'    : 'hrs'];
  return [String(Math.max(0, mins)), 'min'];
}

function fmtDuration(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) { const w = Math.floor(days / 7), d = days % 7; return d > 0 ? `${w}w ${d}d` : `${w}w`; }
  if (days < 365) { const m = Math.floor(days / 30), w = Math.floor((days % 30) / 7); return w > 0 ? `${m}mo ${w}w` : `${m}mo`; }
  const y = Math.floor(days / 365), mo = Math.floor((days % 365) / 30);
  return mo > 0 ? `${y}y ${mo}mo` : `${y}y`;
}


const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MILESTONES = [
  { days: 1,   label: '1 day',    emoji: '🌱' },
  { days: 7,   label: '1 week',   emoji: '⭐' },
  { days: 30,  label: '1 month',  emoji: '🔥' },
  { days: 60,  label: '60 days',  emoji: '🏆' },
  { days: 180, label: '6 months', emoji: '💎' },
  { days: 365, label: '1 year',   emoji: '👑' },
];

const MILESTONE_DESC: Record<string, string> = {
  '1 day':    'The hardest step is always the first. Every single hour counts.',
  '1 week':   'Urge cravings peak in the first few days — you\'re already past the worst of it.',
  '1 month':  'Your brain\'s reward system begins to reset around 30 days. Real change is happening inside.',
  '60 days':  'Sleep quality, mood and focus noticeably improve around this point. People around you notice too.',
  '6 months': 'Research shows 6 months is when new habits become deeply wired. You\'re rewriting who you are.',
  '1 year':   'One full year. You have proven to yourself — and everyone — that this is completely possible.',
};

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
  monthlySavings: { month: string; amount: number }[];
  weekMoods: { date: string; mood: number | null }[];
  relapseCount: number;
  dailySavingsRate: number;
  streakHistory: number[];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={s.sectionHeaderRow}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      </View>
      {action}
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
  const [resettingUrges, setResettingUrges] = useState(false);

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
      ? Math.floor(Math.max(0, Date.now() - parseQuitDate(quitDate).getTime()) / 86400000) : 0;

    const lossRows = lossesRes.data ?? [];
    const savingRows = lossRows.filter(r => r.type === 'saving');
    const relapseRows = lossRows.filter(r => r.type === 'streak_reset');
    const totalSavings = savingRows.reduce((s, r) => s + Number(r.amount), 0);

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
    moodRows.forEach(r => { moodByDate[new Date(r.created_at).toLocaleDateString('en-CA')] = r.mood; });
    const moodLast30 = moodRows.map(r => ({
      date: new Date(r.created_at).toLocaleDateString('en-CA'), mood: r.mood,
    }));
    const checkInDays = Object.keys(moodByDate).length;

    const moodSparkline: (number | null)[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      moodSparkline.push(moodByDate[d.toLocaleDateString('en-CA')] ?? null);
    }

    const today = new Date();
    const sun = new Date(today); sun.setDate(today.getDate() - today.getDay());
    const weekMoods = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun); d.setDate(sun.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: DAY_LABELS[i], mood: moodByDate[key] ?? null };
    });

    const dailySavingsRate = currentStreakDays > 0 ? totalSavings / currentStreakDays : 0;

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
      currency, quitDate,
      longestStreak: streakRes.data?.longest_streak ?? 0,
      currentStreakDays, totalSavings,
      savingsGoal: goalRaw ? Number(goalRaw) : null,
      savingsGoalFor: goalForRaw ?? '',
      savingsGoalIcon: goalIconRaw ?? '🎯',
      totalDebts, totalDebtPaid,
      urgeCount: urgeRows.length, urgesOvercome, urgesByDay,
      moodLast30, moodSparkline, checkInDays,
      monthlySavings, weekMoods,
      relapseCount: relapseRows.length, dailySavingsRate, streakHistory,
    });
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const confirmResetUrges = () => {
    Alert.alert(
      'Reset urge logs',
      'This permanently deletes all your urge journal entries. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !data) return;
            setResettingUrges(true);
            await supabase.from('urge_journal').delete().eq('user_id', user.id);
            setData(prev => prev ? { ...prev, urgeCount: 0, urgesOvercome: 0, urgesByDay: [0, 0, 0, 0, 0, 0, 0] } : prev);
            setResettingUrges(false);
          },
        },
      ]
    );
  };

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

  if (loading) return <View style={s.loadingWrap}><ActivityIndicator color="#0F6E6E" size="large" /></View>;
  if (!data) return null;

  // ── Derived values ─────────────────────────────────────────────────────────

  const goalPct = data.savingsGoal && data.savingsGoal > 0 ? Math.min(1, data.totalSavings / data.savingsGoal) : null;
  const debtPct = data.totalDebts > 0 ? Math.min(1, data.totalDebtPaid / data.totalDebts) : null;
  const avgMoodVal = data.moodLast30.length > 0
    ? data.moodLast30.reduce((s, r) => s + r.mood, 0) / data.moodLast30.length : null;
  const urgeResistPct = data.urgeCount > 0 ? Math.round((data.urgesOvercome / data.urgeCount) * 100) : null;

  const elapsedMs = data.quitDate ? Math.max(0, Date.now() - parseQuitDate(data.quitDate).getTime()) : 0;
  const currentStreakFloat = elapsedMs / 86400000;
  const nextMilestone = MILESTONES.find(m => m.days > currentStreakFloat) ?? null;
  const nextMilestoneIdx = nextMilestone ? MILESTONES.indexOf(nextMilestone) : -1;
  const prevMilestoneDays = nextMilestoneIdx > 0 ? MILESTONES[nextMilestoneIdx - 1].days : 0;
  const milestonePct = nextMilestone
    ? Math.min(1, (currentStreakFloat - prevMilestoneDays) / (nextMilestone.days - prevMilestoneDays)) : 1;

  const maxUrgeCount = Math.max(...data.urgesByDay);
  const maxUrgeDay = data.urgesByDay.indexOf(maxUrgeCount);
  const daysToGoal = goalPct !== null && data.dailySavingsRate > 0 && goalPct < 1
    ? Math.ceil((data.savingsGoal! - data.totalSavings) / data.dailySavingsRate) : null;

  const checkInConsistency = Math.round((data.checkInDays / 30) * 100);
  const streakComponent = Math.min(100, data.currentStreakDays >= 30 ? 100 : Math.round((data.currentStreakDays / 30) * 100));
  const urgeComponent = data.urgeCount > 0 ? (urgeResistPct ?? 0) : 100;
  const moodComponent = avgMoodVal !== null ? Math.round((avgMoodVal / 5) * 100) : 60;
  const healthScore = Math.round(streakComponent * 0.35 + urgeComponent * 0.30 + moodComponent * 0.20 + checkInConsistency * 0.15);
  const healthGrade = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Building' : 'Getting started';
  const healthColor = healthScore >= 80 ? '#0a7a4e' : healthScore >= 60 ? '#0F6E6E' : healthScore >= 40 ? '#d97706' : '#9ca3af';

  const maxMonthSaving = Math.max(0, ...data.monthlySavings.map(m => m.amount));
  const maxStreakHistory = Math.max(1, ...data.streakHistory);
  const isStreakImproving = data.streakHistory.length >= 3 &&
    data.streakHistory[data.streakHistory.length - 1] > data.streakHistory[0];

  const [heroNum, heroLabel] = heroTime(elapsedMs);

  const insights: { emoji: string; text: string; bg: string; tc: string }[] = [];
  if (data.currentStreakDays > 0 && data.currentStreakDays >= data.longestStreak)
    insights.push({ emoji: '🏆', text: 'This is your longest streak ever!', bg: '#fef3c7', tc: '#92400e' });
  if (urgeResistPct !== null && urgeResistPct >= 70)
    insights.push({ emoji: '💪', text: `${urgeResistPct}% urge resistance — keep it up`, bg: '#dcfce7', tc: '#166534' });
  if (avgMoodVal !== null && avgMoodVal >= 3.5)
    insights.push({ emoji: '😊', text: `Average mood ${avgMoodVal.toFixed(1)}/5 — you're doing well`, bg: '#eff6ff', tc: '#1d4ed8' });
  if (data.relapseCount === 0 && data.currentStreakDays >= 7)
    insights.push({ emoji: '🌟', text: 'Clean run — no relapses on record', bg: '#f0fdf4', tc: '#166534' });
  if (maxUrgeCount > 0)
    insights.push({ emoji: '📅', text: `${DAY_LABELS[maxUrgeDay]}s are your most challenging day`, bg: '#fef2f2', tc: '#b91c1c' });
  if (data.dailySavingsRate > 0)
    insights.push({ emoji: '💰', text: `Saving ${fmt(data.dailySavingsRate, data.currency)} per clean day`, bg: '#e6f7f7', tc: '#0F6E6E' });
  if (isStreakImproving)
    insights.push({ emoji: '📈', text: 'Your streaks are getting longer over time', bg: '#f0fdf4', tc: '#166534' });

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
            { emoji: '⏱️', title: 'Live time-based streak hero', desc: 'Weeks · days, months · weeks, years · months — at a glance' },
            { emoji: '🏅', title: 'Milestone progress & badge history', desc: 'Visual badge row, countdown to next badge, motivating context' },
            { emoji: '💚', title: 'Recovery health score', desc: 'One number combining streak, resistance, mood and consistency' },
            { emoji: '📈', title: 'Streak improvement history', desc: 'See how each of your streaks compares over time' },
            { emoji: '😊', title: '30-day mood sparkline', desc: 'Daily colour-coded bars showing your emotional wellbeing' },
            { emoji: '🧠', title: 'Urge pattern by day of week', desc: 'Discover which days you\'re most challenged' },
            { emoji: '💸', title: 'Money not spent + projections', desc: 'Total saved plus what you\'ll save in a day, week, month, year' },
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

        {/* ── Hero ── */}
        <LinearGradient colors={['#0b5252', '#0F6E6E', '#1a9a9a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroCard}>
          <View style={s.heroDualCol}>
            <Text style={s.heroDualNum}>{heroNum}</Text>
            <Text style={s.heroDualLabel}>{heroLabel}</Text>
          </View>
          <Text style={s.heroSubLabel}>without gambling</Text>
          <Text style={s.heroDate}>
            {data.quitDate ? `Since ${parseQuitDate(data.quitDate).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
            {data.relapseCount === 0 ? '  ·  No relapses 🌟' : `  ·  ${data.relapseCount} relapse${data.relapseCount !== 1 ? 's' : ''}`}
          </Text>
          <View style={s.heroDivider} />
          <View style={s.heroStatsRow}>
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{fmtCompact(data.totalSavings, data.currency)}</Text>
              <Text style={s.heroStatLabel}>saved</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{data.urgesOvercome}</Text>
              <Text style={s.heroStatLabel}>urges beat</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{fmtDuration(data.longestStreak)}</Text>
              <Text style={s.heroStatLabel}>best ever</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Milestones ── */}
        {nextMilestone ? (
          <View style={s.card}>
            <SectionHeader title="🏅 Next milestone" />
            <View style={s.msDetailCard}>
              <View style={s.msDetailHeader}>
                <Text style={s.msDetailEmoji}>{nextMilestone.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.msDetailTitle}>{nextMilestone.label}</Text>
                  <Text style={s.msDetailStatus}>
                    {Math.round(milestonePct * 100)}%  ·  {(() => {
                      const daysLeft = Math.max(0, nextMilestone.days - currentStreakFloat);
                      if (daysLeft < 1/24) return '< 1 hour to go';
                      if (daysLeft < 1) return `${Math.round(daysLeft * 24)}h to go`;
                      return `${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) !== 1 ? 's' : ''} to go`;
                    })()}
                  </Text>
                </View>
              </View>
              <View style={s.progressBarBg}>
                <View style={[s.progressBarFill, { width: `${Math.round(milestonePct * 100)}%` as any }]} />
              </View>
              <Text style={s.msDesc}>{MILESTONE_DESC[nextMilestone.label]}</Text>
            </View>
          </View>
        ) : (
          <View style={s.card}>
            <View style={s.msAllEarned}>
              <Text style={s.msAllEarnedText}>👑 You've earned every badge. Incredible commitment.</Text>
            </View>
          </View>
        )}

        {/* ── Recovery Health Score ── */}
        <View style={s.card}>
          <SectionHeader title="💚 Recovery Health Score" />
          <View style={s.healthBarRow}>
            <View style={s.healthBarBg}>
              <View style={[s.healthBarFill, { width: `${healthScore}%` as any, backgroundColor: healthColor }]} />
            </View>
            <Text style={[s.healthScoreNum, { color: healthColor }]}>{healthScore}</Text>
          </View>
          <View style={s.healthGradeRow}>
            <View style={[s.healthGradeBadge, { backgroundColor: healthColor + '1a' }]}>
              <Text style={[s.healthGradeText, { color: healthColor }]}>{healthGrade}</Text>
            </View>
          </View>

          {/* Breakdown */}
          <View style={s.healthBreakdown}>
            <Text style={s.healthBreakdownTitle}>How this is calculated</Text>
            {([
              { label: 'Streak length', weight: 35, score: streakComponent, desc: 'How long you\'ve been clean (30+ days = 100%)' },
              { label: 'Urge resistance', weight: 30, score: urgeComponent, desc: 'Percentage of logged urges you overcame' },
              { label: 'Mood average', weight: 20, score: moodComponent, desc: 'Your average mood rating over the last 30 days' },
              { label: 'Check-in rate', weight: 15, score: checkInConsistency, desc: 'How many days this month you logged your mood' },
            ] as const).map(f => (
              <View key={f.label} style={s.healthFactorRow}>
                <View style={s.healthFactorLeft}>
                  <View style={s.healthFactorLabelRow}>
                    <Text style={s.healthFactorLabel}>{f.label}</Text>
                    <Text style={s.healthFactorWeight}>{f.weight}%</Text>
                  </View>
                  <Text style={s.healthFactorDesc}>{f.desc}</Text>
                </View>
                <Text style={[s.healthFactorScore, { color: healthColor }]}>{f.score}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Streak history ── */}
        {data.streakHistory.length > 1 && (
          <View style={s.card}>
            <SectionHeader title="📈 Streak history" subtitle={isStreakImproving ? 'Getting longer over time ↑' : undefined} />
            <View style={s.streakHistChart}>
              {data.streakHistory.slice(-8).map((days, i, arr) => {
                const isCurrent = i === arr.length - 1;
                const barH = Math.max(6, (days / maxStreakHistory) * 64);
                return (
                  <View key={i} style={s.streakHistItem}>
                    <Text style={[s.streakHistDays, isCurrent && { color: '#0F6E6E' }]}>{fmtDuration(days)}</Text>
                    <View style={s.streakHistBarBg}>
                      <View style={[s.streakHistBarFill, { height: barH }, isCurrent ? s.streakHistBarCurrent : s.streakHistBarPast]} />
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

        {/* ── Urge resistance ── */}
        <View style={s.card}>
          <SectionHeader
            title="🧠 Urge resistance"
            action={
              data.urgeCount > 0 ? (
                <Pressable
                  onPress={confirmResetUrges}
                  style={({ pressed }) => [s.resetLink, pressed && { opacity: 0.5 }]}
                  disabled={resettingUrges}>
                  <Text style={s.resetLinkTxt}>{resettingUrges ? 'Resetting…' : 'Reset logs'}</Text>
                </Pressable>
              ) : undefined
            }
          />
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
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${urgeResistPct ?? 0}%` as any }]} />
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
              <Text style={s.urgeDayInsight}>💡 {DAY_LABELS[maxUrgeDay]}s are your most challenging day</Text>
            </View>
          ) : (
            <Text style={s.urgeDayInsight}>✨ No urges logged yet — keep it up!</Text>
          )}
        </View>

        {/* ── Mood ── */}
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
                    {day.mood !== null ? <Text style={s.weekEmoji}>{MOODS[day.mood - 1]}</Text> : <View style={s.weekDotEmpty} />}
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
                  const bg = mood === null ? '#f0f0f0' : mood >= 4 ? '#1a9a9a' : mood === 3 ? '#7ec8c2' : '#e0a0a0';
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

        {/* ── Savings ── */}
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
                <Text style={s.savingsRateHint}>🎯 Goal in ~{daysToGoal} more day{daysToGoal !== 1 ? 's' : ''} at this pace</Text>
              )}
            </View>
          )}
          {maxMonthSaving > 0 && (
            <>
              <Text style={s.chartCaption}>Monthly savings — last 6 months</Text>
              <View style={s.monthBarChart}>
                {data.monthlySavings.map((item, i) => {
                  const barH = item.amount > 0 ? Math.max(4, (item.amount / maxMonthSaving) * 64) : 4;
                  const isCur = i === data.monthlySavings.length - 1;
                  return (
                    <View key={i} style={s.monthBarItem}>
                      <Text style={s.monthBarAmt}>{item.amount > 0 ? fmtCompact(item.amount, data.currency) : ''}</Text>
                      <View style={s.monthBarBg}>
                        <View style={[s.monthBarFill, { height: barH }, isCur && s.monthBarFillCurrent]} />
                      </View>
                      <Text style={[s.monthBarLabel, isCur && { color: '#0F6E6E', fontWeight: '700' }]}>{item.month}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* ── Money not spent projections ── */}
        {data.dailySavingsRate > 0 && (
          <View style={s.card}>
            <SectionHeader
              title="💸 Money not spent"
              subtitle={`${fmt(data.totalSavings, data.currency)} saved since day one`}
            />
            <View style={s.projGrid}>
              {([
                { label: 'Tomorrow', days: 1 },
                { label: 'This week', days: 7 },
                { label: 'This month', days: 30 },
                { label: 'This year', days: 365 },
              ] as const).map(p => (
                <View key={p.label} style={s.projBox}>
                  <Text style={s.projValue}>+{fmtCompact(data.dailySavingsRate * p.days, data.currency)}</Text>
                  <Text style={s.projLabel}>{p.label}</Text>
                </View>
              ))}
            </View>
            <Text style={s.projCaption}>Projected at your {fmt(data.dailySavingsRate, data.currency)}/day rate</Text>
          </View>
        )}

        {/* ── Debt recovery ── */}
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

        {/* ── Personal insights ── */}
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
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  teaserEmoji: { fontSize: 26, marginTop: 2 },
  teaserText: { flex: 1, gap: 3 },
  teaserTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  teaserDesc: { fontSize: 13, color: '#777', lineHeight: 19 },

  // Hero
  heroCard: {
    borderRadius: 20, padding: 20, alignItems: 'center', gap: 8,
    shadowColor: '#0F6E6E', shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  heroDualRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroDualCol: { alignItems: 'center', gap: 2 },
  heroDualNum: { fontSize: 60, fontWeight: '800', color: '#fff', lineHeight: 66 },
  heroDualLabel: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroDualSep: { fontSize: 28, color: 'rgba(255,255,255,0.4)', marginBottom: 10 },
  heroSubLabel: { fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  heroDate: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  heroDivider: { width: '80%', height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
  heroStatsRow: { flexDirection: 'row', width: '100%' },
  heroStat: { flex: 1, alignItems: 'center', gap: 3 },
  heroStatValue: { fontSize: 16, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  heroStatDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.2)' },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 14 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sectionHeader: { gap: 2, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  sectionSub: { fontSize: 12, color: '#888' },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statsDivider: { width: 1, height: 40, backgroundColor: '#f0f0f0', marginHorizontal: 12 },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
  statSub: { fontSize: 10, color: '#0a7a4e', textAlign: 'center' },

  // Milestones
  msBadgeRow: { flexDirection: 'row', gap: 5 },
  msBadge: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, gap: 5 },
  msBadgeEarned: { backgroundColor: '#e6f7f7' },
  msBadgeNext: { backgroundColor: '#f0fdf9', borderWidth: 2, borderColor: '#1a9a9a' },
  msBadgeLocked: { backgroundColor: '#f5f5f5' },
  msBadgeSelected: { borderWidth: 2, borderColor: '#0F6E6E' },
  msBadgeEmoji: { fontSize: 22 },
  msBadgeCheck: { fontSize: 9, color: '#0F6E6E', fontWeight: '800' },
  msBadgeLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  msBadgeLabelEarned: { color: '#0F6E6E' },
  msBadgeLabelNext: { color: '#0a7a4e' },
  msBadgeLabelLocked: { color: '#ccc' },
  msDetailCard: { backgroundColor: '#f8fffe', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: '#e0f5f5' },
  msDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  msDetailEmoji: { fontSize: 32 },
  msDetailTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  msDetailStatus: { fontSize: 13, color: '#888', marginTop: 2 },
  msDetailStatusEarned: { color: '#0a7a4e', fontWeight: '600' },
  msDesc: { fontSize: 13, color: '#555', lineHeight: 20, fontStyle: 'italic' },
  msAllEarned: { alignItems: 'center', paddingVertical: 8 },
  msAllEarnedText: { fontSize: 14, fontWeight: '600', color: '#0a7a4e', textAlign: 'center' },

  // Health score
  healthBarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  healthBarBg: { flex: 1, height: 14, backgroundColor: '#f0f0f0', borderRadius: 7, overflow: 'hidden' },
  healthBarFill: { height: '100%', borderRadius: 7 },
  healthScoreNum: { fontSize: 22, fontWeight: '800', width: 40, textAlign: 'right' },
  healthGradeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  healthGradeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  healthGradeText: { fontSize: 12, fontWeight: '700' },
  healthBreakdown: { backgroundColor: '#fafafa', borderRadius: 12, padding: 12, gap: 10 },
  healthBreakdownTitle: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  healthFactorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  healthFactorLeft: { flex: 1, gap: 2 },
  healthFactorLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  healthFactorLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
  healthFactorWeight: { fontSize: 11, color: '#aaa', fontWeight: '500' },
  healthFactorDesc: { fontSize: 11, color: '#999', lineHeight: 16 },
  healthFactorScore: { fontSize: 16, fontWeight: '800', width: 34, textAlign: 'right' },

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

  // Reset link
  resetLink: { paddingLeft: 8, paddingTop: 2 },
  resetLinkTxt: { fontSize: 12, color: '#c0392b', fontWeight: '600' },

  // Week mood strip
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDayCol: { alignItems: 'center', gap: 4 },
  weekDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  weekDotToday: { backgroundColor: '#e6f7f7', borderWidth: 1.5, borderColor: '#1a9a9a' },
  weekDotEmpty: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0e0e0' },
  weekEmoji: { fontSize: 20 },
  weekDayLabel: { fontSize: 10, color: '#aaa', fontWeight: '500' },
  weekDayLabelToday: { color: '#0F6E6E', fontWeight: '700' },
  sparklineRow: { flexDirection: 'row', alignItems: 'flex-end', height: 38, gap: 2 },
  sparklineBar: { flex: 1, justifyContent: 'flex-end' },
  sparklineBarFill: { width: '100%', borderRadius: 2 },
  checkInRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkInLabel: { fontSize: 12, color: '#555', fontWeight: '500' },
  checkInValue: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },

  chartCaption: { fontSize: 11, color: '#bbb', textAlign: 'center' },

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

  // Progress bars
  progressBarWrap: { gap: 6 },
  progressBarBg: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#1a9a9a', borderRadius: 4 },
  progressBarDone: { backgroundColor: '#0a7a4e' },
  progressBarPct: { fontSize: 11, color: '#888', textAlign: 'right' },
  goalBarLabel: {},
  goalBarLabelTxt: { fontSize: 12, color: '#555', fontWeight: '600' },

  // Savings
  savingsRateBox: { backgroundColor: '#f0fdf9', borderRadius: 10, padding: 12, gap: 4 },
  savingsRateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savingsRateLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  savingsRateValue: { fontSize: 15, fontWeight: '800', color: '#0F6E6E' },
  savingsRateHint: { fontSize: 12, color: '#0a7a4e' },
  monthBarChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 88 },
  monthBarItem: { flex: 1, alignItems: 'center', gap: 4 },
  monthBarAmt: { fontSize: 9, color: '#0F6E6E', fontWeight: '600', textAlign: 'center', height: 12 },
  monthBarBg: { width: '100%', height: 64, justifyContent: 'flex-end', backgroundColor: '#f5f5f5', borderRadius: 6, overflow: 'hidden' },
  monthBarFill: { width: '100%', backgroundColor: '#a8d8d0', borderRadius: 6 },
  monthBarFillCurrent: { backgroundColor: '#0F6E6E' },
  monthBarLabel: { fontSize: 10, color: '#aaa', textAlign: 'center' },

  // Projections
  projGrid: { flexDirection: 'row', gap: 8 },
  projBox: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: '#f0fdf9', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4 },
  projValue: { fontSize: 14, fontWeight: '800', color: '#0a7a4e' },
  projLabel: { fontSize: 10, color: '#555', fontWeight: '500', textAlign: 'center' },
  projCaption: { fontSize: 11, color: '#bbb', textAlign: 'center' },

  // Insights
  insightsWrap: { gap: 8 },
  insightChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  insightEmoji: { fontSize: 18 },
  insightText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
