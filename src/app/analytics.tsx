import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseQuitDate } from '@/lib/parseQuitDate';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
  const rounded = Math.round(amount * 100) / 100;
  return `${s}${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtCompact(amount: number, currency = 'USD') {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency;
  if (amount >= 10000) return `${s}${(amount / 1000).toFixed(0)}k`;
  if (amount >= 1000) return `${s}${(amount / 1000).toFixed(1)}k`;
  return `${s}${Math.round(amount)}`;
}

function computeCheckinStreak(rows: { created_at: string }[]): { current: number; best: number } {
  const unique = [...new Set(rows.map(r => new Date(r.created_at).toLocaleDateString('en-CA')))]
    .sort().reverse();
  if (unique.length === 0) return { current: 0, best: 0 };
  const todayStr = new Date().toLocaleDateString('en-CA');
  const yest = new Date(); yest.setDate(yest.getDate() - 1); const yesterStr = yest.toLocaleDateString('en-CA');
  let current = 0;
  if (unique[0] === todayStr || unique[0] === yesterStr) {
    let d = new Date(unique[0] + 'T12:00:00');
    for (const dateStr of unique) {
      if (dateStr === d.toLocaleDateString('en-CA')) { current++; d = new Date(d.getTime() - 86400000); }
      else break;
    }
  }
  let best = 0, run = 1;
  for (let i = 1; i < unique.length; i++) {
    const diff = Math.round((new Date(unique[i - 1] + 'T12:00:00').getTime() - new Date(unique[i] + 'T12:00:00').getTime()) / 86400000);
    if (diff === 1) { run++; } else { best = Math.max(best, run); run = 1; }
  }
  best = Math.max(best, run);
  return { current, best };
}


function heroTime(ms: number): [string, string, string | null, string | null] {
  const mins   = Math.floor(ms / 60000);
  const hrs    = Math.floor(ms / 3600000);
  const days   = Math.floor(ms / 86400000);
  const weeks  = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years  = Math.floor(days / 365);
  if (years  >= 1) { const rem = Math.floor((days % 365) / 30); return [String(years), years === 1 ? 'year' : 'years', rem > 0 ? String(rem) : null, rem > 0 ? (rem === 1 ? 'month' : 'months') : null]; }
  if (months >= 1) { const rem = Math.floor((days % 30) / 7);   return [String(months), months === 1 ? 'month' : 'months', rem > 0 ? String(rem) : null, rem > 0 ? (rem === 1 ? 'week' : 'weeks') : null]; }
  if (weeks  >= 1) { const rem = days % 7;                       return [String(weeks), weeks === 1 ? 'week' : 'weeks', rem > 0 ? String(rem) : null, rem > 0 ? (rem === 1 ? 'day' : 'days') : null]; }
  if (days   >= 1) { const rem = Math.floor((ms % 86400000) / 3600000); return [String(days), days === 1 ? 'day' : 'days', String(rem), rem === 1 ? 'hr' : 'hrs']; }
  if (hrs    >= 1) { const rem = Math.floor((ms % 3600000) / 60000);    return [String(hrs), hrs === 1 ? 'hr' : 'hrs', rem > 0 ? String(rem) : null, rem > 0 ? 'min' : null]; }
  if (mins   >= 1) return [String(mins), 'min', null, null];
  return ['< 1', 'min', null, null];
}

function fmtDuration(days: number): string {
  if (days === 0) return '< 1d';
  if (days < 7) return `${days}d`;
  if (days < 30) { const w = Math.floor(days / 7), d = days % 7; return d > 0 ? `${w}w ${d}d` : `${w}w`; }
  if (days < 365) { const m = Math.floor(days / 30), w = Math.floor((days % 30) / 7); return w > 0 ? `${m}mo ${w}w` : `${m}mo`; }
  const y = Math.floor(days / 365), mo = Math.floor((days % 365) / 30);
  return mo > 0 ? `${y}y ${mo}mo` : `${y}y`;
}

function fmtDurationMs(ms: number): string {
  const days = Math.floor(ms / 86400000);
  const hrs  = Math.floor((ms % 86400000) / 3600000);
  if (days === 0 && hrs === 0) return '< 1h';
  if (days === 0) return `${hrs}h`;
  if (days < 7) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
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
  { days: 1/24,  label: '1 Hour',    emoji: '⏰' },
  { days: 3/24,  label: '3 Hours',   emoji: '🌤️' },
  { days: 6/24,  label: '6 Hours',   emoji: '🌞' },
  { days: 12/24, label: '12 Hours',  emoji: '🌛' },
  { days: 1,     label: '1 Day',     emoji: '🌱' },
  { days: 3,     label: '3 Days',    emoji: '💧' },
  { days: 7,     label: '1 Week',    emoji: '⭐' },
  { days: 10,    label: '10 Days',   emoji: '🌿' },
  { days: 14,    label: '2 Weeks',   emoji: '🌻' },
  { days: 21,    label: '3 Weeks',   emoji: '🎉' },
  { days: 30,    label: '1 Month',   emoji: '🔥' },
  { days: 45,    label: '45 Days',   emoji: '🐣' },
  { days: 60,    label: '2 Months',  emoji: '🏅' },
  { days: 90,    label: '3 Months',  emoji: '🎯' },
  { days: 120,   label: '4 Months',  emoji: '🌊' },
  { days: 150,   label: '5 Months',  emoji: '🦋' },
  { days: 180,   label: '6 Months',  emoji: '💎' },
  { days: 270,   label: '9 Months',  emoji: '🌸' },
  { days: 365,   label: '1 Year',    emoji: '🏆' },
  { days: 548,   label: '18 Months', emoji: '🥇' },
  { days: 730,   label: '2 Years',   emoji: '👑' },
  { days: 1095,  label: '3 Years',   emoji: '🌟' },
  { days: 1825,  label: '5 Years',   emoji: '💫' },
  { days: 3650,  label: '10 Years',  emoji: '🎖️' },
];


// ─── Types ────────────────────────────────────────────────────────────────────

interface CalDay { iso: string; status: 'clean' | 'relapse' | 'inactive' }

interface DebtPacing {
  id: string;
  name: string;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  pct: number;
  isPaidOff: boolean;
  targetDate: Date | null;
  daysRemaining: number | null;
  requiredPerDay: number | null;
  actualPerDay: number | null;
  isAhead: boolean | null;
  projDays: number | null;
  createdAt: Date;
}

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
  debtsWithPacing: DebtPacing[];
  urgeCount: number;
  urgesOvercome: number;
  urgesByDay: number[];
  urgesByTimeOfDay: number[];
  topTriggers: { trigger: string; count: number; overcame: number }[];
  moodLast30: { date: string; mood: number }[];
  moodSparkline: (number | null)[];
  checkInDays: number;
  checkinStreak: { current: number; best: number };
  monthlySavings: { month: string; amount: number }[];
  weekMoods: { date: string; mood: number | null }[];
  relapseCount: number;
  dailySavingsRate: number;
  avgWeeklySpend: number;
  savingsDaysSpan: number;
  streakHistory: { days: number; startDate: string | null }[];
  calendarDays: CalDay[];
  weekSummary: {
    thisWeek: { urges: number; moodAvg: number | null; checkIns: number; savings: number };
    lastWeek: { urges: number; moodAvg: number | null; checkIns: number; savings: number };
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
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingsTargetDate, setSavingsTargetDate] = useState<Date | null>(null);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editTargetDate, setEditTargetDate] = useState(() => new Date(Date.now() + 90 * 86400000));
  const [savingTarget, setSavingTarget] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resettingUrges, setResettingUrges] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async () => {
    setFetchError(false);
    try {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    const [profileRes, streakRes, lossesRes, debtsRes, paymentsRes, urgeRes, moodRes, checkinDatesRes] = await Promise.all([
      supabase.from('users').select('currency, quit_date, quit_timestamp, savings_target_date, savings_goal_amount, savings_goal_label, savings_goal_icon').eq('id', user.id).maybeSingle(),
      supabase.from('streaks').select('current_streak, longest_streak').eq('user_id', user.id).maybeSingle(),
      supabase.from('losses').select('type, amount, created_at').eq('user_id', user.id).neq('type', 'milestone_earned'),
      supabase.from('debts').select('id, name, total_amount, target_date, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('debt_payments').select('debt_id, amount, created_at').eq('user_id', user.id),
      supabase.from('urge_journal').select('outcome, trigger, created_at').eq('user_id', user.id).neq('trigger', 'Relapse'),
      supabase.from('mood_checkins').select('mood, created_at').eq('user_id', user.id).gte('created_at', thirtyDaysAgo).order('created_at', { ascending: true }),
      supabase.from('mood_checkins').select('created_at').eq('user_id', user.id).gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString()).order('created_at', { ascending: false }),
    ]);

    if (profileRes.error || streakRes.error || lossesRes.error || debtsRes.error || paymentsRes.error ||
        urgeRes.error || moodRes.error || checkinDatesRes.error) {
      throw new Error('Failed to load analytics data');
    }

    const [goalRaw, goalForRaw, goalIconRaw] = await Promise.all([
      AsyncStorage.getItem(SAVINGS_GOAL_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
    ]);

    const profile  = profileRes.data;
    const currency = profile?.currency ?? 'USD';
    const quitDate = profile?.quit_timestamp ?? profile?.quit_date ?? null;
    const currentStreakDays = streakRes.data?.current_streak ?? 0;

    const lossRows    = lossesRes.data ?? [];
    const savingRows  = lossRows.filter(r => r.type === 'saving');
    const relapseRows = lossRows.filter(r => r.type === 'streak_reset');
    const totalSavings = savingRows.reduce((s, r) => s + Number(r.amount), 0);

    const firstSavingMs = savingRows.length > 0
      ? Math.min(...savingRows.map(r => new Date(r.created_at).getTime()))
      : 0;
    const savingsDaysSpan = firstSavingMs > 0
      ? Math.max(1, (Date.now() - firstSavingMs) / 86400000)
      : 0;

    const gamblingLossRows = lossRows.filter(r => r.type === 'session');
    const totalLost = gamblingLossRows.reduce((s, r) => s + Number(r.amount), 0);
    const firstLossMs = gamblingLossRows.length > 0
      ? Math.min(...gamblingLossRows.map(r => new Date(r.created_at).getTime()))
      : 0;
    const spanWeeks = firstLossMs > 0 ? Math.max(1, (Date.now() - firstLossMs) / (7 * 86400000)) : 0;
    const avgWeeklySpend = spanWeeks > 0 ? totalLost / spanWeeks : 0;

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
    const totalDebts = debtRows.reduce((s, d) => s + Number(d.total_amount), 0);

    const paidByDebt: Record<string, number> = {};
    payRows.forEach(p => { paidByDebt[p.debt_id] = (paidByDebt[p.debt_id] ?? 0) + Number(p.amount); });
    const totalDebtPaid = Object.values(paidByDebt).reduce((s, v) => s + v, 0);

    const debtsWithPacing: DebtPacing[] = debtRows.map(d => {
      const debtPayments = payRows.filter(p => p.debt_id === d.id);
      const totalPaid = debtPayments.reduce((s, p) => s + Number(p.amount), 0);
      const totalAmount = Number(d.total_amount);
      const remaining = Math.max(0, totalAmount - totalPaid);
      const pct = totalAmount > 0 ? Math.min(1, totalPaid / totalAmount) : 0;
      const isPaidOff = Math.round(remaining * 100) === 0 && totalPaid > 0;
      const targetDate = d.target_date ? new Date(d.target_date + 'T12:00:00') : null;
      const daysRemaining = targetDate ? Math.ceil((targetDate.getTime() - Date.now()) / 86400000) : null;
      const firstPaymentMs = debtPayments.length > 0
        ? Math.min(...debtPayments.map(p => new Date(p.created_at).getTime()))
        : null;
      const daysElapsed = firstPaymentMs !== null
        ? Math.max(1, (Date.now() - firstPaymentMs) / 86400000)
        : null;
      const requiredPerDay = !isPaidOff && daysRemaining && daysRemaining > 0 && remaining > 0
        ? remaining / daysRemaining : null;
      const actualPerDay = totalPaid > 0 && daysElapsed !== null ? totalPaid / daysElapsed : null;
      const isAhead = requiredPerDay !== null && actualPerDay !== null ? actualPerDay >= requiredPerDay : null;
      const projDays = !isPaidOff && actualPerDay && actualPerDay > 0 && remaining > 0
        ? Math.ceil(remaining / actualPerDay) : null;
      return { id: d.id, name: d.name, totalAmount, totalPaid, remaining, pct, isPaidOff,
               targetDate, daysRemaining, requiredPerDay, actualPerDay, isAhead, projDays,
               createdAt: new Date(d.created_at) };
    });

    const urgeRows      = urgeRes.data ?? [];
    const urgesOvercome = urgeRows.filter(u => u.outcome === 'overcame').length;
    const triggerMap: Record<string, { count: number; overcame: number }> = {};
    urgeRows.forEach(u => {
      const t = (u.trigger as string | null)?.trim() || 'Other';
      if (!triggerMap[t]) triggerMap[t] = { count: 0, overcame: 0 };
      triggerMap[t].count++;
      if (u.outcome === 'overcame') triggerMap[t].overcame++;
    });
    const topTriggers = Object.entries(triggerMap)
      .map(([trigger, v]) => ({ trigger, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
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
    moodRows.forEach(r => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      moodByDate[key] = r.mood;
    });
    const moodLast30 = Object.entries(moodByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, mood]) => ({ date, mood }));
    const checkInDays = Object.keys(moodByDate).length;

    const moodSparkline: (number | null)[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const sk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      moodSparkline.push(moodByDate[sk] ?? null);
    }

    const today = new Date();
    const weekMoods = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (6 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: key, mood: moodByDate[key] ?? null };
    });

    const dailySavingsRate = savingsDaysSpan > 0 ? totalSavings / savingsDaysSpan : 0;

    const sortedRelapses = [...relapseRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const streakHistory: { days: number; startDate: string | null }[] = [];
    if (sortedRelapses.length > 0 && quitDate) {
      const firstDays = Math.floor(
        (new Date(sortedRelapses[0].created_at).getTime() - parseQuitDate(quitDate).getTime()) / 86400000
      );
      if (firstDays > 0) streakHistory.push({ days: firstDays, startDate: quitDate });
    }
    for (let i = 1; i < sortedRelapses.length; i++) {
      const gap = Math.floor(
        (new Date(sortedRelapses[i].created_at).getTime() - new Date(sortedRelapses[i - 1].created_at).getTime()) / 86400000
      );
      if (gap > 0) streakHistory.push({ days: gap, startDate: sortedRelapses[i - 1].created_at });
    }
    streakHistory.push({
      days: currentStreakDays,
      startDate: sortedRelapses.length > 0 ? sortedRelapses[sortedRelapses.length - 1].created_at : quitDate,
    });

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
        savings: savingRows.filter(r => new Date(r.created_at) >= startOfThisWeek).reduce((s, r) => s + Number(r.amount), 0),
      },
      lastWeek: {
        urges: urgeRows.filter(u => { const d = new Date(u.created_at); return d >= startOfLastWeek && d < startOfThisWeek; }).length,
        moodAvg: lastWkMoods.length > 0 ? lastWkMoods.reduce((s, m) => s + m, 0) / lastWkMoods.length : null,
        checkIns: new Set(moodRows.filter(r => { const d = new Date(r.created_at); return d >= startOfLastWeek && d < startOfThisWeek; }).map(ciKey)).size,
        savings: savingRows.filter(r => { const d = new Date(r.created_at); return d >= startOfLastWeek && d < startOfThisWeek; }).reduce((s, r) => s + Number(r.amount), 0),
      },
    };

    if (!isMounted.current) return;
    if (profile?.savings_target_date) setSavingsTargetDate(new Date(profile.savings_target_date + 'T12:00:00'));

    setData({
      currency, quitDate,
      longestStreak: streakRes.data?.longest_streak ?? 0,
      currentStreakDays, totalSavings,
      savingsGoal: (() => {
        const n = profile?.savings_goal_amount != null ? Number(profile.savings_goal_amount) : (goalRaw ? Number(goalRaw) : null);
        return n !== null && !isNaN(n) ? n : null;
      })(),
      savingsGoalFor: profile?.savings_goal_label ?? goalForRaw ?? '',
      savingsGoalIcon: profile?.savings_goal_icon ?? goalIconRaw ?? '🎯',
      totalDebts, totalDebtPaid, debtsWithPacing,
      urgeCount: urgeRows.length, urgesOvercome, urgesByDay, urgesByTimeOfDay, topTriggers,
      moodLast30, moodSparkline, checkInDays,
      checkinStreak: computeCheckinStreak(checkinDatesRes.data ?? []),
      monthlySavings, weekMoods,
      relapseCount: currentRelapseCount, dailySavingsRate, avgWeeklySpend, savingsDaysSpan, streakHistory,
      calendarDays, weekSummary,
    });
    } catch (e) {
      console.warn('[analytics] fetchData error:', e);
      if (isMounted.current) setFetchError(true);
    }
  }, []);

  useEffect(() => {
    if (isLoadingPurchases) return;
    if (!hasAccess) { setLoading(false); return; }
    fetchData().finally(() => setLoading(false));
  }, [fetchData, hasAccess, isLoadingPurchases]);

  const onRefresh = useCallback(async () => {
    if (!hasAccess) return;
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
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
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user || !data) return;
              setResettingUrges(true);
              try {
                const { error: urgeDelErr } = await supabase.from('urge_journal').delete().eq('user_id', user.id);
                if (urgeDelErr) {
                  Alert.alert('Could not reset urge logs', urgeDelErr.message);
                  return;
                }
                if (isMounted.current) setData(prev => prev ? {
                  ...prev,
                  urgeCount: 0, urgesOvercome: 0,
                  urgesByDay: [0, 0, 0, 0, 0, 0, 0],
                  urgesByTimeOfDay: [0, 0, 0, 0],
                  topTriggers: [],
                } : prev);
              } finally {
                if (isMounted.current) setResettingUrges(false);
              }
            } catch { /* network error — spinner already cleared by inner finally */ }
          },
        },
      ]
    );
  };

  const saveTargetDate = async (date: Date) => {
    setSavingTarget(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Session expired', 'Please sign in again.'); return; }
      const { error: updateErr } = await supabase.from('users').update({ savings_target_date: date.toISOString().split('T')[0] }).eq('id', user.id);
      if (updateErr) { Alert.alert('Could not save date', updateErr.message); return; }
      if (isMounted.current) { setSavingsTargetDate(date); setShowTargetModal(false); }
    } finally {
      if (isMounted.current) setSavingTarget(false);
    }
  };

  const openTargetPicker = () => {
    const seed = savingsTargetDate ?? new Date(Date.now() + 90 * 86400000);
    setEditTargetDate(seed);
    if (Platform.OS === 'ios') {
      setShowTargetModal(true);
    } else {
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_evt: any, d?: Date) => {
          if (!d) return;
          saveTargetDate(d);
        },
      });
    }
  };

  const renderHeader = () => (
    <LinearGradient colors={[c.headerGradDeep, c.headerGradStart, c.headerGradEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
      <SafeAreaView edges={['top']}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.backArrow}>←</Text>
          </Pressable>
          <Text style={s.headerTitle}>Progress Analytics</Text>
          <View style={s.backBtn} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  if (loading) return (
    <View style={s.root}>
      {renderHeader()}
      <View style={s.loadingWrap}><ActivityIndicator color={c.primary} size="large" /></View>
    </View>
  );

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
    const teaserItems = [
      { emoji: '⏱️', title: 'Live streak hero', desc: 'Precise time without gambling — hours, days, months at a glance' },
      { emoji: '✨', title: 'Personalised insights', desc: 'Auto-generated callouts from your real data — patterns you won\'t see yourself' },
      { emoji: '📊', title: 'Weekly summary', desc: 'Urges, mood, check-ins and savings — this week vs last' },
      { emoji: '😊', title: '30-day mood tracking', desc: 'Daily bars and check-in streak to spot your emotional trends' },
      { emoji: '🧠', title: 'Urge patterns', desc: 'When you\'re most challenged — by day of week and time of day' },
      { emoji: '💰', title: 'Savings + projections', desc: 'Money not spent, plus what you\'ll save this week, month and year' },
      { emoji: '🏦', title: 'Debt recovery pacing', desc: 'Per-debt progress, target dates and a projected debt-free date' },
      { emoji: '⚡', title: 'Trigger breakdown', desc: 'Your top triggers ranked by frequency — and how often you beat them' },
      { emoji: '📅', title: 'Streak history', desc: 'Every streak you\'ve ever had — see how they\'re getting longer' },
    ];
    return (
      <View style={s.root}>
        {renderHeader()}
        <ScrollView contentContainerStyle={s.lockScroll} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['#0b5252', '#0F6E6E', '#1a9a9a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.lockHero}>
            <View style={s.lockIconWrap}>
              <Text style={s.lockEmoji}>📊</Text>
            </View>
            <Text style={s.lockTitle}>Progress Analytics</Text>
            <Text style={s.lockDesc}>
              Deep insights into your recovery — see exactly how far you've come and what's driving your progress.
            </Text>
          </LinearGradient>

          <Pressable style={({ pressed }) => [s.lockBtn, pressed && { opacity: 0.88 }]} onPress={showPaywall}>
            <LinearGradient colors={['#0F6E6E', '#1a9a9a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.lockBtnGradient}>
              <Text style={s.lockBtnTxt}>Unlock Premium</Text>
            </LinearGradient>
          </Pressable>

          <Text style={s.teaserHeading}>What you'll unlock</Text>
          <View style={s.teaserListCard}>
            {teaserItems.map((item, i) => (
              <View key={i} style={[s.teaserRow, i < teaserItems.length - 1 && s.teaserRowBorder]}>
                <View style={s.teaserIconWrap}>
                  <Text style={s.teaserEmoji}>{item.emoji}</Text>
                </View>
                <View style={s.teaserText}>
                  <Text style={s.teaserTitle}>{item.title}</Text>
                  <Text style={s.teaserDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  if (fetchError && !data) {
    return (
      <View style={s.root}>
        {renderHeader()}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, textAlign: 'center' }}>Couldn't load analytics</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21 }}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [{ marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, backgroundColor: c.primary, borderRadius: 20 }, pressed && { opacity: 0.8 }]}
            onPress={() => { if (!hasAccess) return; setLoading(true); fetchData().finally(() => setLoading(false)); }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!data) return null;

  // ── Derived values ─────────────────────────────────────────────────────────

  const goalPct    = data.savingsGoal && data.savingsGoal > 0 ? Math.min(1, data.totalSavings / data.savingsGoal) : null;
  const debtPct    = data.totalDebts > 0 ? Math.min(1, data.totalDebtPaid / data.totalDebts) : null;
  const avgMoodVal = data.moodLast30.length > 0
    ? data.moodLast30.reduce((s, r) => s + r.mood, 0) / data.moodLast30.length : null;
  const urgeResistPct = data.urgeCount > 0 ? Math.round((data.urgesOvercome / data.urgeCount) * 100) : null;

  const elapsedMs         = data.quitDate ? Math.max(0, Date.now() - parseQuitDate(data.quitDate).getTime()) : 0;

  const maxUrgeCount    = Math.max(0, ...data.urgesByDay);
  const maxUrgeDay      = data.urgesByDay.indexOf(maxUrgeCount);
  const daysToGoal      = goalPct !== null && data.dailySavingsRate > 0 && goalPct < 1
    ? Math.ceil((data.savingsGoal! - data.totalSavings) / data.dailySavingsRate) : null;
  const maxMonthSaving   = Math.max(0, ...data.monthlySavings.map(m => m.amount));
  const trueDailyRate    = data.savingsDaysSpan > 0 ? data.totalSavings / data.savingsDaysSpan : 0;
  const weeklySpendRate  = data.avgWeeklySpend > 0 ? data.avgWeeklySpend : trueDailyRate * 7;
  const isStreakImproving = data.streakHistory.length >= 3 &&
    data.streakHistory[data.streakHistory.length - 1].days > data.streakHistory[0].days;

  const [heroNum, heroLabel, heroNum2, heroLabel2] = heroTime(elapsedMs);
  const bestEverMs = (data.quitDate && data.currentStreakDays >= data.longestStreak)
    ? elapsedMs
    : data.longestStreak * 86400000;

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
  const wkUrgesDelta   = data.weekSummary.thisWeek.urges - data.weekSummary.lastWeek.urges;
  const wkMoodDelta    = data.weekSummary.thisWeek.moodAvg !== null && data.weekSummary.lastWeek.moodAvg !== null
    ? +(data.weekSummary.thisWeek.moodAvg - data.weekSummary.lastWeek.moodAvg).toFixed(1) : null;
  const wkCiDelta      = data.weekSummary.thisWeek.checkIns - data.weekSummary.lastWeek.checkIns;
  const wkSavingsDelta = data.weekSummary.thisWeek.savings - data.weekSummary.lastWeek.savings;

  // Time of day
  const maxTodCount = Math.max(0, ...data.urgesByTimeOfDay);
  const hardestTod  = data.urgesByTimeOfDay.indexOf(Math.max(...data.urgesByTimeOfDay));

  const insights: { emoji: string; text: string; bg: string; tc: string }[] = [];
  if (data.currentStreakDays > 0 && data.currentStreakDays >= data.longestStreak)
    insights.push({ emoji: '🏆', text: 'This is your longest streak ever!', bg: '#fef3c7', tc: '#92400e' });
  if (urgeResistPct !== null && data.urgeCount >= 3)
    insights.push({ emoji: '💪', text: `${urgeResistPct}% urge resistance — ${data.urgesOvercome} of ${data.urgeCount} beaten`, bg: c.bgSuccess, tc: c.success });
  if (maxUrgeCount >= 2)
    insights.push({ emoji: '📅', text: `${DAY_LABELS[maxUrgeDay]}s are your most challenging day`, bg: c.bgError, tc: c.textError });
  if (maxTodCount >= 2)
    insights.push({ emoji: '🕐', text: `${TOD_LABELS[hardestTod]} (${TOD_TIMES[hardestTod]}) is your highest-risk window`, bg: '#fff7ed', tc: '#9a3412' });
  if (data.moodLast30.length >= 6) {
    const mid = Math.floor(data.moodLast30.length / 2);
    const earlyAvg  = data.moodLast30.slice(0, mid).reduce((a, r) => a + r.mood, 0) / mid;
    const recentAvg = data.moodLast30.slice(mid).reduce((a, r) => a + r.mood, 0) / (data.moodLast30.length - mid);
    if (recentAvg - earlyAvg >= 0.5)
      insights.push({ emoji: '📈', text: 'Your mood has been climbing — recovery is working', bg: c.bgSuccess, tc: c.success });
    else if (earlyAvg - recentAvg >= 0.5)
      insights.push({ emoji: '📉', text: 'Your mood has dipped lately — lean on your support plan', bg: '#fff7ed', tc: '#9a3412' });
    else if (avgMoodVal !== null && avgMoodVal >= 3.5)
      insights.push({ emoji: '😊', text: `Average mood ${avgMoodVal.toFixed(1)}/5 — you're doing well`, bg: '#eff6ff', tc: '#1d4ed8' });
  }
  if (data.relapseCount === 0 && data.currentStreakDays >= 7)
    insights.push({ emoji: '🌟', text: 'Clean run — no relapses on record', bg: c.bgSuccess, tc: c.success });
  if (data.weekSummary.lastWeek.urges > 2 && data.weekSummary.thisWeek.urges < data.weekSummary.lastWeek.urges)
    insights.push({ emoji: '📉', text: `Fewer urges this week vs last (${data.weekSummary.thisWeek.urges} vs ${data.weekSummary.lastWeek.urges})`, bg: c.bgSuccess, tc: c.success });
  if (data.dailySavingsRate > 0)
    insights.push({ emoji: '💰', text: `Saving ${fmt(data.dailySavingsRate, data.currency)} per clean day`, bg: c.bgTeal, tc: c.primary });
  if (isStreakImproving)
    insights.push({ emoji: '📈', text: 'Your streaks are getting longer over time', bg: c.bgSuccess, tc: c.success });
  if (data.checkinStreak.current >= 7)
    insights.push({ emoji: '🔥', text: `${data.checkinStreak.current}-day check-in streak — showing up every single day`, bg: '#fef9c3', tc: '#92400e' });
  if (data.dailySavingsRate > 0 && data.totalSavings > 0)
    insights.push({ emoji: '💸', text: `On track to save ${fmt(data.dailySavingsRate * 30, data.currency)} this month`, bg: c.bgTeal, tc: c.primary });
  if (cleanDaysCount >= 52)
    insights.push({ emoji: '🗓️', text: `${cleanDaysCount} of your last 60 days were clean — remarkable`, bg: c.bgSuccess, tc: c.success });
  const aheadDebt = data.debtsWithPacing.find(d => !d.isPaidOff && d.isAhead === true);
  if (aheadDebt)
    insights.push({ emoji: '🏦', text: `Ahead of schedule on "${aheadDebt.name}" — great pacing`, bg: c.bgSuccess, tc: c.success });
  if (wkCiDelta > 0)
    insights.push({ emoji: '📆', text: `${wkCiDelta} more check-in${wkCiDelta > 1 ? 's' : ''} this week than last — building momentum`, bg: '#eff6ff', tc: '#1d4ed8' });

  return (
    <View style={s.root}>
      {renderHeader()}
      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>

        {/* ── Hero ── */}
        <LinearGradient colors={['#0b5252', '#0F6E6E', '#1a9a9a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroCard}>
          <View style={s.heroNumRow}>
            <View style={s.heroDualCol}>
              <Text style={[s.heroDualNum, heroNum2 && s.heroDualNumSmall]}>{heroNum}</Text>
              <Text style={s.heroDualLabel}>{heroLabel}</Text>
            </View>
            {heroNum2 && (
              <View style={s.heroDualCol}>
                <Text style={[s.heroDualNum, s.heroDualNumSmall]}>{heroNum2}</Text>
                <Text style={s.heroDualLabel}>{heroLabel2}</Text>
              </View>
            )}
          </View>
          <Text style={s.heroSubLabel}>without gambling</Text>
          <Text style={s.heroDate}>
            {data.quitDate ? `Since ${parseQuitDate(data.quitDate).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
            {data.relapseCount === 0 ? '  ·  No relapses 🌟' : `  ·  ${data.relapseCount} relapse${data.relapseCount !== 1 ? 's' : ''}`}
          </Text>
        </LinearGradient>

        {/* ── Your insights ── */}
        <View style={s.card}>
          <SectionHeader title="💡 Your insights" />
          {insights.length === 0 ? (
            <Text style={s.insightEmpty}>Keep going — patterns will appear as you check in more.</Text>
          ) : (
            <View style={s.insightGap}>
              {insights.map((item, i) => (
                <View key={i} style={[s.insightChip, { backgroundColor: item.bg }]}>
                  <View style={[s.insightAccent, { backgroundColor: item.tc }]} />
                  <Text style={s.insightEmoji}>{item.emoji}</Text>
                  <Text style={[s.insightText, { color: item.tc }]}>{item.text}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Weekly summary ── */}
        <View style={s.card}>
          <SectionHeader title="📊 This week vs last week" />
          <View style={s.wkGrid}>
            <View style={s.wkBlock}>
              <Text style={s.wkBlockLabel}>Urges</Text>
              <Text style={s.wkBlockVal}>{data.weekSummary.thisWeek.urges}</Text>
              <Text style={[s.wkDelta, wkUrgesDelta === 0 ? s.wkDeltaNeutral : wkUrgesDelta < 0 ? s.wkDeltaGood : s.wkDeltaBad]}>
                {wkUrgesDelta === 0 ? '— same' : `${wkUrgesDelta > 0 ? '↑' : '↓'} ${Math.abs(wkUrgesDelta)} vs last wk`}
              </Text>
            </View>
            <View style={s.wkBlock}>
              <Text style={s.wkBlockLabel}>Mood avg</Text>
              <Text style={s.wkBlockVal}>{data.weekSummary.thisWeek.moodAvg !== null ? data.weekSummary.thisWeek.moodAvg.toFixed(1) : '—'}</Text>
              <Text style={[s.wkDelta, wkMoodDelta === null ? s.wkDeltaNeutral : wkMoodDelta === 0 ? s.wkDeltaNeutral : wkMoodDelta > 0 ? s.wkDeltaGood : s.wkDeltaBad]}>
                {wkMoodDelta === null ? '— no data' : wkMoodDelta === 0 ? '— same' : `${wkMoodDelta > 0 ? '↑' : '↓'} ${Math.abs(wkMoodDelta)} vs last wk`}
              </Text>
            </View>
            <View style={s.wkBlock}>
              <Text style={s.wkBlockLabel}>Check-ins</Text>
              <Text style={s.wkBlockVal}>{data.weekSummary.thisWeek.checkIns}</Text>
              <Text style={[s.wkDelta, wkCiDelta === 0 ? s.wkDeltaNeutral : wkCiDelta > 0 ? s.wkDeltaGood : s.wkDeltaBad]}>
                {wkCiDelta === 0 ? '— same' : `${wkCiDelta > 0 ? '↑' : '↓'} ${Math.abs(wkCiDelta)} vs last wk`}
              </Text>
            </View>
            <View style={s.wkBlock}>
              <Text style={s.wkBlockLabel}>Saved</Text>
              <Text style={s.wkBlockVal}>{fmtCompact(data.weekSummary.thisWeek.savings, data.currency)}</Text>
              <Text style={[s.wkDelta, wkSavingsDelta === 0 ? s.wkDeltaNeutral : wkSavingsDelta > 0 ? s.wkDeltaGood : s.wkDeltaBad]}>
                {wkSavingsDelta === 0 ? '— same' : `${wkSavingsDelta > 0 ? '↑' : '↓'} ${fmtCompact(Math.abs(wkSavingsDelta), data.currency)} vs last wk`}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Mood ── */}
        <View style={s.card}>
          <SectionHeader
            title="😊 Mood"
            subtitle={avgMoodVal !== null ? `30-day avg: ${MOODS[Math.round(avgMoodVal) - 1]} ${avgMoodVal.toFixed(1)}/5` : undefined}
          />
          <View style={s.weekRow}>
            {data.weekMoods.map((day, i) => {
              const d = new Date(); d.setDate(d.getDate() - (6 - i));
              const dayLabel = d.toLocaleDateString([], { weekday: 'short' }).slice(0, 2);
              const isToday = i === 6;
              return (
                <View key={i} style={s.weekDayCol}>
                  <View style={[s.weekDot, isToday && s.weekDotToday]}>
                    {day.mood !== null ? <Text style={s.weekEmoji}>{MOODS[day.mood - 1]}</Text> : <View style={s.weekDotEmpty} />}
                  </View>
                  <Text style={[s.weekDayLabel, isToday && s.weekDayLabelToday]}>{dayLabel}</Text>
                </View>
              );
            })}
          </View>
          {data.moodSparkline.some(v => v !== null) && (
            <>
              <View style={s.sparklineRow}>
                {data.moodSparkline.map((mood, i) => {
                  const h  = mood !== null ? Math.max(4, (mood / 5) * 34) : 4;
                  const bg = mood === null ? c.bgElement : mood >= 4 ? c.primaryMid : mood === 3 ? c.primaryLight : c.textError;
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
            <Text style={s.checkInLabel}>Check-ins this month</Text>
            <Text style={s.checkInValue}>
              {data.checkInDays}/30{data.checkinStreak.current > 0 ? `  ·  🔥 ${data.checkinStreak.current}d streak` : ''}
            </Text>
          </View>
          <View style={s.progressBarBg}>
            <View style={[s.progressBarFill, { width: `${Math.min(100, Math.round((data.checkInDays / 30) * 100))}%` as any }]} />
          </View>
        </View>

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
          {maxUrgeCount > 0 ? (
            <View style={s.urgeDayWrap}>
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
            </View>
          ) : (
            <Text style={s.urgeDayInsight}>✨ No urges logged yet — keep it up!</Text>
          )}
          {data.urgeCount > 0 && maxTodCount > 0 && (
            <View style={s.urgeTodWrap}>
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
            </View>
          )}
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
          {weeklySpendRate > 0 && (
            <View style={s.projSection}>
              <Text style={s.projSectionTitle}>📈 Projected from savings rate</Text>
              <View style={s.projGrid}>
                {([
                  { label: 'This week',  weeks: 1 },
                  { label: 'This month', weeks: 4.3 },
                  { label: '3 months',   weeks: 13 },
                  { label: 'This year',  weeks: 52 },
                ] as const).map(p => (
                  <View key={p.label} style={s.projBox}>
                    <Text style={s.projValue}>+{fmtCompact(weeklySpendRate * p.weeks, data.currency)}</Text>
                    <Text style={s.projLabel}>{p.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.projCaption}>
                {data.avgWeeklySpend > 0
                  ? `Based on your avg ${fmtCompact(data.avgWeeklySpend, data.currency)}/week gambling spend`
                  : `Based on your avg ${fmtCompact(trueDailyRate, data.currency)}/day savings rate`}
              </Text>
            </View>
          )}
        </View>

        {/* ── Debt recovery ── */}
        {data.debtsWithPacing.length > 0 && (
          <View style={s.card}>
            <SectionHeader title="🏦 Debt recovery" />
            {/* Aggregate summary */}
            <View style={s.statsRow}>
              <StatBox label="Total owed"  value={fmt(data.totalDebts, data.currency)} />
              <View style={s.statsDivider} />
              <StatBox label="Paid back"   value={fmt(data.totalDebtPaid, data.currency)} color={c.success} />
              <View style={s.statsDivider} />
              <StatBox label="Remaining"   value={fmt(Math.max(0, data.totalDebts - data.totalDebtPaid), data.currency)} color={data.totalDebtPaid >= data.totalDebts ? c.success : c.error} />
            </View>
            {debtPct !== null && (
              <View style={s.progressBarWrap}>
                <View style={s.progressBarBg}>
                  <View style={[s.progressBarFill, { width: `${Math.round(debtPct * 100)}%` as any }, debtPct >= 1 && s.progressBarDone]} />
                </View>
                <Text style={s.progressBarPct}>{Math.round(debtPct * 100)}% repaid across all debts</Text>
              </View>
            )}
            {/* Aggregate debt-free projection */}
            {(() => {
              const active = data.debtsWithPacing.filter(d => !d.isPaidOff && (d.actualPerDay ?? 0) > 0);
              if (active.length === 0) return null;
              const totalRemaining = active.reduce((sum, d) => sum + d.remaining, 0);
              const combinedRate = active.reduce((sum, d) => sum + (d.actualPerDay ?? 0), 0);
              if (combinedRate <= 0 || totalRemaining <= 0) return null;
              const projDays = Math.ceil(totalRemaining / combinedRate);
              const projDate = new Date(Date.now() + projDays * 86400000);
              return (
                <View style={s.debtFreeCard}>
                  <Text style={s.debtFreeEmoji}>🏁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.debtFreeLabel}>Projected debt-free</Text>
                    <Text style={s.debtFreeDate}>{projDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}</Text>
                    <Text style={s.debtFreeSub}>~{fmtDuration(projDays)} at current pace · {fmt(combinedRate * 30, data.currency)}/mo avg</Text>
                  </View>
                </View>
              );
            })()}
            {/* Per-debt breakdown */}
            {data.debtsWithPacing.map(debt => (
              <View key={debt.id} style={s.debtItem}>
                <View style={s.debtItemHeader}>
                  <Text style={s.debtItemName} numberOfLines={1}>{debt.isPaidOff ? '✓ ' : ''}{debt.name}</Text>
                  <Text style={[s.debtItemTotal, debt.isPaidOff && { color: c.success }]}>
                    {fmt(debt.totalAmount, data.currency)}
                  </Text>
                </View>
                <View style={s.debtItemBarBg}>
                  <View style={[s.debtItemBarFill, {
                    width: `${Math.round(debt.pct * 100)}%` as any,
                    backgroundColor: debt.isPaidOff ? c.success : debt.pct >= 0.7 ? c.primaryMid : debt.pct >= 0.3 ? c.warn : c.error,
                  }]} />
                </View>
                <Text style={[s.debtItemPct, debt.isPaidOff && { color: c.success }]}>
                  {debt.isPaidOff
                    ? 'Fully paid off 🎉'
                    : `${Math.round(debt.pct * 100)}% · ${fmt(debt.remaining, data.currency)} left`}
                </Text>
                {!debt.isPaidOff && (
                  <View style={s.debtPacingBox}>
                    {debt.targetDate ? (
                      <>
                        <View style={s.debtPacingRow}>
                          <Text style={s.debtPacingLbl}>Target</Text>
                          <Text style={s.debtPacingVal}>
                            {debt.targetDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                            {debt.daysRemaining !== null && (
                              <Text style={{ color: (debt.daysRemaining ?? 1) <= 0 ? c.error : c.textMuted }}>
                                {(debt.daysRemaining ?? 0) > 0 ? `  ·  ${debt.daysRemaining}d left` : '  ·  Past target'}
                              </Text>
                            )}
                          </Text>
                        </View>
                        {debt.requiredPerDay !== null && (
                          <View style={s.debtPacingRow}>
                            <Text style={s.debtPacingLbl}>Need</Text>
                            <Text style={s.debtPacingVal}>{fmt(debt.requiredPerDay, data.currency)}/day</Text>
                          </View>
                        )}
                        {debt.actualPerDay !== null && (
                          <View style={s.debtPacingRow}>
                            <Text style={s.debtPacingLbl}>Pace</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={s.debtPacingVal}>{fmt(debt.actualPerDay, data.currency)}/day</Text>
                              {debt.isAhead !== null && (
                                <View style={[s.pacingBadge, { backgroundColor: debt.isAhead ? c.success : c.error }]}>
                                  <Text style={s.pacingBadgeTxt}>{debt.isAhead ? '▲ Ahead' : '▼ Behind'}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        )}
                        {debt.projDays !== null && (
                          <View style={s.debtPacingRow}>
                            <Text style={s.debtPacingLbl}>Projected</Text>
                            <Text style={s.debtPacingVal}>
                              {new Date(Date.now() + debt.projDays * 86400000).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                              {' '}({debt.projDays}d)
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={s.debtPacingHint}>
                        {debt.projDays !== null
                          ? `📅 Est. payoff at current pace: ${new Date(Date.now() + debt.projDays * 86400000).toLocaleDateString([], { month: 'short', year: 'numeric' })}`
                          : 'No payments yet'}
                      </Text>
                    )}
                  </View>
                )}
                {/* Payoff timeline chart */}
                {!debt.isPaidOff && debt.projDays !== null && (() => {
                  const startMs = debt.createdAt.getTime();
                  const projMs = Date.now() + debt.projDays * 86400000;
                  const spanMs = projMs - startMs;
                  if (spanMs <= 0) return null;
                  const elapsedPct = Math.min(97, Math.max(3, Math.round(((Date.now() - startMs) / spanMs) * 100)));
                  return (
                    <View style={s.debtTimeline}>
                      <Text style={s.debtTimelineTitle}>Payoff timeline</Text>
                      <View style={s.debtTimelineTrack}>
                        <View style={{ flex: elapsedPct, backgroundColor: c.primaryMid, borderRadius: 3 }} />
                        <View style={{ flex: 100 - elapsedPct, backgroundColor: c.bgElement, borderRadius: 3 }} />
                      </View>
                      <View style={s.debtTimelineDates}>
                        <Text style={s.debtTimelineDateL}>{debt.createdAt.toLocaleDateString([], { month: 'short', year: '2-digit' })}</Text>
                        <Text style={s.debtTimelineDateC}>Today</Text>
                        <Text style={s.debtTimelineDateR}>{new Date(projMs).toLocaleDateString([], { month: 'short', year: '2-digit' })}</Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            ))}
            <Text style={s.debtTargetHint}>Set target dates per debt in the Loss Tracker</Text>
          </View>
        )}

        {/* ── Triggers breakdown ── */}
        {data.topTriggers.length > 0 && (
          <View style={s.card}>
            <SectionHeader title="⚡ Your triggers" subtitle={`${data.urgeCount} urge${data.urgeCount !== 1 ? 's' : ''} logged`} />
            {(() => {
              const maxCount = Math.max(...data.topTriggers.map(t => t.count), 1);
              return data.topTriggers.map((item, i) => {
                const freqPct = Math.round((item.count / maxCount) * 100);
                const winPct  = item.count > 0 ? Math.round((item.overcame / item.count) * 100) : 0;
                const barColor = winPct >= 70 ? c.success : winPct >= 40 ? c.warn : c.error;
                return (
                  <View key={i} style={s.triggerRow}>
                    <View style={s.triggerLabelRow}>
                      <Text style={s.triggerName}>{item.trigger}</Text>
                      <Text style={s.triggerMeta}>{item.count}× · {winPct}% beaten</Text>
                    </View>
                    <View style={s.progressBarBg}>
                      <View style={[s.progressBarFill, { width: `${freqPct}%` as any, backgroundColor: barColor }]} />
                    </View>
                  </View>
                );
              });
            })()}
          </View>
        )}

        {/* ── Streak history ── */}
        {data.quitDate !== null && (
          <View style={s.card}>
            <SectionHeader
              title="📅 Streak history"
              subtitle={
                data.streakHistory.length === 1
                  ? 'First attempt — no relapses'
                  : `${data.streakHistory.length} attempts · ${data.streakHistory.length - 1} relapse${data.streakHistory.length - 1 !== 1 ? 's' : ''}`
              }
            />

            {data.streakHistory.length === 1 ? (
              <View style={s.streakSingle}>
                <View style={s.streakSingleBar} />
                <Text style={s.streakSingleDays}>{fmtDuration(data.streakHistory[0].days)}</Text>
                <Text style={s.streakSingleSub}>No relapses on record 🌟</Text>
              </View>
            ) : (
              <>
                {(() => {
                  const maxDays = Math.max(...data.streakHistory.map(h => h.days), 1);
                  const rows = data.streakHistory.map((entry, i) => {
                    const isCurrent = i === data.streakHistory.length - 1;
                    const isLongest = entry.days === maxDays;
                    const barPct = Math.max(4, Math.round((entry.days / maxDays) * 100));
                    const startLabel = entry.startDate
                      ? new Date(entry.startDate).toLocaleDateString([], { month: 'short', year: '2-digit' })
                      : null;
                    return (
                      <View key={i} style={[s.streakHistRow, isCurrent && s.streakHistRowCurrent]}>
                        <Text style={[s.streakHistLabel, isCurrent && s.streakHistLabelCurrent]}>
                          {isCurrent ? 'Now' : `#${i + 1}`}
                        </Text>
                        <View style={s.streakHistBarWrap}>
                          <View style={s.streakHistBarTrack}>
                            <View style={[s.streakHistBarFill, { width: `${barPct}%` as any }, isCurrent && s.streakHistBarCurrent]} />
                          </View>
                          {startLabel && <Text style={s.streakHistDate}>{startLabel}</Text>}
                        </View>
                        <View style={s.streakHistEnd}>
                          <Text style={[s.streakHistDays, isCurrent && s.streakHistDaysCurrent]}>
                            {fmtDuration(entry.days)}
                          </Text>
                          {isLongest && <Text style={s.streakHistStar}>★</Text>}
                        </View>
                      </View>
                    );
                  });
                  return (
                    <ScrollView
                      style={s.streakHistScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}>
                      {rows}
                    </ScrollView>
                  );
                })()}
                {(() => {
                  const current = data.streakHistory[data.streakHistory.length - 1].days;
                  const prevBest = Math.max(...data.streakHistory.slice(0, -1).map(h => h.days));
                  if (current >= prevBest) {
                    return (
                      <View style={s.streakImproveChip}>
                        <Text style={s.streakImproveText}>🏆 Your longest streak yet — keep going</Text>
                      </View>
                    );
                  }
                  if (data.streakHistory.length >= 2 && current > data.streakHistory[data.streakHistory.length - 2].days) {
                    return (
                      <View style={s.streakImproveChip}>
                        <Text style={s.streakImproveText}>📈 Longer than your last attempt — trending up</Text>
                      </View>
                    );
                  }
                  return null;
                })()}
              </>
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* iOS target date picker modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showTargetModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Savings target date</Text>
              <DateTimePicker
                value={editTargetDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_evt: any, d?: Date) => d && setEditTargetDate(new Date(d.getTime()))}
                style={{ height: 200 }}
              />
              <View style={s.modalActions}>
                <Pressable style={s.modalBtn} onPress={() => setShowTargetModal(false)}>
                  <Text style={s.modalBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.modalBtn, s.modalBtnSave, savingTarget && { opacity: 0.5 }]}
                  disabled={savingTarget}
                  onPress={() => saveTargetDate(editTargetDate)}>
                  <Text style={s.modalBtnSaveTxt}>{savingTarget ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (c: AppColors) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: c.bgScreen },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { paddingBottom: 20 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow:   { fontSize: 22, color: c.white, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: c.white, textAlign: 'center' },

  lockScroll:    { flexGrow: 1 },
  lockHero:      { margin: 16, borderRadius: 20, padding: 24, alignItems: 'center', gap: 10 },
  lockIconWrap:  { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  lockEmoji:     { fontSize: 36 },
  lockTitle:     { fontSize: 22, fontWeight: '800', color: '#ffffff', textAlign: 'center', letterSpacing: -0.3 },
  lockDesc:      { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 21 },
  lockBtn:       { marginHorizontal: 16, marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
  lockBtnGradient: { paddingVertical: 16, alignItems: 'center' },
  lockBtnTxt:    { color: '#ffffff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  teaserHeading: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingHorizontal: 16 },
  teaserListCard: {
    marginHorizontal: 16, backgroundColor: c.bgCard, borderRadius: 18, padding: 4, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  teaserRow:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  teaserRowBorder: { borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  teaserIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center' },
  teaserEmoji:   { fontSize: 22 },
  teaserText:    { flex: 1, gap: 3 },
  teaserTitle:   { fontSize: 14, fontWeight: '700', color: c.textPrimary },
  teaserDesc:    { fontSize: 13, color: c.textMuted, lineHeight: 18 },

  heroCard: {
    borderRadius: 20, padding: 20, alignItems: 'center', gap: 8,
    shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  heroNumRow:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroDualCol:      { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  heroDualNum:      { fontSize: 58, fontWeight: '800', color: c.white, lineHeight: 64 },
  heroDualNumSmall: { fontSize: 42, lineHeight: 48 },
  heroDualLabel:    { fontSize: 20, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  heroSubLabel:     { fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  heroDate:         { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  heroDivider:      { width: '80%', height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
  heroStatsRow:     { flexDirection: 'row', width: '100%' },
  heroStat:         { flex: 1, alignItems: 'center', gap: 3 },
  heroStatValue:    { fontSize: 16, fontWeight: '800', color: c.white },
  heroStatLabel:    { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  heroStatDivider:  { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.2)' },

  body:        { flex: 1 },
  bodyContent: { padding: 16, gap: 14 },
  card:        { backgroundColor: c.bgCard, borderRadius: 16, padding: 20, gap: 16 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sectionHeader:    { gap: 2, flex: 1 },
  sectionTitle:     { fontSize: 15, fontWeight: '700', color: c.textPrimary, letterSpacing: 0.1 },
  sectionSub:       { fontSize: 12, color: c.textMuted, marginTop: 2 },

  statsRow:    { flexDirection: 'row', alignItems: 'center' },
  statsDivider:{ width: StyleSheet.hairlineWidth, height: 36, backgroundColor: c.borderSubtle, marginHorizontal: 10 },
  statBox:     { flex: 1, alignItems: 'center', gap: 3 },
  statValue:   { fontSize: 22, fontWeight: '800', color: c.textPrimary },
  statLabel:   { fontSize: 11, color: c.textMuted, textAlign: 'center' },
  statSub:     { fontSize: 10, color: c.success, textAlign: 'center' },

  insightGap:   { gap: 8 },
  insightChip:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12 },
  insightAccent:{ width: 3, alignSelf: 'stretch', borderRadius: 2 },
  insightEmoji: { fontSize: 16 },
  insightText:  { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19, color: c.textPrimary },
  insightEmpty: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },


  // 60-day calendar
  calWrap:       { gap: 2 },
  calMonthRow:   { flexDirection: 'row' },
  calGrid:       { flexDirection: 'row', gap: 3 },
  calCol:        { flex: 1, gap: 3, alignItems: 'center' },
  calMonthLabel: { fontSize: 9, color: c.textFaint, fontWeight: '600', height: 14, textAlign: 'center' },
  calDot:        { width: 10, height: 10, borderRadius: 2 },
  calDotNull:    { backgroundColor: 'transparent' },
  calDotClean:   { backgroundColor: c.primaryMid },
  calDotRelapse: { backgroundColor: c.error },
  calDotInactive:{ backgroundColor: c.bgElement },
  calLegend:     { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  calLegendTxt:  { fontSize: 11, color: c.textMuted },

  // Weekly summary
  wkGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wkBlock:       { width: '47%', alignItems: 'center', gap: 4, backgroundColor: c.bgInput, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8 },
  wkBlockLabel:  { fontSize: 11, color: c.textMuted, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  wkBlockVal:    { fontSize: 26, fontWeight: '800', color: c.textPrimary },
  wkDelta:       { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  wkDeltaGood:   { color: c.success },
  wkDeltaBad:    { color: c.error },
  wkDeltaNeutral:{ color: c.textFaint },


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
  checkInRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkInLabel:         { fontSize: 12, color: c.textBody, fontWeight: '500' },
  checkInValue:         { fontSize: 12, color: c.primary, fontWeight: '700' },
  chartCaption:      { fontSize: 11, color: c.textFaint, textAlign: 'center', marginTop: -4 },

  urgeDayWrap:        { gap: 10, marginTop: 16, marginBottom: 8 },
  urgeDayChart:       { flexDirection: 'row', alignItems: 'flex-end', height: 68, gap: 4 },
  urgeDayItem:        { flex: 1, alignItems: 'center', gap: 4 },
  urgeDayCount:       { fontSize: 10, color: c.textMuted, height: 14 },
  urgeDayBarBg:       { width: '100%', height: 44, justifyContent: 'flex-end', backgroundColor: c.bgElement, borderRadius: 4, overflow: 'hidden' },
  urgeDayBarFill:     { width: '100%', backgroundColor: c.primaryLight, borderRadius: 4 },
  urgeDayBarHardest:  { backgroundColor: c.error },
  urgeDayLabel:       { fontSize: 10, color: c.textFaint },
  urgeDayLabelHardest:{ color: c.error, fontWeight: '700' },
  urgeDayInsight:     { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 2 },

  urgeTodWrap:         { gap: 10 },
  urgeTodRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urgeTodLabel:        { fontSize: 12, color: c.textMuted, width: 74, fontWeight: '500' },
  urgeTodLabelHardest: { color: c.error, fontWeight: '700' },
  urgeTodBarBg:        { flex: 1, height: 10, backgroundColor: c.bgElement, borderRadius: 5, overflow: 'hidden' },
  urgeTodBarFill:      { height: '100%', backgroundColor: c.primaryLight, borderRadius: 5 },
  urgeTodBarHardest:   { backgroundColor: c.error },
  urgeTodCount:        { fontSize: 12, color: c.textMuted, width: 20, textAlign: 'right', fontWeight: '600' },
  urgeTodCountHardest: { color: c.error },

  progressBarWrap: { gap: 6 },
  progressBarBg:   { height: 10, backgroundColor: c.bgElement, borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: c.primaryMid, borderRadius: 5 },
  progressBarDone: { backgroundColor: c.success },
  progressBarPct:  { fontSize: 11, color: c.textMuted, textAlign: 'right' },

  triggerRow:      { gap: 6 },
  triggerLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  triggerName:     { fontSize: 14, fontWeight: '600', color: c.textPrimary, flex: 1 },
  triggerMeta:     { fontSize: 12, color: c.textMuted, fontWeight: '500' },

  goalBarLabel:    {},
  goalBarLabelTxt: { fontSize: 12, color: c.textBody, fontWeight: '600' },

  savingsRateBox:   { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderSubtle, paddingTop: 14, gap: 4 },
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

  projSection:      { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderSubtle, paddingTop: 14, gap: 10 },
  projSectionTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
  projGrid:    { flexDirection: 'row', gap: 8 },
  projBox:     { flex: 1, alignItems: 'center', gap: 4, backgroundColor: c.bgTealDeep, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4 },
  projValue:   { fontSize: 14, fontWeight: '800', color: c.success },
  projLabel:   { fontSize: 10, color: c.textBody, fontWeight: '500', textAlign: 'center' },
  projCaption: { fontSize: 11, color: c.textDisabled, textAlign: 'center' },


  setTargetBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.bgTeal, borderRadius: 8 },
  setTargetTxt: { fontSize: 12, fontWeight: '600', color: c.primary },

  pacingBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pacingBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Per-debt breakdown
  debtItem:        { borderTopWidth: 1, borderTopColor: c.bgElement, paddingTop: 12, gap: 6 },
  debtItemHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  debtItemName:    { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary, marginRight: 8 },
  debtItemTotal:   { fontSize: 13, fontWeight: '600', color: c.textMuted },
  debtItemBarBg:   { height: 6, backgroundColor: c.bgElement, borderRadius: 3, overflow: 'hidden' },
  debtItemBarFill: { height: '100%', borderRadius: 3 },
  debtItemPct:     { fontSize: 11, color: c.textMuted, fontWeight: '500' },
  debtPacingBox:   { gap: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.bgElement },
  debtPacingRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  debtPacingLbl:   { fontSize: 11, color: c.textMuted, fontWeight: '500' },
  debtPacingVal:   { fontSize: 12, color: c.textPrimary, fontWeight: '600' },
  debtPacingHint:  { fontSize: 11, color: c.textMuted, fontStyle: 'italic' },
  debtTargetHint:  { fontSize: 11, color: c.textFaint, textAlign: 'center', marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle:   { fontSize: 16, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalBtn:     { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: c.bgElement },
  modalBtnSave: { backgroundColor: c.primary },
  modalBtnCancel: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  modalBtnSaveTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Aggregate debt-free projection
  debtFreeCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.bgSuccess, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: c.success },
  debtFreeEmoji: { fontSize: 26 },
  debtFreeLabel: { fontSize: 11, fontWeight: '700', color: c.success, textTransform: 'uppercase', letterSpacing: 0.8 },
  debtFreeDate:  { fontSize: 18, fontWeight: '900', color: c.success, marginTop: 2 },
  debtFreeSub:   { fontSize: 11, color: c.success, opacity: 0.75, marginTop: 2 },

  // Streak history
  streakSingle:         { gap: 10 },
  streakSingleBar:      { height: 12, backgroundColor: c.primary, borderRadius: 6 },
  streakSingleDays:     { fontSize: 28, fontWeight: '900', color: c.primary },
  streakSingleSub:      { fontSize: 13, color: c.textMuted },

  streakHistScroll:     { maxHeight: 216 },
  streakHistRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  streakHistRowCurrent: { marginTop: 4, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderSubtle },
  streakHistLabel:      { fontSize: 11, fontWeight: '600', color: c.textFaint, width: 28, textAlign: 'right' },
  streakHistLabelCurrent: { color: c.primary, fontWeight: '800' },
  streakHistBarWrap:    { flex: 1, gap: 3 },
  streakHistBarTrack:   { height: 8, backgroundColor: c.bgElement, borderRadius: 4, overflow: 'hidden' },
  streakHistBarFill:    { height: '100%', backgroundColor: c.primaryLight, borderRadius: 4 },
  streakHistBarCurrent: { backgroundColor: c.primary },
  streakHistDate:       { fontSize: 9, color: c.textFaint, fontWeight: '500' },
  streakHistEnd:        { flexDirection: 'row', alignItems: 'center', gap: 4, width: 56, justifyContent: 'flex-end' },
  streakHistDays:       { fontSize: 12, fontWeight: '600', color: c.textMuted },
  streakHistDaysCurrent:{ fontSize: 13, fontWeight: '800', color: c.primary },
  streakHistStar:       { fontSize: 11, color: c.primary },
  streakImproveChip:    { backgroundColor: c.bgTeal, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginTop: 4, alignItems: 'center' },
  streakImproveText:    { fontSize: 13, color: c.primary, fontWeight: '600', textAlign: 'center' },

  // Per-debt payoff timeline chart
  debtTimeline:      { gap: 5, paddingTop: 2 },
  debtTimelineTitle: { fontSize: 11, fontWeight: '600', color: c.textMuted },
  debtTimelineTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 },
  debtTimelineDates: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  debtTimelineDateL: { fontSize: 10, color: c.textFaint },
  debtTimelineDateC: { fontSize: 10, color: c.primary, fontWeight: '700' },
  debtTimelineDateR: { fontSize: 10, color: c.textFaint },
});
