import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { supabase } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const MILESTONES = [1/24, 1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 365, 548, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650];

const BADGE_DEFS = [
  { type: 'started',  emoji: '🚀', label: 'Started',  days: 0 },
  { type: '1_hour',   emoji: '⏰', label: '1 Hour',   days: 1/24 },
  { type: '1_day',    emoji: '🌱', label: '1 Day',    days: 1 },
  { type: '3_days',   emoji: '🌿', label: '3 Days',   days: 3 },
  { type: '1_week',   emoji: '⭐', label: '1 Week',   days: 7 },
  { type: '10_days',  emoji: '✨', label: '10 Days',  days: 10 },
  { type: '2_weeks',  emoji: '🌙', label: '2 Weeks',  days: 14 },
  { type: '3_weeks',  emoji: '💫', label: '3 Weeks',  days: 21 },
  { type: '1_month',  emoji: '🔥', label: '1 Month',  days: 30 },
  { type: '45_days',  emoji: '⚡', label: '45 Days',  days: 45 },
  { type: '2_months', emoji: '🏅', label: '2 Months', days: 60 },
  { type: '3_months', emoji: '🎯', label: '3 Months', days: 90 },
  { type: '4_months', emoji: '🌊', label: '4 Months', days: 120 },
  { type: '5_months', emoji: '🦋', label: '5 Months', days: 150 },
  { type: '6_months', emoji: '💎', label: '6 Months', days: 180 },
  { type: '9_months', emoji: '🌸', label: '9 Months', days: 270 },
  { type: '1_year',   emoji: '🏆', label: '1 Year',   days: 365 },
  { type: '18_months',emoji: '🦅', label: '18 Months',days: 548 },
  { type: '2_years',  emoji: '👑', label: '2 Years',  days: 730 },
  { type: '3_years',  emoji: '🌟', label: '3 Years',  days: 1095 },
  { type: '4_years',  emoji: '🔱', label: '4 Years',  days: 1460 },
  { type: '5_years',  emoji: '🦁', label: '5 Years',  days: 1825 },
  { type: '6_years',  emoji: '🌍', label: '6 Years',  days: 2190 },
  { type: '7_years',  emoji: '⚜️', label: '7 Years',  days: 2555 },
  { type: '8_years',  emoji: '🔮', label: '8 Years',  days: 2920 },
  { type: '9_years',  emoji: '🌠', label: '9 Years',  days: 3285 },
  { type: '10_years', emoji: '💫', label: '10 Years', days: 3650 },
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
  "The moment you decided to stop was the moment things started to change.",
  "You are not fighting alone.",
  "Each hour you hold on is an hour you win.",
  "The money you don't lose today is already a victory.",
  "It's okay to not be okay — as long as you keep going.",
  "You have survived every bad day so far. That's 100%.",
  "Your story isn't over. The best chapters are still unwritten.",
  "Saying no today means saying yes to your future.",
  "The urge is loud, but it is not in charge.",
  "One good decision right now is enough.",
  "Quitting isn't weakness. It takes more courage than staying.",
  "You are already the person who chose to change.",
  "Every streak, even a short one, is proof you can do it.",
  "Your mind is healing, even when it doesn't feel like it.",
  "The life you want is on the other side of this moment.",
  "You are not your worst day.",
  "Rest if you must, but don't give up.",
  "Breathe. This feeling will pass.",
  "The hardest step was asking for change. You already did that.",
  "You deserve peace more than you deserve the thrill.",
];

const BADGE_EARNED_MSGS = [
  "Every day you hold on builds on this milestone. Keep going.",
  "You did what many never manage. Be proud of that.",
  "This badge is proof — you are stronger than the urge.",
  "Look how far you've come. The person you were would be amazed.",
  "This milestone is yours forever. No one can take it away.",
  "You showed up every single day to earn this. That's real strength.",
  "Each milestone is a promise you kept — to yourself.",
  "Recovery is built one day at a time. You're doing it.",
  "You proved that change is possible. Keep building on it.",
  "This is what commitment looks like. You should be proud.",
  "Not everyone who tries makes it this far. You did.",
  "This badge represents every urge you resisted. That's power.",
  "You chose yourself, again and again. That's what this means.",
  "The hardest part was deciding to start. You did that — and kept going.",
  "Every single day counted. Every single one.",
  "You are living proof that change is possible.",
  "Your future self is grateful for every day you held on.",
  "This is a real achievement. Don't let anyone tell you otherwise.",
  "You turned the corner. This badge marks the moment.",
  "Strength isn't the absence of struggle — it's showing up anyway. You did.",
];

const BADGE_PENDING_MSGS = [
  "You're already further than you think. This badge is waiting for you.",
  "Every hour you hold on is progress toward this milestone.",
  "The urge is temporary. This badge is permanent. Keep going.",
  "You've done the hard part — starting. Now just keep showing up.",
  "Imagine how you'll feel when this one is yours. Almost there.",
  "Small steps still move you forward. You're closer than yesterday.",
  "This milestone doesn't require perfection — just persistence.",
  "Future you is counting on today's you. Don't give up.",
  "The gap between where you are and this badge is shrinking every day.",
  "You've already proven you can do hard things. This is next.",
  "One more day. Then one more. That's how this badge gets earned.",
  "You don't have to feel ready. You just have to keep going.",
  "Every time you resist the urge, you move closer to this.",
  "The finish line isn't far — it's just one more step away.",
  "You've survived every hard day so far. This one too.",
  "Progress doesn't always feel like progress. But it's happening.",
  "The version of you that earns this badge is closer than you think.",
  "You started something real. Don't stop before the reward.",
  "Each day without gambling is a day won. Stack them up.",
  "This badge is patient. It'll be here when you arrive — keep moving.",
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


function calcStreakInfo(quitDate: string | null) {
  if (!quitDate) return { value: 0, unit: 'min', days: 0, ms: 0 };
  const ms = Math.max(0, Date.now() - parseQuitDate(quitDate).getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000);
  if (days >= 1) return { value: days, unit: 'days', days, ms };
  if (hours >= 1) return { value: hours, unit: 'hrs', days: 0, ms };
  return { value: minutes, unit: 'min', days: 0, ms };
}

function getMilestone(ms: number) {
  const days = ms / 86400000;
  const next = MILESTONES.find(m => m > days) ?? 3650;
  const prevIdx = MILESTONES.indexOf(next) - 1;
  const prev = prevIdx >= 0 ? MILESTONES[prevIdx] : 0;
  const progress = prev === next ? 1 : (days - prev) / (next - prev);
  const daysToGo = Math.max(0, next - Math.floor(days));
  const remainingMs = Math.max(0, next * 86400000 - ms);
  const hoursToGo = Math.floor(remainingMs / 3600000);
  const minsToGo = Math.floor((remainingMs % 3600000) / 60000);
  const secsToGo = Math.floor((remainingMs % 60000) / 1000);
  const hoursComponent = Math.floor((remainingMs % 86400000) / 3600000);
  return { next, daysToGo, hoursToGo, minsToGo, secsToGo, hoursComponent, remainingMs, progress: Math.min(1, Math.max(0, progress)) };
}

function weeklyToDaily(weeklyBet: string | null) {
  if (!weeklyBet) return 0;
  const n = Number(weeklyBet);
  return isNaN(n) ? 0 : n / 7;
}

function fmt(amount: number, currency = 'USD') {
  const syms: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$',
  };
  const s = syms[currency] ?? currency;
  if (amount >= 1000) return `${s}${(amount / 1000).toFixed(1)}k`;
  return `${s}${Math.round(amount)}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function formatBest(days: number, ms: number) {
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const years = Math.floor(days / 365);
  const remainingDays = days % 365;
  const isCurrentBest = Math.floor(ms / 86400000) === days;


  if (isCurrentBest) {
    if (days === 0 && hours === 0) return plural(mins, 'minute');
    if (days === 0) return `${plural(hours, 'hour')} and ${plural(mins, 'minute')}`;
    if (years >= 1) return `${plural(years, 'year')} and ${plural(remainingDays, 'day')}`;
    return `${plural(days, 'day')} and ${plural(hours, 'hour')}`;
  }

  if (days === 0) return 'just started';
  if (years >= 1) return `${plural(years, 'year')} and ${plural(remainingDays, 'day')}`;
  return plural(days, 'day');
}

function formatTimeLeft(days: number): string {
  if (days <= 0) return 'now';
  if (days < 1 / 24) return `${Math.ceil(days * 1440)} min`;
  if (days < 1) return `${Math.ceil(days * 24)} hour${Math.ceil(days * 24) !== 1 ? 's' : ''}`;
  const d = Math.ceil(days);
  return `${d} day${d !== 1 ? 's' : ''}`;
}

function milestoneLabel(days: number) {
  const map: Record<number, string> = {
    [1/24]: '1 hour',
    1: '1 day', 3: '3 days', 7: '1 week', 10: '10 days',
    14: '2 weeks', 21: '3 weeks', 30: '1 month', 45: '45 days',
    60: '2 months', 90: '3 months', 120: '4 months', 150: '5 months',
    180: '6 months', 270: '9 months', 365: '1 year', 548: '18 months',
    730: '2 years', 1095: '3 years', 1460: '4 years', 1825: '5 years',
    2190: '6 years', 2555: '7 years', 2920: '8 years', 3285: '9 years',
    3650: '10 years',
  };
  return map[days] ?? `${days} days`;
}

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseQuitDate(quitDate: string): Date {
  // Date-only strings (no time) must be parsed as local midnight, not UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(quitDate)) {
    const [y, mo, d] = quitDate.split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return new Date(quitDate);
}

function localMidnight(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
}

function formatStartDate(quitDate: string | null): string {
  if (!quitDate) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(quitDate);
  const d = parseQuitDate(quitDate);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) });
  if (isToday) {
    return dateOnly
      ? 'Started today'
      : `Started today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return dateOnly
    ? `Started ${dateStr}`
    : `Started ${dateStr} @ ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ─── Circular Progress ────────────────────────────────────────────────────────

function CircularProgress({ progress, next }: { progress: number; next: number }) {
  const SIZE = 130;
  const SW = 9;
  const R = (SIZE - SW) / 2;
  const C = 2 * Math.PI * R;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const pct = progress > 0 ? Math.max(1, Math.round(progress * 100)) : 0;
  const label = milestoneLabel(next);

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
      <Text style={s.circTime}>{label}</Text>
    </View>
  );
}

// ─── Badge Ring ───────────────────────────────────────────────────────────────

function badgeRingColor(progress: number): string {
  // Black at 0% → bright green at 100%
  const r = Math.round(20 + (34 - 20) * progress);
  const g = Math.round(20 + (197 - 20) * progress);
  const b = Math.round(20 + (94 - 20) * progress);
  return `rgb(${r},${g},${b})`;
}

function BadgeRing({ progress }: { progress: number }) {
  const SIZE = 46;
  const SW = 3;
  const R = (SIZE - SW) / 2;
  const C = 2 * Math.PI * R;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  return (
    <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
      <Circle cx={cx} cy={cy} r={R} stroke="rgba(0,0,0,0.08)" strokeWidth={SW} fill="none" />
      {progress > 0 && (
        <Circle
          cx={cx} cy={cy} r={R}
          stroke={badgeRingColor(progress)} strokeWidth={SW} fill="none"
          strokeDasharray={`${C}`}
          strokeDashoffset={`${C * (1 - progress)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
    </Svg>
  );
}

// ─── Live Counter ─────────────────────────────────────────────────────────────

function LiveCounter({ quitDate }: { quitDate: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!quitDate) return null;

  const ms = Math.max(0, Date.now() - parseQuitDate(quitDate).getTime());
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const years = Math.floor(days / 365);
  const remainingDays = days % 365;
  const label = years >= 1
    ? `${plural(years, 'year')}, ${plural(remainingDays, 'day')}`
    : days > 0
      ? `${plural(days, 'day')}, ${plural(hours, 'hour')}`
      : hours > 0
        ? `${plural(hours, 'hour')}, ${plural(mins, 'minute')}`
        : `${plural(mins, 'minute')}, ${plural(secs, 'second')}`;

  return <Text style={s.liveCounter}>{label}</Text>;
}


// ─── Main Screen ──────────────────────────────────────────────────────────────

interface HomeData {
  displayName: string | null;
  motivation: string | null;
  quitDate: string | null;
  weeklyBet: string | null;
  currency: string;
  longestStreak: number;
  earnedBadges: string[];
  badgeTimestamps: Record<string, string>;
  todayMood: number | null;
  todayMoodNote: string | null;
  todayMoodId: string | null;
  weekMoods: { date: string; mood: number | null; note: string | null }[];
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moodSubmitting, setMoodSubmitting] = useState(false);
  const [relapseLoading, setRelapseLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [selectedBadge, setSelectedBadge] = useState<typeof BADGE_DEFS[0] | null>(null);
  const badgeScrollRef = useRef<ScrollView>(null);
  const [badgeMsgIndex, setBadgeMsgIndex] = useState(0);
  const [editingMood, setEditingMood] = useState(false);
  const [moodNote, setMoodNote] = useState('');
  const [editMoodValue, setEditMoodValue] = useState<number | null>(null);

  const randomQuote = useCallback(() => {
    setQuoteIndex(i => {
      let next = i;
      while (next === i) next = Math.floor(Math.random() * QUOTES.length);
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = todayStr();

    const [profileRes, streakRes, badgesRes, moodRes, weekMoodRes] = await Promise.all([
      supabase.from('users').select('display_name, motivation, quit_date, quit_timestamp, weekly_bet, currency').eq('id', user.id).single(),
      supabase.from('streaks').select('longest_streak').eq('user_id', user.id).single(),
      supabase.from('badges').select('badge_type, earned_at').eq('user_id', user.id),
      supabase.from('mood_checkins').select('id, mood, note').eq('user_id', user.id).gte('created_at', localMidnight()).maybeSingle(),
      supabase.from('mood_checkins').select('mood, note, created_at').eq('user_id', user.id).gte('created_at', (() => { const d = new Date(); d.setDate(d.getDate() - 6); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(); })()).order('created_at', { ascending: true }),
    ]);

    const profile = profileRes.data;
    const badgeRows = badgesRes.data ?? [];
    const earnedBadges = badgeRows.map(b => b.badge_type);
    const badgeTimestamps: Record<string, string> = {};
    badgeRows.forEach(b => { if (b.earned_at) badgeTimestamps[b.badge_type] = b.earned_at; });

    // Auto-award badges
    const quitStr = profile?.quit_timestamp ?? profile?.quit_date;
    const streakDaysFloat = quitStr
      ? Math.max(0, Date.now() - parseQuitDate(quitStr).getTime()) / 86400000
      : 0;
    const toAward = BADGE_DEFS.filter(b => streakDaysFloat >= b.days && !earnedBadges.includes(b.type));
    if (toAward.length > 0) {
      await supabase.from('badges').insert(toAward.map(b => ({ user_id: user.id, badge_type: b.type })));
      toAward.forEach(b => earnedBadges.push(b.type));
    }

    // Update longest streak
    const streak = Math.floor(streakDaysFloat);
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
      earnedBadges,
      badgeTimestamps,
      todayMood: moodRes.data?.mood ?? null,
      todayMoodNote: moodRes.data?.note ?? null,
      todayMoodId: moodRes.data?.id ?? null,
      weekMoods: (() => {
        const rows = weekMoodRes.data ?? [];
        const byDate: Record<string, { mood: number; note: string | null }> = {};
        rows.forEach(r => {
          const key = new Date(r.created_at).toLocaleDateString();
          byDate[key] = { mood: r.mood, note: r.note ?? null };
        });
        return Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString();
          return { date: key, mood: byDate[key]?.mood ?? null, note: byDate[key]?.note ?? null };
        });
      })(),
    });
  }, []);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    fetchData().finally(() => {
      setLoading(false);
      initialLoadDone.current = true;
    });
  }, [fetchData]);

  useFocusEffect(useCallback(() => {
    if (initialLoadDone.current) fetchData();
  }, [fetchData]));

  // Update streak display every second
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!data) return;
    const lastEarnedIdx = BADGE_DEFS.reduce((acc, b, i) =>
      data.earnedBadges.includes(b.type) ? i : acc, -1);
    const targetIdx = lastEarnedIdx >= 0 ? lastEarnedIdx : 0;
    const ITEM_WIDTH = 57 + 18; // badgeItem width + gap
    const screenWidth = Dimensions.get('window').width;
    const cardPadding = 48; // card horizontal padding both sides
    const offset = targetIdx * ITEM_WIDTH - (screenWidth - cardPadding - 57) / 2;
    setTimeout(() => {
      badgeScrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: false });
    }, 100);
  }, [data?.earnedBadges.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    randomQuote();
    await fetchData();
    setRefreshing(false);
  }, [fetchData, randomQuote]);

  // Must be before any early returns to follow Rules of Hooks
  const streakInfo = useMemo(() => calcStreakInfo(data?.quitDate ?? null), [data?.quitDate, tick]);
  const { value: streakValue, unit: streakUnit, days: streakDays, ms: streakMs } = streakInfo;

  const handleMood = async (mood: number, note?: string) => {
    if (!data) return;
    setMoodSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const noteVal = note?.trim() || null;
      if (data.todayMoodId) {
        await supabase.from('mood_checkins').update({ mood, note: noteVal }).eq('id', data.todayMoodId);
      } else {
        const { data: inserted } = await supabase.from('mood_checkins').insert({ user_id: user.id, mood, note: noteVal }).select('id').single();
        setData(prev => prev ? { ...prev, todayMoodId: inserted?.id ?? null } : prev);
      }
      const todayKey = new Date().toLocaleDateString();
      setData(prev => {
        if (!prev) return prev;
        const weekMoods = prev.weekMoods.map(d => d.date === todayKey ? { ...d, mood, note: noteVal } : d);
        return { ...prev, todayMood: mood, todayMoodNote: noteVal, weekMoods };
      });
      setEditingMood(false);
      setMoodNote('');
      setEditMoodValue(null);
    }
    setMoodSubmitting(false);
  };

  const handleRelapse = () => {
    Alert.alert(
      'Reset your streak?',
      'This will start your streak from today. It\'s okay — every restart is still progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset streak', style: 'destructive', onPress: doRelapse },
      ],
    );
  };

  const doRelapse = async () => {
    setRelapseLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const today = todayStr();
      const days = streakDays;
      await Promise.all([
        supabase.from('users').update({ quit_date: today, quit_timestamp: new Date().toISOString() }).eq('id', user.id),
        supabase.from('streaks').update({ current_streak: 0, streak_start_date: today }).eq('user_id', user.id),
        supabase.from('badges').delete().eq('user_id', user.id),
        supabase.from('losses').insert({
          user_id: user.id, type: 'streak_reset', amount: 0,
          category: 'Streak Reset',
          note: days > 0 ? `After ${days} day${days !== 1 ? 's' : ''}` : null,
        }),
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

  const { next, daysToGo, hoursToGo, minsToGo, secsToGo, hoursComponent, remainingMs, progress } = getMilestone(streakMs);
  const moneySaved = streakDays * weeklyToDaily(data.weeklyBet);
  const motivations = (data.motivation ?? '').split(',').filter(Boolean).map(
    m => MOTIVATION_MAP[m] ?? { label: m, emoji: '💪' }
  );

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <View style={s.headerTop}>
              <View>
                <Text style={s.greeting}>{getGreeting(data.displayName)}</Text>
                <Text style={s.quote} numberOfLines={2}>"{QUOTES[quoteIndex]}"</Text>
              </View>
            </View>

            {/* Streak card inside header */}
            <View style={s.streakCard}>
              <CircularProgress progress={progress} next={next} />
              <View style={s.streakRight}>
                <Text style={s.streakTitle}>Current streak</Text>
                <LiveCounter quitDate={data.quitDate} />
                <View style={s.separator} />
                <Text style={s.milestoneTxt}>
                  {remainingMs <= 0
                    ? `🎉 ${milestoneLabel(next)} — milestone reached!`
                    : next < 1
                      ? `${minsToGo}m ${secsToGo}s to reach ${milestoneLabel(next)}`
                      : daysToGo === 1
                        ? `${hoursToGo}h ${minsToGo}m to reach ${milestoneLabel(next)}`
                        : `${daysToGo}d ${hoursComponent}h to reach ${milestoneLabel(next)}`}
                </Text>
                <Text style={s.longestTxt}>Best: {formatBest(data.longestStreak, streakMs)}</Text>
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

        {/* Stats */}
        <View style={s.savedCard}>
          <Text style={s.savedLabel}>Saved by not gambling</Text>
          <Text style={s.savedValue}>{fmt(moneySaved, data.currency)}</Text>
          {data.weeklyBet ? (
            <Text style={s.savedHint}>
              {fmt(Number(data.weeklyBet), data.currency)}/week · {streakDays} day{streakDays !== 1 ? 's' : ''} streak
            </Text>
          ) : (
            <Text style={s.savedHint}>Set your weekly spending in the Tracker to see savings</Text>
          )}
        </View>

        {/* Badges */}
        <View style={s.card}>
          <View style={s.milestonesHeader}>
            <Text style={s.weekStripTitle}>Milestones</Text>
            <Text style={s.milestonesHint}>Tap for details</Text>
          </View>
          <ScrollView ref={badgeScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgesRow}>
            {BADGE_DEFS.map(badge => {
              const earned = data.earnedBadges.includes(badge.type);
              const streakFrac = streakMs / 86400000;
              const progress = earned ? 1 : badge.days > 0 ? Math.min(1, streakFrac / badge.days) : 1;
              return (
                <Pressable key={badge.type} style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]} onPress={() => { setSelectedBadge(badge); setBadgeMsgIndex(Math.floor(Math.random() * 20)); }}>
                  <View style={[s.badgeCircle, earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={progress} />
                    <Text style={s.badgeEmoji}>{earned ? badge.emoji : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !earned && s.badgeLabelLocked]}>
                    {badge.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Mood check-in */}
        <View style={s.moodCard}>
          {data.todayMood !== null && !editingMood ? (
            <>
              <View style={s.moodDone}>
                <Text style={s.moodDoneEmoji}>{MOODS[data.todayMood - 1]}</Text>
                <View style={{ flex: 1 }}>
                  {data.todayMoodNote
                    ? <Text style={s.moodDoneNote}>{data.todayMoodNote}</Text>
                    : <Text style={s.moodDoneTxt}>Today's check-in done</Text>}
                </View>
                <Pressable onPress={() => { setEditingMood(true); setMoodNote(data.todayMoodNote ?? ''); setEditMoodValue(data.todayMood); }} style={({ pressed }) => [s.moodEditBtn, pressed && { opacity: 0.6 }]}>
                  <Text style={s.moodEditBtnTxt}>Edit</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={s.moodCardTitle}>How are you feeling today?</Text>
              {moodSubmitting ? (
                <ActivityIndicator color="#0F6E6E" style={{ marginTop: 8 }} />
              ) : (
                <>
                  <View style={s.moodRow}>
                    {MOODS.map((emoji, i) => (
                      <Pressable
                        key={i}
                        onPress={() => setEditMoodValue(i + 1)}
                        style={({ pressed }) => [s.moodBtn, pressed && s.pressed,
                          editMoodValue === i + 1 && s.moodBtnSelected]}>
                        <Text style={s.moodEmoji}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.moodInputRow}>
                    <TextInput
                      style={s.moodInputInline}
                      placeholder="Add a note (optional)"
                      placeholderTextColor="#bbb"
                      value={moodNote}
                      onChangeText={setMoodNote}
                      maxLength={200}
                      returnKeyType="done"
                    />
                    <Pressable
                      onPress={() => editMoodValue && handleMood(editMoodValue, moodNote)}
                      disabled={!editMoodValue}
                      style={({ pressed }) => [s.moodSaveBtn, !editMoodValue && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
                      <Text style={s.moodSaveTxt}>Save</Text>
                    </Pressable>
                  </View>
                  {editingMood && (
                    <Pressable onPress={() => { setEditingMood(false); setMoodNote(''); setEditMoodValue(null); }} style={({ pressed }) => [s.moodCancelBtn, pressed && { opacity: 0.6 }]}>
                      <Text style={s.moodCancelTxt}>Cancel</Text>
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}
        </View>

        {/* 7-day mood strip */}
        <View style={s.weekStrip}>
          <Text style={s.weekStripTitle}>Mood this week</Text>
          <View style={s.weekStripRow}>
          {data.weekMoods.map((day, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const dayLabel = d.toLocaleDateString([], { weekday: 'short' }).slice(0, 2);
            const isToday = i === 6;
            return (
              <View key={i} style={s.weekStripDay}>
                <Text style={[s.weekStripLabel, isToday && s.weekStripLabelToday]}>{dayLabel}</Text>
                <View style={[s.weekStripDot, isToday && s.weekStripDotToday]}>
                  {day.mood !== null
                    ? <Text style={s.weekStripEmoji}>{MOODS[day.mood - 1]}</Text>
                    : <View style={s.weekStripEmpty} />}
                </View>
              </View>
            );
          })}
          </View>
        </View>

        {/* Log urge */}
        <Pressable
          style={({ pressed }) => [s.urgeLogCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/urge')}>
          <Text style={s.urgeLogIcon}>🧠</Text>
          <View style={s.urgeLogText}>
            <Text style={s.urgeLogTitle}>Feeling an urge?</Text>
            <Text style={s.urgeLogSub}>Log a moment or get support</Text>
          </View>
          <Text style={s.urgeLogArrow}>›</Text>
        </Pressable>

        {/* Journal */}
        <Pressable
          style={({ pressed }) => [s.urgeLogCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/urge/journal')}>
          <Text style={s.urgeLogIcon}>📓</Text>
          <View style={s.urgeLogText}>
            <Text style={s.urgeLogTitle}>My Journal</Text>
            <Text style={s.urgeLogSub}>View your urges, payments and savings</Text>
          </View>
          <Text style={s.urgeLogArrow}>›</Text>
        </Pressable>

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

      {/* Badge detail modal */}
      <Modal visible={!!selectedBadge} transparent animationType="slide" onRequestClose={() => setSelectedBadge(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelectedBadge(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            {selectedBadge && (() => {
              const earned = data.earnedBadges.includes(selectedBadge.type);
              const earnedAt = data.badgeTimestamps[selectedBadge.type];
              const dailyRate = weeklyToDaily(data.weeklyBet);
              const streakFrac = streakMs / 86400000;
              const progress = earned ? 1 : selectedBadge.days > 0 ? Math.min(1, streakFrac / selectedBadge.days) : 1;
              const pct = Math.round(progress * 100);

              if (earned) {
                const earnedDate = data.quitDate
                  ? new Date(parseQuitDate(data.quitDate).getTime() + selectedBadge.days * 86400000)
                  : null;
                const daysSince = Math.floor(streakFrac - selectedBadge.days);
                const savedAtMilestone = selectedBadge.days * dailyRate;
                const savedTotal = streakDays * dailyRate;
                return (
                  <>
                    <Text style={s.modalEmoji}>{selectedBadge.emoji}</Text>
                    <Text style={s.modalTitle}>🎉 Congratulations!</Text>
                    <Text style={s.modalSubtitle}>{selectedBadge.label} milestone reached</Text>
                    <View style={s.modalDivider} />
                    {earnedDate && (
                      <View style={s.modalRow}>
                        <Text style={s.modalRowLabel}>Completed on</Text>
                        <Text style={s.modalRowValue}>{earnedDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                      </View>
                    )}
                    <View style={s.modalRow}>
                      <Text style={s.modalRowLabel}>Days since</Text>
                      <Text style={s.modalRowValue}>{daysSince} {daysSince === 1 ? 'day' : 'days'} ago</Text>
                    </View>
                    {dailyRate > 0 && (
                      <>
                        <View style={s.modalRow}>
                          <Text style={s.modalRowLabel}>Saved at milestone</Text>
                          <Text style={s.modalRowValue}>{fmt(savedAtMilestone, data.currency)}</Text>
                        </View>
                        <View style={s.modalRow}>
                          <Text style={s.modalRowLabel}>Saved total</Text>
                          <Text style={[s.modalRowValue, { color: '#0F6E6E' }]}>{fmt(savedTotal, data.currency)}</Text>
                        </View>
                      </>
                    )}
                    <Text style={s.modalMessage}>{BADGE_EARNED_MSGS[badgeMsgIndex]}</Text>
                  </>
                );
              } else {
                const daysLeft = selectedBadge.days - streakFrac;
                const estimatedDate = data.quitDate
                  ? new Date(parseQuitDate(data.quitDate).getTime() + selectedBadge.days * 86400000)
                  : null;
                const savedAtMilestone = selectedBadge.days * dailyRate;
                return (
                  <>
                    <Text style={s.modalEmoji}>🔒</Text>
                    <Text style={s.modalTitle}>{selectedBadge.label}</Text>
                    <Text style={s.modalSubtitle}>You're {pct}% of the way there</Text>
                    <View style={s.modalProgressBar}>
                      <View style={[s.modalProgressFill, { width: `${pct}%` }]} />
                    </View>
                    <View style={s.modalDivider} />
                    <View style={s.modalRow}>
                      <Text style={s.modalRowLabel}>Time remaining</Text>
                      <Text style={s.modalRowValue}>{formatTimeLeft(daysLeft)}</Text>
                    </View>
                    {estimatedDate && (
                      <View style={s.modalRow}>
                        <Text style={s.modalRowLabel}>Estimated on</Text>
                        <Text style={s.modalRowValue}>{estimatedDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                      </View>
                    )}
                    {dailyRate > 0 && (
                      <View style={s.modalRow}>
                        <Text style={s.modalRowLabel}>You'll have saved</Text>
                        <Text style={[s.modalRowValue, { color: '#0F6E6E' }]}>{fmt(savedAtMilestone, data.currency)}</Text>
                      </View>
                    )}
                    <Text style={s.modalMessage}>{BADGE_PENDING_MSGS[badgeMsgIndex]}</Text>
                  </>
                );
              }
            })()}
            <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setSelectedBadge(null)}>
              <Text style={s.modalCloseTxt}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  quote: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic', marginTop: 4 },

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
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  milestoneTxt: { fontSize: 13, color: '#fff', fontWeight: '500' },
  liveCounter: { fontSize: 14, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
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
  whyEmoji: { fontSize: 18 },
  whyText: { flex: 1, gap: 6 },
  whyLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whyValue: { fontSize: 14, color: '#111', fontWeight: '600' },

  // Stats
  savedCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', gap: 4,
  },
  savedLabel: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  savedValue: { fontSize: 32, fontWeight: '800', color: '#0F6E6E' },
  savedHint: { fontSize: 12, color: '#aaa', marginTop: 2 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#333' },

  // Mood
  moodCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12 },
  moodCardTitle: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  moodBtn: { padding: 4 },
  moodEmoji: { fontSize: 26 },
  moodDone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moodDoneEmoji: { fontSize: 22 },
  moodDoneTxt: { fontSize: 13, color: '#555', fontWeight: '500' },
  moodDoneNote: { fontSize: 13, color: '#333', fontStyle: 'italic' },
  moodEditBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#e6f7f7' },
  moodEditBtnTxt: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },
  moodBtnSelected: { backgroundColor: '#e6f7f7', borderRadius: 8 },
  moodInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  moodInputInline: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#333',
  },
  moodCancelBtn: { alignItems: 'center', marginTop: 6 },
  moodCancelTxt: { fontSize: 12, color: '#aaa' },
  moodSaveBtn: { backgroundColor: '#0F6E6E', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  moodSaveTxt: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // Badges
  badgesRow: { flexDirection: 'row', gap: 18, paddingVertical: 4 },
  badgeItem: { alignItems: 'center', gap: 5, width: 57 },
  badgeCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badgeEarned: { backgroundColor: '#e6f7f7' },
  badgeLocked: { backgroundColor: '#f5f5f5' },
  badgeEmoji: { fontSize: 20 },
  milestonesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  milestonesHint: { fontSize: 11, color: '#aaa', fontStyle: 'italic' },
  badgeLabel: { fontSize: 10, color: '#555', fontWeight: '600', textAlign: 'center' },
  badgeLabelLocked: { color: '#bbb' },

  urgeLogCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  urgeLogIcon: { fontSize: 26 },
  urgeLogText: { flex: 1 },
  urgeLogTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  urgeLogSub: { fontSize: 13, color: '#888', marginTop: 2 },
  urgeLogArrow: { fontSize: 22, color: '#aaa', fontWeight: '300' },

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

  // Week mood strip
  weekStrip: { backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 10 },
  weekStripTitle: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 },
  weekStripRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekStripDay: { alignItems: 'center', gap: 6 },
  weekStripLabel: { fontSize: 10, color: '#aaa', fontWeight: '600' },
  weekStripLabelToday: { color: '#0F6E6E' },
  weekStripDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  weekStripDotToday: { backgroundColor: '#e6f7f7' },
  weekStripEmoji: { fontSize: 18 },
  weekStripEmpty: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0e0e0' },

  pressed: { opacity: 0.7 },

  // Badge modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 93, gap: 8,
    elevation: 0, shadowOpacity: 0,
  },
  modalEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111', textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 4 },
  modalDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  modalRowLabel: { fontSize: 14, color: '#888' },
  modalRowValue: { fontSize: 14, fontWeight: '600', color: '#111' },
  modalProgressBar: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  modalProgressFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 3 },
  modalMessage: { fontSize: 13, color: '#888', fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginTop: 8 },
  modalClose: {
    marginTop: 30, backgroundColor: '#0F6E6E', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCloseTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
