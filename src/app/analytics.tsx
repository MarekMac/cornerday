import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

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

function heroTime(ms: number): [string, string] {
  const mins   = Math.floor(ms / 60000);
  const hrs    = Math.floor(ms / 3600000);
  const days   = Math.floor(ms / 86400000);
  const weeks  = Math.floor(days / 7);
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

const MOODS     = ['😞', '😕', '😐', '🙂', '😄'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORT  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TOD_LABELS = ['Morning', 'Afternoon', 'Evening', 'Night'];
const TOD_TIMES  = ['5am–12pm', '12pm–6pm', '6pm–11pm', '11pm–5am'];

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
  '1 week':   "Urge cravings peak in the first few days — you're already past the worst of it.",
  '1 month':  "Your brain's reward system begins to reset around 30 days. Real change is happening inside.",
  '60 days':  'Sleep quality, mood and focus noticeably improve around this point. People around you notice too.',
  '6 months': "Research shows 6 months is when new habits become deeply wired. You're rewriting who you are.",
  '1 year':   'One full year. You have proven to yourself — and everyone — that this is completely possible.',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalDay { iso: string; status: 'clean' | 'relapse' | 'inactive' }

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
  urgesByTimeOfDay: number[];
  moodLast30: { date: string; mood: number }[];
  moodSparkline: (number | null)[];
  checkInDays: number;
  monthlySavings: { month: string; amount: number }[];
  weekMoods: { date: string; mood: number | null }[];
  relapseCount: number;
  dailySavingsRate: number;
  streakHistory: number[];
  calendarDays: CalDay[];
  weekSummary: {
    thisWeek: { urges: number; moodAvg: number | null; checkIns: number };
    lastWeek: { urges: number; moodAvg: number | null; checkIns: number };
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { isPremium, isLoadingPurchases, showPaywall } = usePurchases();
  const { isAdmin } = useUser();
  const hasAccess = isPremium || isAdmin;
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resettingUrges, setResettingUrges] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

    const profile  = profileRes.data;
    const currency = profile?.currency ?? 'USD';
    const quitDate = profile?.quit_timestamp ?? profile?.quit_date ?? null;
    const currentStreakDays = quitDate
      ? Math.floor(Math.max(0, Date.now() - parseQuitDate(quitDate).getTime()) / 86400000) : 0;

    const lossRows    = lossesRes.data ?? [];
    const savingRows  = lossRows.filter(r => r.type === 'saving');
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
    const payRows  = paymentsRes.data ?? [];
    const totalDebts    = debtRows.reduce((s, d) => s + Number(d.total_amount), 0);
    const totalDebtPaid = payRows.reduce((s, p) => s + Number(p.amount), 0);

    const urgeRows     = urgeRes.data ?? [];
    const urgesOvercome = urgeRows.filter(u => u.outcome === 'overcame').length;
    const urgesByDay   = [0, 0, 0, 0, 0, 0, 0];
    urgeRows.forEach(u => { urgesByDay[new Date(u.created_at).getDay()]++; });

    const urgesByTimeOfDay = [0, 0, 0, 0];
    urgeRows.forEach(u => {
      const h = new Date(u.created_at).getHours();
      if (h >= 5 && h < 12)       urgesByTimeOfDay[0]++;
      else if (h >= 12 && h < 18) urgesByTimeOfDay[1]++;
      else if (h >= 18 && h < 23) urgesByTimeOfDay[2]++;
      else                         urgesByTimeOfDay[3]++;
    });

    const moodRows   = moodRes.data ?? [];
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

    // 60-day calendar
    const relapseByDate = new Set<string>(
      relapseRows.map(r => new Date(r.created_at).toLocaleDateString('en-CA'))
    );
    const rawQuit = quitDate ? parseQuitDate(quitDate) : null;
    // Normalize to local midnight — quit_timestamp is a full ISO string (e.g. 14:30 UTC),
    // so comparing local midnight directly would mark today as 'inactive' until that exact time.
    const quitDateObj = rawQuit
      ? new Date(rawQuit.getFullYear(), rawQuit.getMonth(), rawQuit.getDate())
      : null;
    const calendarDays: CalDay[] = [];
    for (let i = 59; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const iso = d.toLocaleDateString('en-CA');
      calendarDays.push({
        iso,
        status: !quitDateObj || d < quitDateObj ? 'inactive' : relapseByDate.has(iso) ? 'relapse' : 'clean',
      });
    }

    // Only count relapses since the current quit date — historical resets before
    // the quit date were from previous attempts and must not distort the current count.
    const currentRelapseCount = quitDateObj
      ? relapseRows.filter(r => {
          const rd = new Date(r.created_at);
          return new Date(rd.getFullYear(), rd.getMonth(), rd.getDate()) >= quitDateObj!;
        }).length
      : relapseRows.length;

    // Week summary
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - today.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86400000);
    const ciKey = (r: { created_at: string }) => new Date(r.created_at).toLocaleDateString('en-CA');
    const thisWkMoods = moodRows.filter(r => new Date(r.created_at) >= startOfThisWeek).map(r => r.mood);
    const lastWkMoods = moodRows.filter(r => { const d = new Date(r.created_at); return d >= startOfLastWeek && d < startOfThisWeek; }).map(r => r.mood);
    const weekSummary = {
      thisWeek: {
        urges: urgeRows.filter(u => new Date(u.created_at) >= startOfThisWeek).length,
        moodAvg: thisWkMoods.length > 0 ? thisWkMoods.reduce((s, m) => s + m, 0) / thisWkMoods.length : null,
        checkIns: new Set(moodRows.filter(r => new Date(r.created_at) >= startOfThisWeek).map(ciKey)).size,
      },
      lastWeek: {
        urges: urgeRows.filter(u => { const d = new Date(u.created_at); return d >= startOfLastWeek && d < startOfThisWeek; }).length,
        moodAvg: lastWkMoods.length > 0 ? lastWkMoods.reduce((s, m) => s + m, 0) / lastWkMoods.length : null,
        checkIns: new Set(moodRows.filter(r => { const d = new Date(r.created_at); return d >= startOfLastWeek && d < startOfThisWeek; }).map(ciKey)).size,
      },
    };

    setData({
      currency, quitDate,
      longestStreak: streakRes.data?.longest_streak ?? 0,
      currentStreakDays, totalSavings,
      savingsGoal: goalRaw ? Number(goalRaw) : null,
      savingsGoalFor: goalForRaw ?? '',
      savingsGoalIcon: goalIconRaw ?? '🎯',
      totalDebts, totalDebtPaid,
      urgeCount: urgeRows.length, urgesOvercome, urgesByDay, urgesByTimeOfDay,
      moodLast30, moodSparkline, checkInDays,
      monthlySavings, weekMoods,
      relapseCount: currentRelapseCount, dailySavingsRate, streakHistory,
      calendarDays, weekSummary,
    });
  }, []);

  useEffect(() => {
    if (isLoadingPurchases) return;
    if (!hasAccess) { setLoading(false); return; }
    fetchData().finally(() => setLoading(false));
  }, [fetchData, hasAccess, isLoadingPurchases]);

  const onRefresh = useCallback(async () => {
    if (!hasAccess) return;
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData, hasAccess]);

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
            setData(prev => prev ? {
              ...prev,
              urgeCount: 0, urgesOvercome: 0,
              urgesByDay: [0, 0, 0, 0, 0, 0, 0],
              urgesByTimeOfDay: [0, 0, 0, 0],
            } : prev);
            setResettingUrges(false);
          },
        },
      ]
    );
  };

  const renderHeader = () => (
    <LinearGradient colors={[c.headerGradStart, c.headerGradEnd]} style={s.header}>
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

  if (loading) return <View style={s.loadingWrap}><ActivityIndicator color={c.primary} size="large" /></View>;
  if (!data) return null;

  // ── Derived values ─────────────────────────────────────────────────────────

  const goalPct    = data.savingsGoal && data.savingsGoal > 0 ? Math.min(1, data.totalSavings / data.savingsGoal) : null;
  const debtPct    = data.totalDebts > 0 ? Math.min(1, data.totalDebtPaid / data.totalDebts) : null;
  const avgMoodVal = data.moodLast30.length > 0
    ? data.moodLast30.reduce((s, r) => s + r.mood, 0) / data.moodLast30.length : null;
  const urgeResistPct = data.urgeCount > 0 ? Math.round((data.urgesOvercome / data.urgeCount) * 100) : null;

  const elapsedMs         = data.quitDate ? Math.max(0, Date.now() - parseQuitDate(data.quitDate).getTime()) : 0;
  const currentStreakFloat = elapsedMs / 86400000;
  const nextMilestone     = MILESTONES.find(m => m.days > currentStreakFloat) ?? null;
  const nextMilestoneIdx  = nextMilestone ? MILESTONES.indexOf(nextMilestone) : -1;
  const prevMilestoneDays = nextMilestoneIdx > 0 ? MILESTONES[nextMilestoneIdx - 1].days : 0;
  const milestonePct      = nextMilestone
    ? Math.min(1, (currentStreakFloat - prevMilestoneDays) / (nextMilestone.days - prevMilestoneDays)) : 1;

  const maxUrgeCount    = Math.max(...data.urgesByDay);
  const maxUrgeDay      = data.urgesByDay.indexOf(maxUrgeCount);
  const daysToGoal      = goalPct !== null && data.dailySavingsRate > 0 && goalPct < 1
    ? Math.ceil((data.savingsGoal! - data.totalSavings) / data.dailySavingsRate) : null;
  const maxMonthSaving   = Math.max(0, ...data.monthlySavings.map(m => m.amount));
  const maxStreakHistory = Math.max(1, ...data.streakHistory);
  const isStreakImproving = data.streakHistory.length >= 3 &&
    data.streakHistory[data.streakHistory.length - 1] > data.streakHistory[0];

  const [heroNum, heroLabel] = heroTime(elapsedMs);

  // Calendar grid — arrange 60 days into week columns
  const firstIso  = data.calendarDays[0]?.iso;
  const firstDate = firstIso ? new Date(firstIso + 'T00:00:00') : new Date(Date.now() - 59 * 86400000);
  const startDow  = firstDate.getDay();
  const paddedCal: (CalDay | null)[] = [...Array(startDow).fill(null), ...data.calendarDays];
  const calWeeks: (CalDay | null)[][] = [];
  for (let i = 0; i < paddedCal.length; i += 7) {
    const chunk = paddedCal.slice(i, i + 7);
    while (chunk.length < 7) chunk.push(null);
    calWeeks.push(chunk);
  }
  let lastCalMonth = -1;
  const calMonthLabels = calWeeks.map(week => {
    const first = week.find(d => d !== null);
    if (!first) return '';
    const d = new Date(first.iso + 'T00:00:00');
    const m = d.getMonth();
    if (m !== lastCalMonth) { lastCalMonth = m; return d.toLocaleDateString('en', { month: 'short' }); }
    return '';
  });
  const cleanDaysCount = data.calendarDays.filter(d => d.status === 'clean').length;

  // Week summary deltas
  const wkUrgesDelta = data.weekSummary.thisWeek.urges - data.weekSummary.lastWeek.urges;
  const wkMoodDelta  = data.weekSummary.thisWeek.moodAvg !== null && data.weekSummary.lastWeek.moodAvg !== null
    ? +(data.weekSummary.thisWeek.moodAvg - data.weekSummary.lastWeek.moodAvg).toFixed(1) : null;
  const wkCiDelta    = data.weekSummary.thisWeek.checkIns - data.weekSummary.lastWeek.checkIns;

  // Time of day
  const maxTodCount = Math.max(1, ...data.urgesByTimeOfDay);
  const hardestTod  = data.urgesByTimeOfDay.indexOf(Math.max(...data.urgesByTimeOfDay));

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
          <ActivityIndicator size="large" color={c.primary} />
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
            { emoji: '⏱️', title: 'Live time-based streak hero', desc: 'Minutes · hours · days · months — at a glance' },
            { emoji: '🏅', title: 'Milestone progress', desc: 'Countdown to your next recovery badge with motivating context' },
            { emoji: '🗓️', title: '60-day clean days calendar', desc: 'A heatmap of every clean day — visually powerful motivation' },
            { emoji: '📊', title: 'Weekly progress summary', desc: 'This week vs last week: urges, mood, and check-ins at a glance' },
            { emoji: '📈', title: 'Streak improvement history', desc: 'See how each of your streaks compares over time' },
            { emoji: '😊', title: '30-day mood sparkline', desc: 'Daily colour-coded bars showing your emotional wellbeing' },
            { emoji: '🧠', title: 'Urge pattern by time & day', desc: "Discover when you're most challenged — morning, evening, weekends" },
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>

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
                      if (daysLeft < 1 / 24) return '< 1 hour to go';
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

        {/* ── 60-day clean calendar ── */}
        <View style={s.card}>
          <SectionHeader
            title="🗓️ Clean days"
            subtitle={`${cleanDaysCount} of last 60 days clean${data.relapseCount > 0 ? `  ·  ${data.relapseCount} relapse${data.relapseCount !== 1 ? 's' : ''}` : '  ·  No relapses 🌟'}`}
          />
          <View style={s.calWrap}>
            <View style={s.calMonthRow}>
              {calWeeks.map((_, wi) => (
                <View key={wi} style={s.calCol}>
                  <Text style={s.calMonthLabel}>{calMonthLabels[wi]}</Text>
                </View>
              ))}
            </View>
            <View style={s.calGrid}>
              {calWeeks.map((week, wi) => (
                <View key={wi} style={s.calCol}>
                  {week.map((day, di) => (
                    <View
                      key={di}
                      style={[
                        s.calDot,
                        day === null       ? s.calDotNull     :
                        day.status === 'clean'   ? s.calDotClean   :
                        day.status === 'relapse' ? s.calDotRelapse :
                        s.calDotInactive,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View style={s.calLegend}>
            <View style={s.calLegendItem}><View style={[s.calDot, s.calDotClean]} /><Text style={s.calLegendTxt}>Clean</Text></View>
            <View style={s.calLegendItem}><View style={[s.calDot, s.calDotRelapse]} /><Text style={s.calLegendTxt}>Relapse</Text></View>
            <View style={s.calLegendItem}><View style={[s.calDot, s.calDotInactive]} /><Text style={s.calLegendTxt}>Before start</Text></View>
          </View>
        </View>

        {/* ── Weekly summary ── */}
        <View style={s.card}>
          <SectionHeader title="📊 This week vs last week" />
          <View style={s.wkRow}>
            <View style={s.wkBlock}>
              <Text style={s.wkBlockLabel}>🧠 Urges</Text>
              <Text style={s.wkBlockVal}>{data.weekSummary.thisWeek.urges}</Text>
              {data.weekSummary.lastWeek.urges > 0 || data.weekSummary.thisWeek.urges > 0 ? (
                <Text style={[s.wkDelta,
                  wkUrgesDelta === 0 ? s.wkDeltaNeutral :
                  wkUrgesDelta < 0 ? s.wkDeltaGood : s.wkDeltaBad]}>
                  {wkUrgesDelta === 0 ? 'same' : `${wkUrgesDelta > 0 ? '+' : ''}${wkUrgesDelta} vs last wk`}
                </Text>
              ) : <Text style={s.wkDeltaNeutral}>no data yet</Text>}
            </View>
            <View style={s.wkDivider} />
            <View style={s.wkBlock}>
              <Text style={s.wkBlockLabel}>😊 Mood avg</Text>
              <Text style={s.wkBlockVal}>
                {data.weekSummary.thisWeek.moodAvg !== null ? data.weekSummary.thisWeek.moodAvg.toFixed(1) : '—'}
              </Text>
              {wkMoodDelta !== null ? (
                <Text style={[s.wkDelta,
                  wkMoodDelta === 0 ? s.wkDeltaNeutral :
                  wkMoodDelta > 0 ? s.wkDeltaGood : s.wkDeltaBad]}>
                  {wkMoodDelta === 0 ? 'same' : `${wkMoodDelta > 0 ? '+' : ''}${wkMoodDelta} vs last wk`}
                </Text>
              ) : <Text style={s.wkDeltaNeutral}>no data yet</Text>}
            </View>
            <View style={s.wkDivider} />
            <View style={s.wkBlock}>
              <Text style={s.wkBlockLabel}>📅 Check-ins</Text>
              <Text style={s.wkBlockVal}>{data.weekSummary.thisWeek.checkIns}</Text>
              {data.weekSummary.lastWeek.checkIns > 0 || data.weekSummary.thisWeek.checkIns > 0 ? (
                <Text style={[s.wkDelta,
                  wkCiDelta === 0 ? s.wkDeltaNeutral :
                  wkCiDelta > 0 ? s.wkDeltaGood : s.wkDeltaBad]}>
                  {wkCiDelta === 0 ? 'same' : `${wkCiDelta > 0 ? '+' : ''}${wkCiDelta} vs last wk`}
                </Text>
              ) : <Text style={s.wkDeltaNeutral}>no data yet</Text>}
            </View>
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
                    <Text style={[s.streakHistDays, isCurrent && { color: c.primary }]}>{fmtDuration(days)}</Text>
                    <View style={s.streakHistBarBg}>
                      <View style={[s.streakHistBarFill, { height: barH }, isCurrent ? s.streakHistBarCurrent : s.streakHistBarPast]} />
                    </View>
                    <Text style={[s.streakHistLabel, isCurrent && { color: c.primary, fontWeight: '700' }]}>
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
            <StatBox label="Overcame" value={`${data.urgesOvercome}`} color={c.success} />
            <View style={s.statsDivider} />
            <StatBox
              label="Success rate"
              value={urgeResistPct !== null ? `${urgeResistPct}%` : '—'}
              color={urgeResistPct !== null && urgeResistPct >= 70 ? c.success : c.textMuted}
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
          {data.urgeCount > 0 && (
            <View style={s.urgeTodWrap}>
              <Text style={s.urgeDayTitle}>By time of day</Text>
              {data.urgesByTimeOfDay.map((count, i) => {
                const barW = count > 0 ? Math.max(4, (count / maxTodCount) * 100) : 4;
                const isHardest = i === hardestTod && count > 0;
                return (
                  <View key={i} style={s.urgeTodRow}>
                    <Text style={[s.urgeTodLabel, isHardest && s.urgeTodLabelHardest]}>{TOD_LABELS[i]}</Text>
                    <View style={s.urgeTodBarBg}>
                      <View style={[s.urgeTodBarFill, { width: `${barW}%` as any }, isHardest && s.urgeTodBarHardest]} />
                    </View>
                    <Text style={[s.urgeTodCount, isHardest && s.urgeTodCountHardest]}>{count}</Text>
                  </View>
                );
              })}
              {data.urgesByTimeOfDay[hardestTod] > 0 && (
                <Text style={s.urgeDayInsight}>💡 {TOD_LABELS[hardestTod]}s ({TOD_TIMES[hardestTod]}) are your peak risk time</Text>
              )}
            </View>
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
                  const h  = mood !== null ? Math.max(4, (mood / 5) * 34) : 4;
                  const bg = mood === null ? c.bgElement : mood >= 4 ? c.primaryMid : mood === 3 ? c.primaryLight : '#e0a0a0';
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
            <StatBox label="Total banked" value={fmt(data.totalSavings, data.currency)} color={c.primary} />
            {goalPct !== null && (
              <>
                <View style={s.statsDivider} />
                <StatBox label="Goal" value={fmtCompact(data.savingsGoal!, data.currency)} />
                <View style={s.statsDivider} />
                <StatBox label="Progress" value={`${Math.round(goalPct * 100)}%`} color={goalPct >= 1 ? c.success : c.primary} />
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
                      <Text style={[s.monthBarLabel, isCur && { color: c.primary, fontWeight: '700' }]}>{item.month}</Text>
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
                { label: 'Tomorrow',   days: 1 },
                { label: 'This week',  days: 7 },
                { label: 'This month', days: 30 },
                { label: 'This year',  days: 365 },
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
              <StatBox label="Total owed"  value={fmt(data.totalDebts, data.currency)} />
              <View style={s.statsDivider} />
              <StatBox label="Paid back"   value={fmt(data.totalDebtPaid, data.currency)} color={c.success} />
              <View style={s.statsDivider} />
              <StatBox label="Remaining"   value={fmt(Math.max(0, data.totalDebts - data.totalDebtPaid), data.currency)} color={c.error} />
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

const makeStyles = (c: AppColors) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: c.bgScreen },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { paddingBottom: 16 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow:   { fontSize: 30, color: c.white, fontWeight: '300', lineHeight: 36 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: c.white, textAlign: 'center' },

  lockScroll: { padding: 20, gap: 12 },
  lockTop:    { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 12 },
  lockEmoji:  { fontSize: 52 },
  lockTitle:  { fontSize: 22, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
  lockDesc:   { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 22 },
  lockBtn:    { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  lockBtnTxt: { color: c.white, fontWeight: '700', fontSize: 16 },
  teaserHeading: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  teaserCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: c.bgCard, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  teaserEmoji: { fontSize: 26, marginTop: 2 },
  teaserText:  { flex: 1, gap: 3 },
  teaserTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
  teaserDesc:  { fontSize: 13, color: c.textMuted, lineHeight: 19 },

  heroCard: {
    borderRadius: 20, padding: 20, alignItems: 'center', gap: 8,
    shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  heroDualCol:      { alignItems: 'center', gap: 2 },
  heroDualNum:      { fontSize: 60, fontWeight: '800', color: c.white, lineHeight: 66 },
  heroDualLabel:    { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroSubLabel:     { fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  heroDate:         { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  heroDivider:      { width: '80%', height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
  heroStatsRow:     { flexDirection: 'row', width: '100%' },
  heroStat:         { flex: 1, alignItems: 'center', gap: 3 },
  heroStatValue:    { fontSize: 16, fontWeight: '800', color: c.white },
  heroStatLabel:    { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  heroStatDivider:  { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.2)' },

  body:        { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },
  card:        { backgroundColor: c.bgCard, borderRadius: 16, padding: 16, gap: 14 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sectionHeader:    { gap: 2, flex: 1 },
  sectionTitle:     { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  sectionSub:       { fontSize: 12, color: c.textMuted },

  statsRow:    { flexDirection: 'row', alignItems: 'center' },
  statsDivider:{ width: 1, height: 40, backgroundColor: c.borderSubtle, marginHorizontal: 12 },
  statBox:     { flex: 1, alignItems: 'center', gap: 2 },
  statValue:   { fontSize: 20, fontWeight: '800', color: c.textPrimary },
  statLabel:   { fontSize: 11, color: c.textMuted, textAlign: 'center' },
  statSub:     { fontSize: 10, color: c.success, textAlign: 'center' },

  msDetailCard:        { backgroundColor: c.bgTealDeep, borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: c.borderTeal },
  msDetailHeader:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  msDetailEmoji:       { fontSize: 32 },
  msDetailTitle:       { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  msDetailStatus:      { fontSize: 13, color: c.textMuted, marginTop: 2 },
  msDesc:              { fontSize: 13, color: c.textBody, lineHeight: 20, fontStyle: 'italic' },
  msAllEarned:         { alignItems: 'center', paddingVertical: 8 },
  msAllEarnedText:     { fontSize: 14, fontWeight: '600', color: c.success, textAlign: 'center' },

  // 60-day calendar
  calWrap:       { gap: 2 },
  calMonthRow:   { flexDirection: 'row' },
  calGrid:       { flexDirection: 'row', gap: 3 },
  calCol:        { flex: 1, gap: 3, alignItems: 'center' },
  calMonthLabel: { fontSize: 9, color: c.textFaint, fontWeight: '600', height: 14, textAlign: 'center' },
  calDot:        { width: 10, height: 10, borderRadius: 2 },
  calDotNull:    { backgroundColor: 'transparent' },
  calDotClean:   { backgroundColor: c.primaryMid },
  calDotRelapse: { backgroundColor: '#e07070' },
  calDotInactive:{ backgroundColor: c.bgElement },
  calLegend:     { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  calLegendTxt:  { fontSize: 11, color: c.textMuted },

  // Weekly summary
  wkRow:         { flexDirection: 'row', alignItems: 'flex-start' },
  wkDivider:     { width: 1, backgroundColor: c.borderSubtle, alignSelf: 'stretch', marginHorizontal: 8 },
  wkBlock:       { flex: 1, alignItems: 'center', gap: 4 },
  wkBlockLabel:  { fontSize: 11, color: c.textMuted, fontWeight: '500', textAlign: 'center' },
  wkBlockVal:    { fontSize: 26, fontWeight: '800', color: c.textPrimary },
  wkDelta:       { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  wkDeltaGood:   { color: c.success },
  wkDeltaBad:    { color: c.error },
  wkDeltaNeutral:{ color: c.textFaint },

  // Streak history
  streakHistChart:      { flexDirection: 'row', alignItems: 'flex-end', height: 92, gap: 6 },
  streakHistItem:       { flex: 1, alignItems: 'center', gap: 4 },
  streakHistDays:       { fontSize: 9, color: c.textMuted, fontWeight: '600', textAlign: 'center' },
  streakHistBarBg:      { width: '100%', height: 64, justifyContent: 'flex-end', backgroundColor: c.bgElement, borderRadius: 6, overflow: 'hidden' },
  streakHistBarFill:    { width: '100%', borderRadius: 6 },
  streakHistBarPast:    { backgroundColor: c.primaryLight },
  streakHistBarCurrent: { backgroundColor: c.primary },
  streakHistLabel:      { fontSize: 9, color: c.textFaint, textAlign: 'center' },
  streakHistInsight:    { fontSize: 12, color: c.success, textAlign: 'center' },

  resetLink:    { paddingLeft: 8, paddingTop: 2 },
  resetLinkTxt: { fontSize: 12, color: c.error, fontWeight: '600' },

  weekRow:           { flexDirection: 'row', justifyContent: 'space-between' },
  weekDayCol:        { alignItems: 'center', gap: 4 },
  weekDot:           { width: 36, height: 36, borderRadius: 18, backgroundColor: c.bgElement, alignItems: 'center', justifyContent: 'center' },
  weekDotToday:      { backgroundColor: c.bgTeal, borderWidth: 1.5, borderColor: c.primaryMid },
  weekDotEmpty:      { width: 8, height: 8, borderRadius: 4, backgroundColor: c.borderLight },
  weekEmoji:         { fontSize: 20 },
  weekDayLabel:      { fontSize: 10, color: c.textFaint, fontWeight: '500' },
  weekDayLabelToday: { color: c.primary, fontWeight: '700' },
  sparklineRow:      { flexDirection: 'row', alignItems: 'flex-end', height: 38, gap: 2 },
  sparklineBar:      { flex: 1, justifyContent: 'flex-end' },
  sparklineBarFill:  { width: '100%', borderRadius: 2 },
  checkInRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkInLabel:      { fontSize: 12, color: c.textBody, fontWeight: '500' },
  checkInValue:      { fontSize: 12, color: c.primary, fontWeight: '700' },
  chartCaption:      { fontSize: 11, color: c.textDisabled, textAlign: 'center' },

  urgeDayWrap:        { gap: 8, backgroundColor: c.bgInput, borderRadius: 12, padding: 12 },
  urgeDayTitle:       { fontSize: 12, fontWeight: '600', color: c.textMuted },
  urgeDayChart:       { flexDirection: 'row', alignItems: 'flex-end', height: 68, gap: 4 },
  urgeDayItem:        { flex: 1, alignItems: 'center', gap: 4 },
  urgeDayCount:       { fontSize: 10, color: c.textMuted, height: 14 },
  urgeDayBarBg:       { width: '100%', height: 44, justifyContent: 'flex-end', backgroundColor: c.bgElement, borderRadius: 4, overflow: 'hidden' },
  urgeDayBarFill:     { width: '100%', backgroundColor: c.primaryLight, borderRadius: 4 },
  urgeDayBarHardest:  { backgroundColor: '#e07070' },
  urgeDayLabel:       { fontSize: 10, color: c.textFaint },
  urgeDayLabelHardest:{ color: c.error, fontWeight: '700' },
  urgeDayInsight:     { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 2 },

  urgeTodWrap:         { gap: 8, backgroundColor: c.bgInput, borderRadius: 12, padding: 12 },
  urgeTodRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urgeTodLabel:        { fontSize: 12, color: c.textMuted, width: 74, fontWeight: '500' },
  urgeTodLabelHardest: { color: c.error, fontWeight: '700' },
  urgeTodBarBg:        { flex: 1, height: 10, backgroundColor: c.bgElement, borderRadius: 5, overflow: 'hidden' },
  urgeTodBarFill:      { height: '100%', backgroundColor: c.primaryLight, borderRadius: 5 },
  urgeTodBarHardest:   { backgroundColor: '#e07070' },
  urgeTodCount:        { fontSize: 12, color: c.textMuted, width: 20, textAlign: 'right', fontWeight: '600' },
  urgeTodCountHardest: { color: c.error },

  progressBarWrap: { gap: 6 },
  progressBarBg:   { height: 8, backgroundColor: c.bgElement, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: c.primaryMid, borderRadius: 4 },
  progressBarDone: { backgroundColor: c.success },
  progressBarPct:  { fontSize: 11, color: c.textMuted, textAlign: 'right' },
  goalBarLabel:    {},
  goalBarLabelTxt: { fontSize: 12, color: c.textBody, fontWeight: '600' },

  savingsRateBox:   { backgroundColor: c.bgTealDeep, borderRadius: 10, padding: 12, gap: 4 },
  savingsRateRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savingsRateLabel: { fontSize: 13, color: c.textBody, fontWeight: '500' },
  savingsRateValue: { fontSize: 15, fontWeight: '800', color: c.primary },
  savingsRateHint:  { fontSize: 12, color: c.success },
  monthBarChart:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 88 },
  monthBarItem:     { flex: 1, alignItems: 'center', gap: 4 },
  monthBarAmt:      { fontSize: 9, color: c.primary, fontWeight: '600', textAlign: 'center', height: 12 },
  monthBarBg:       { width: '100%', height: 64, justifyContent: 'flex-end', backgroundColor: c.bgElement, borderRadius: 6, overflow: 'hidden' },
  monthBarFill:     { width: '100%', backgroundColor: c.primaryLight, borderRadius: 6 },
  monthBarFillCurrent: { backgroundColor: c.primary },
  monthBarLabel:    { fontSize: 10, color: c.textFaint, textAlign: 'center' },

  projGrid:    { flexDirection: 'row', gap: 8 },
  projBox:     { flex: 1, alignItems: 'center', gap: 4, backgroundColor: c.bgTealDeep, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4 },
  projValue:   { fontSize: 14, fontWeight: '800', color: c.success },
  projLabel:   { fontSize: 10, color: c.textBody, fontWeight: '500', textAlign: 'center' },
  projCaption: { fontSize: 11, color: c.textDisabled, textAlign: 'center' },

  insightsWrap: { gap: 8 },
  insightChip:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  insightEmoji: { fontSize: 18 },
  insightText:  { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
