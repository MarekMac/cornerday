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

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'USD') {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency;
  return `${s}${Math.round(amount * 100) / 100}`;
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
  moodLast30: { date: string; mood: number }[];
  savingsTimeline: { date: string; amount: number; cumulative: number }[];
  weekMoods: { date: string; mood: number | null }[];
  relapseCount: number;
}

// ─── Components ──────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
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

    // Build savings timeline (sorted by date, with running total)
    const sortedSavings = [...savingRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let running = 0;
    const savingsTimeline = sortedSavings.slice(-10).map(r => {
      running += Number(r.amount);
      return { date: r.created_at, amount: Number(r.amount), cumulative: running };
    });

    const debtRows = debtsRes.data ?? [];
    const payRows = paymentsRes.data ?? [];
    const totalDebts = debtRows.reduce((s, d) => s + Number(d.total_amount), 0);
    const totalDebtPaid = payRows.reduce((s, p) => s + Number(p.amount), 0);

    const urgeRows = urgeRes.data ?? [];
    const urgesOvercome = urgeRows.filter(u => u.outcome === 'overcame').length;

    // Build last-30-days mood map
    const moodRows = moodRes.data ?? [];
    const moodByDate: Record<string, number> = {};
    moodRows.forEach(r => {
      const d = new Date(r.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD
      moodByDate[d] = r.mood;
    });
    const moodLast30: { date: string; mood: number }[] = moodRows.map(r => ({
      date: new Date(r.created_at).toLocaleDateString('en-CA'),
      mood: r.mood,
    }));

    // Build current-week moods (Sun–Sat)
    const today = new Date();
    const sun = new Date(today);
    sun.setDate(today.getDate() - today.getDay());
    const weekMoods = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun);
      d.setDate(sun.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: DAY_LABELS[i], mood: moodByDate[key] ?? null };
    });

    const avgMood = moodRows.length > 0
      ? moodRows.reduce((s, r) => s + r.mood, 0) / moodRows.length
      : null;

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
      moodLast30,
      savingsTimeline,
      weekMoods,
      relapseCount: relapseRows.length,
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

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color="#0F6E6E" size="large" />
      </View>
    );
  }

  if (!data) return null;

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

  return (
    <View style={s.root}>
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

      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F6E6E" />}>

        {/* Streak overview */}
        <View style={s.card}>
          <SectionHeader title="🔥 Streak" />
          <View style={s.statsRow}>
            <StatBox label="Current" value={`${data.currentStreakDays}d`} color="#0F6E6E" />
            <View style={s.statsDivider} />
            <StatBox label="Best ever" value={`${data.longestStreak}d`} />
            <View style={s.statsDivider} />
            <StatBox label="Relapses" value={`${data.relapseCount}`} sub={data.relapseCount === 0 ? 'Keep it up!' : undefined} />
          </View>
          {data.quitDate ? (
            <View style={s.startedRow}>
              <Text style={s.startedTxt}>
                Started {parseQuitDate(data.quitDate).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </View>

        {/* This week's mood */}
        <View style={s.card}>
          <SectionHeader
            title="😊 Mood this week"
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
          <View style={s.moodBarRow}>
            {[1, 2, 3, 4, 5].map(v => {
              const count = data.moodLast30.filter(r => r.mood === v).length;
              const maxCount = Math.max(1, ...([1, 2, 3, 4, 5].map(x => data.moodLast30.filter(r => r.mood === x).length)));
              const barH = count > 0 ? Math.max(4, (count / maxCount) * 48) : 4;
              return (
                <View key={v} style={s.moodBarItem}>
                  <Text style={s.moodBarCount}>{count > 0 ? count : ''}</Text>
                  <View style={s.moodBarBg}>
                    <View style={[s.moodBarFill, { height: barH }]} />
                  </View>
                  <Text style={s.moodBarEmoji}>{MOODS[v - 1]}</Text>
                </View>
              );
            })}
          </View>
          <Text style={s.chartCaption}>Mood frequency — last 30 days</Text>
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
        </View>

        {/* Savings */}
        <View style={s.card}>
          <SectionHeader title="💰 Savings" />
          <View style={s.statsRow}>
            <StatBox label="Total banked" value={fmt(data.totalSavings, data.currency)} color="#0F6E6E" />
            {goalPct !== null && (
              <>
                <View style={s.statsDivider} />
                <StatBox label="Goal" value={fmt(data.savingsGoal!, data.currency)} />
                <View style={s.statsDivider} />
                <StatBox label="Progress" value={`${Math.round(goalPct * 100)}%`} color={goalPct >= 1 ? '#0a7a4e' : '#0F6E6E'} />
              </>
            )}
          </View>
          {goalPct !== null && (
            <>
              <View style={s.progressBarWrap}>
                <View style={s.goalBarLabel}>
                  <Text style={s.goalBarLabelTxt}>{data.savingsGoalIcon} {data.savingsGoalFor || 'My goal'}</Text>
                </View>
                <View style={s.progressBarBg}>
                  <View style={[s.progressBarFill, { width: `${Math.round(goalPct * 100)}%` as any }, goalPct >= 1 && s.progressBarDone]} />
                </View>
              </View>
            </>
          )}
          {data.savingsTimeline.length > 0 && (
            <>
              <View style={s.chartLabel}>
                <Text style={s.chartCaption}>Savings trajectory</Text>
              </View>
              <View style={s.barChart}>
                {data.savingsTimeline.map((item, i) => {
                  const barH = maxSaving > 0 ? Math.max(4, (item.cumulative / maxSaving) * 60) : 4;
                  return (
                    <View key={i} style={s.barItem}>
                      <Text style={s.barAmt}>{fmt(item.amount, data.currency)}</Text>
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

        {/* Debts */}
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

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 14 },

  sectionHeader: { gap: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  sectionSub: { fontSize: 12, color: '#888' },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statsDivider: { width: 1, height: 40, backgroundColor: '#f0f0f0', marginHorizontal: 12 },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
  statSub: { fontSize: 10, color: '#0a7a4e', textAlign: 'center' },

  startedRow: { alignItems: 'center' },
  startedTxt: { fontSize: 12, color: '#aaa' },

  // Week mood strip
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDayCol: { alignItems: 'center', gap: 4 },
  weekDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  weekDotToday: { backgroundColor: '#e6f7f7' },
  weekDotEmpty: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0e0e0' },
  weekEmoji: { fontSize: 20 },
  weekDayLabel: { fontSize: 10, color: '#aaa', fontWeight: '500' },
  weekDayLabelToday: { color: '#0F6E6E', fontWeight: '700' },

  // Mood bar chart
  moodBarRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 80 },
  moodBarItem: { alignItems: 'center', gap: 4, flex: 1 },
  moodBarCount: { fontSize: 10, color: '#888', height: 14 },
  moodBarBg: { width: 28, height: 52, justifyContent: 'flex-end', backgroundColor: '#f5f5f5', borderRadius: 4, overflow: 'hidden' },
  moodBarFill: { width: '100%', backgroundColor: '#1a9a9a', borderRadius: 4 },
  moodBarEmoji: { fontSize: 16 },

  chartCaption: { fontSize: 11, color: '#bbb', textAlign: 'center' },
  chartLabel: { marginBottom: -6 },

  // Progress bar
  progressBarWrap: { gap: 6 },
  progressBarBg: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#1a9a9a', borderRadius: 4 },
  progressBarDone: { backgroundColor: '#0a7a4e' },
  progressBarPct: { fontSize: 11, color: '#888', textAlign: 'right' },

  goalBarLabel: {},
  goalBarLabelTxt: { fontSize: 12, color: '#555', fontWeight: '600' },

  // Bar chart (savings)
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 },
  barItem: { flex: 1, alignItems: 'center', gap: 3 },
  barAmt: { fontSize: 9, color: '#0F6E6E', fontWeight: '600', textAlign: 'center' },
  barBg: { width: '100%', height: 60, justifyContent: 'flex-end', backgroundColor: '#f5f5f5', borderRadius: 4, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: '#1a9a9a', borderRadius: 4 },
  barDate: { fontSize: 9, color: '#aaa', textAlign: 'center' },
});
