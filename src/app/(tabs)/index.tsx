import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Svg, { Circle } from 'react-native-svg';

import { supabase } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const MILESTONES = [1, 7, 30, 60, 180, 365];

const BADGE_DEFS = [
  { type: '1_day',    emoji: '🌱', label: '1 Day',    days: 1 },
  { type: '1_week',   emoji: '⭐', label: '1 Week',   days: 7 },
  { type: '1_month',  emoji: '🔥', label: '1 Month',  days: 30 },
  { type: '60_days',  emoji: '🏆', label: '60 Days',  days: 60 },
  { type: '6_months', emoji: '💎', label: '6 Months', days: 180 },
];

const MOODS = ['😢', '😕', '😐', '🙂', '😄'];

const QUOTES = [
  "Every day without gambling is a win.",
  "You're stronger than the urge.",
  "One day at a time.",
  "Progress, not perfection.",
  "You've already taken the hardest step.",
  "Your future self will thank you.",
  "Small steps still move you forward.",
  "Courage is doing it anyway.",
  "Recovery is not a race.",
  "You deserve a better life.",
  "The urge will pass. You won't regret waiting.",
  "Every morning is a fresh start.",
  "Strength grows in the moments you think you can't go on.",
  "You are not your mistakes.",
  "Believe in the person you are becoming.",
  "The hardest battles are given to the strongest people.",
  "Your comeback is greater than your setback.",
  "You didn't come this far to only come this far.",
  "Healing is not linear, but it is possible.",
  "Choose yourself every single day.",
  "What you resist persists. What you face, you replace.",
  "The best time to quit was yesterday. The second best time is now.",
  "You are worth the effort it takes to recover.",
  "Every craving is temporary. Your life is not.",
  "Freedom is on the other side of the urge.",
  "You are rewriting your story.",
  "Small wins add up to big change.",
  "The goal is progress, not perfection.",
  "Your family deserves the best version of you.",
  "Today's struggle is tomorrow's strength.",
];

const MOTIVATION_MAP: Record<string, { label: string; emoji: string }> = {
  family:        { label: 'My family',               emoji: '👨‍👩‍👧' },
  finances:      { label: 'My finances',             emoji: '💰' },
  mental_health: { label: 'My mental health',        emoji: '🧠' },
  saving:        { label: 'Saving for something',    emoji: '🎯' },
  better_self:   { label: 'Becoming a better me',    emoji: '✨' },
  break_free:    { label: 'Breaking free for good',  emoji: '🔓' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(name?: string | null) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = name?.split(' ')[0];
  const trimmed = first && first.length > 12 ? `${first.slice(0, 12)}…` : first;
  return `Good ${time}${trimmed ? `, ${trimmed}` : ''}`;
}

function getDailyQuoteIndex() {
  return Math.floor(Date.now() / 86400000) % QUOTES.length;
}

function calcStreakInfo(quitDate: string | null) {
  if (!quitDate) return { value: 0, unit: 'min', days: 0, ms: 0 };
  const ms = Math.max(0, Date.now() - new Date(quitDate).getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000);
  if (days >= 1) return { value: days, unit: 'days', days, ms };
  if (hours >= 1) return { value: hours, unit: 'hrs', days: 0, ms };
  return { value: minutes, unit: 'min', days: 0, ms };
}

function getMilestone(ms: number) {
  const days = ms / 86400000;
  const next = MILESTONES.find(m => m > days) ?? 365;
  const prevIdx = MILESTONES.indexOf(next) - 1;
  const prev = prevIdx >= 0 ? MILESTONES[prevIdx] : 0;
  const progress = prev === next ? 1 : (days - prev) / (next - prev);
  const daysToGo = Math.max(0, next - Math.floor(days));
  const hoursToGo = Math.ceil(Math.max(0, next * 86400000 - ms) / 3600000);
  return { next, daysToGo, hoursToGo, progress: Math.min(1, Math.max(0, progress)) };
}

function weeklyToDaily(weeklyBet: string | null) {
  if (!weeklyBet) return 0;
  const n = Number(weeklyBet);
  if (!isNaN(n)) return n / 7;
  const map: Record<string, number> = {
    under_20: 10, '20_50': 35, '50_100': 75,
    '100_200': 150, '200_500': 350, '500_plus': 600,
  };
  return (map[weeklyBet] ?? 0) / 7;
}

function fmt(amount: number, currency = 'USD') {
  const syms: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$',
  };
  const s = syms[currency] ?? currency;
  if (amount >= 1000) return `${s}${(amount / 1000).toFixed(1)}k`;
  return `${s}${Math.round(amount)}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatStartDate(quitDate: string | null): string {
  if (!quitDate) return '';
  const d = new Date(quitDate);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `Started today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return `Started ${d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })}`;
}

// ─── Live Counter ─────────────────────────────────────────────────────────────

function LiveCounter({ quitDate }: { quitDate: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!quitDate) return null;

  const ms = Math.max(0, Date.now() - new Date(quitDate).getTime());
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const label = days > 0
    ? `${days}d ${hours}h ${pad(mins)}m ${pad(secs)}s`
    : `${hours}h ${pad(mins)}m ${pad(secs)}s`;

  return <Text style={s.liveCounter}>{label}</Text>;
}

// ─── Circular Progress ────────────────────────────────────────────────────────

function CircularProgress({ progress, next }: { progress: number; next: number }) {
  const SIZE = 130;
  const SW = 9;
  const R = (SIZE - SW) / 2;
  const C = 2 * Math.PI * R;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const pct = Math.round(progress * 100);
  const milestoneLabel = next === 1 ? '1 day' : next < 365 ? `${next} days` : '1 year';

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={cx} cy={cy} r={R} stroke="rgba(255,255,255,0.2)" strokeWidth={SW} fill="none" />
        <Circle
          cx={cx} cy={cy} r={R}
          stroke="#fff" strokeWidth={SW} fill="none"
          strokeDasharray={`${C}`}
          strokeDashoffset={`${C * (1 - progress)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <Text style={s.circPct}>{pct}%</Text>
      <Text style={s.circTime}>of {milestoneLabel}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface HomeData {
  displayName: string | null;
  motivation: string | null;
  quitDate: string | null;
  weeklyBet: string | null;
  currency: string;
  longestStreak: number;
  totalLost: number;
  paidBack: number;
  earnedBadges: string[];
  todayMood: number | null;
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moodSubmitting, setMoodSubmitting] = useState(false);
  const [relapseLoading, setRelapseLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(getDailyQuoteIndex);

  const nextQuote = useCallback(() => {
    setQuoteIndex(i => (i + 1) % QUOTES.length);
  }, []);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = todayStr();

    const [profileRes, streakRes, lossesRes, badgesRes, moodRes] = await Promise.all([
      supabase.from('users').select('display_name, motivation, quit_date, quit_timestamp, weekly_bet, currency').eq('id', user.id).single(),
      supabase.from('streaks').select('longest_streak').eq('user_id', user.id).single(),
      supabase.from('losses').select('type, amount').eq('user_id', user.id),
      supabase.from('badges').select('badge_type').eq('user_id', user.id),
      supabase.from('mood_checkins').select('mood').eq('user_id', user.id).gte('created_at', `${today}T00:00:00`).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const losses = lossesRes.data ?? [];
    const earnedBadges = (badgesRes.data ?? []).map(b => b.badge_type);

    const totalLost = losses.filter(l => l.type === 'loss').reduce((sum, l) => sum + Number(l.amount), 0);
    const paidBack = losses.filter(l => l.type === 'payment').reduce((sum, l) => sum + Number(l.amount), 0);

    // Auto-award badges
    const streak = Math.floor(Math.max(0, Date.now() - new Date(profile?.quit_date ?? Date.now()).getTime()) / 86400000);
    const toAward = BADGE_DEFS.filter(b => streak >= b.days && !earnedBadges.includes(b.type));
    if (toAward.length > 0) {
      await supabase.from('badges').insert(toAward.map(b => ({ user_id: user.id, badge_type: b.type })));
      toAward.forEach(b => earnedBadges.push(b.type));
    }

    // Update longest streak
    const longest = streakRes.data?.longest_streak ?? 0;
    if (streak > longest) {
      await supabase.from('streaks').update({ longest_streak: streak }).eq('user_id', user.id);
    }

    setData({
      displayName: profile?.display_name ?? user.email?.split('@')[0] ?? null,
      motivation: profile?.motivation ?? null,
      quitDate: profile?.quit_timestamp ?? profile?.quit_date ?? null,
      weeklyBet: profile?.weekly_bet ?? null,
      currency: profile?.currency ?? 'USD',
      longestStreak: Math.max(longest, streak),
      totalLost,
      paidBack,
      earnedBadges,
      todayMood: moodRes.data?.mood ?? null,
    });
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Update streak display every minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Must be before any early returns to follow Rules of Hooks
  const streakInfo = useMemo(() => calcStreakInfo(data?.quitDate ?? null), [data?.quitDate, tick]);
  const { value: streakValue, unit: streakUnit, days: streakDays, ms: streakMs } = streakInfo;

  const handleMood = async (mood: number) => {
    if (!data) return;
    setMoodSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('mood_checkins').insert({ user_id: user.id, mood });
      setData(prev => prev ? { ...prev, todayMood: mood } : prev);
    }
    setMoodSubmitting(false);
  };

  const handleRelapse = async () => {
    setRelapseLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const today = todayStr();
      await Promise.all([
        supabase.from('users').update({ quit_date: today, quit_timestamp: new Date().toISOString() }).eq('id', user.id),
        supabase.from('streaks').update({ current_streak: 0, streak_start_date: today }).eq('user_id', user.id),
      ]);
      await fetchData();
    }
    setRelapseLoading(false);
  };

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#0F6E6E" />
      </View>
    );
  }

  if (!data) return null;

  const { next, daysToGo, hoursToGo, progress } = getMilestone(streakMs);
  const moneySaved = streakDays * weeklyToDaily(data.weeklyBet);
  const percentRecovered = data.totalLost > 0 ? Math.min(100, (data.paidBack / data.totalLost) * 100) : 0;
  const motivation = MOTIVATION_MAP[data.motivation ?? ''] ?? { label: data.motivation ?? '—', emoji: '💪' };

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <View style={s.headerTop}>
              <View>
                <Text style={s.greeting}>{getGreeting(data.displayName)}</Text>
                <View style={s.quoteRow}>
                  <Text style={s.quote} numberOfLines={2}>"{QUOTES[quoteIndex]}"</Text>
                  <Pressable onPress={nextQuote} style={({ pressed }) => [s.quoteRefresh, pressed && s.pressed]}>
                    <Text style={s.quoteRefreshIcon}>↻</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Streak card inside header */}
            <View style={s.streakCard}>
              <CircularProgress progress={progress} next={next} />
              <View style={s.streakRight}>
                <Text style={s.streakTitle}>Current streak</Text>
                <View style={s.milestoneBar}>
                  <View style={[s.milestoneFill, { width: `${progress * 100}%` }]} />
                </View>
                <Text style={s.milestoneTxt}>
                  {daysToGo === 0
                    ? `🎉 ${next}-day milestone reached!`
                    : daysToGo === 1
                      ? `${hoursToGo}h to ${next}-day milestone`
                      : `${daysToGo} days to ${next}-day milestone`}
                </Text>
                <LiveCounter quitDate={data.quitDate} />
                <Text style={s.longestTxt}>Best: {data.longestStreak} days</Text>
                {!!data.quitDate && (
                  <Text style={s.startedTxt}>{formatStartDate(data.quitDate)}</Text>
                )}
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ── Body ── */}
      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F6E6E" />}>

        {/* Your Why */}
        <View style={s.whyCard}>
          <Text style={s.whyEmoji}>{motivation.emoji}</Text>
          <View style={s.whyText}>
            <Text style={s.whyLabel}>Your why</Text>
            <Text style={s.whyValue}>{motivation.label}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statValue}>{fmt(moneySaved, data.currency)}</Text>
            <Text style={s.statLabel}>Saved</Text>
          </View>
          <View style={[s.statBox, s.statBoxMid]}>
            <Text style={s.statValue}>{fmt(data.totalLost, data.currency)}</Text>
            <Text style={s.statLabel}>Total lost</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{Math.round(percentRecovered)}%</Text>
            <Text style={s.statLabel}>Recovered</Text>
          </View>
        </View>

        {/* Mood check-in */}
        <View style={s.card}>
          {data.todayMood !== null ? (
            <View style={s.moodDone}>
              <Text style={s.moodDoneEmoji}>{MOODS[data.todayMood - 1]}</Text>
              <Text style={s.moodDoneTxt}>Today's check-in done</Text>
            </View>
          ) : (
            <>
              <Text style={s.cardTitle}>How are you feeling today?</Text>
              {moodSubmitting ? (
                <ActivityIndicator color="#0F6E6E" style={{ marginTop: 12 }} />
              ) : (
                <View style={s.moodRow}>
                  {MOODS.map((emoji, i) => (
                    <Pressable
                      key={i}
                      onPress={() => handleMood(i + 1)}
                      style={({ pressed }) => [s.moodBtn, pressed && s.pressed]}>
                      <Text style={s.moodEmoji}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Badges */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Milestones</Text>
          <View style={s.badgesRow}>
            {BADGE_DEFS.map(badge => {
              const earned = data.earnedBadges.includes(badge.type);
              return (
                <View key={badge.type} style={s.badgeItem}>
                  <View style={[s.badgeCircle, earned ? s.badgeEarned : s.badgeLocked]}>
                    <Text style={s.badgeEmoji}>{earned ? badge.emoji : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !earned && s.badgeLabelLocked]}>
                    {badge.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Relapse card */}
        <View style={s.relapseCard}>
          <Text style={s.relapseTitle}>Had a slip? That's okay.</Text>
          <Text style={s.relapseSubtitle}>
            Recovery isn't linear. Every restart is still progress.
          </Text>
          <Pressable
            style={({ pressed }) => [s.relapseBtn, pressed && s.pressed]}
            onPress={handleRelapse}
            disabled={relapseLoading}>
            {relapseLoading
              ? <ActivityIndicator color="#888" size="small" />
              : <Text style={s.relapseBtnTxt}>Reset my streak</Text>}
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f7f7' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { paddingBottom: 20 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12, gap: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 21, fontWeight: '700', color: '#fff' },
  quoteRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  quote: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic' },
  quoteRefresh: { padding: 4 },
  quoteRefreshIcon: { fontSize: 16, color: 'rgba(255,255,255,0.6)' },

  // Streak card (inside header)
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  streakRight: { flex: 1, gap: 6 },
  streakTitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  milestoneBar: { height: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  milestoneFill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  milestoneTxt: { fontSize: 13, color: '#fff', fontWeight: '500' },
  liveCounter: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontVariant: ['tabular-nums'] },
  longestTxt: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  startedTxt: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  resetLink: { marginTop: 2 },
  resetLinkTxt: { fontSize: 11, color: '#ff8a80', fontWeight: '600' },

  // Circular
  circPct: { fontSize: 32, fontWeight: '800', color: '#fff', lineHeight: 36 },
  circTime: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 },

  // Body
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  // Your why
  whyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0F6E6E',
  },
  whyEmoji: { fontSize: 28 },
  whyText: { flex: 1 },
  whyLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  whyValue: { fontSize: 15, color: '#111', fontWeight: '600', marginTop: 2 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#f0f0f0' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#0F6E6E' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 14 },

  // Mood
  moodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  moodBtn: { padding: 6 },
  moodEmoji: { fontSize: 32 },
  moodDone: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moodDoneEmoji: { fontSize: 28 },
  moodDoneTxt: { fontSize: 14, color: '#555', fontWeight: '500' },

  // Badges
  badgesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  badgeItem: { alignItems: 'center', gap: 6 },
  badgeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  badgeEarned: { backgroundColor: '#e6f7f7' },
  badgeLocked: { backgroundColor: '#f5f5f5' },
  badgeEmoji: { fontSize: 22 },
  badgeLabel: { fontSize: 10, color: '#555', fontWeight: '600' },
  badgeLabelLocked: { color: '#bbb' },

  // Relapse
  relapseCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  relapseTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  relapseSubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  relapseBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    backgroundColor: '#fff5f5',
  },
  relapseBtnTxt: { fontSize: 13, color: '#c0392b', fontWeight: '600' },

  pressed: { opacity: 0.7 },
});
