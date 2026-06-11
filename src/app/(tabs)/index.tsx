import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@/context/user';
import Svg, { Circle } from 'react-native-svg';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { DEFAULT_NOTIF_PREFS, scheduleAllNotifications } from '@/lib/notifications';
import { CHECKLIST_KEY, CHECKLIST_TOTAL, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY, SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY } from '@/constants/storage-keys';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const MILESTONES = [1/24, 3/24, 6/24, 12/24, 1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 365, 548, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650];

const BADGE_DEFS = [
  { type: 'started',  emoji: '🚀', label: 'Started',  days: 0 },
  { type: '1_hour',   emoji: '⏰', label: '1 Hour',   days: 1/24 },
  { type: '3_hours',  emoji: '🌤️', label: '3 Hours',  days: 3/24 },
  { type: '6_hours',  emoji: '☀️', label: '6 Hours',  days: 6/24 },
  { type: '12_hours', emoji: '🌗', label: '12 Hours', days: 12/24 },
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


const BADGE_CELEBRATIONS = [
  { icon: '🎉', text: 'Congratulations!' },
  { icon: '💪', text: 'You actually did it.' },
  { icon: '🌅', text: 'A new chapter.' },
  { icon: '🔥', text: 'Unstoppable.' },
  { icon: '🥹', text: 'So proud of you.' },
  { icon: '⚡', text: 'That took real strength.' },
  { icon: '🌱', text: 'Look how far you\'ve come.' },
  { icon: '🏅', text: 'Hard-earned. Yours forever.' },
  { icon: '✨', text: 'This is what progress looks like.' },
  { icon: '🎯', text: 'You said you would. You did.' },
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

function formatStreakDual(ms: number): string {
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days  = Math.floor(ms / 86400000);
  const weeks = Math.floor(days / 7);
  if (weeks >= 1) {
    const d = days - weeks * 7;
    return d > 0 ? `${weeks}w ${d}d` : `${weeks}w`;
  }
  if (days >= 1) {
    const h = hours - days * 24;
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  }
  if (hours >= 1) {
    const m = mins - hours * 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  if (mins >= 1) return `${mins}m`;
  return '< 1m';
}

function getMilestone(ms: number) {
  const days = ms / 86400000;
  const next = MILESTONES.find(m => m > days) ?? 3650;
  const prevIdx = MILESTONES.indexOf(next) - 1;
  const prev = prevIdx >= 0 ? MILESTONES[prevIdx] : 0;
  const progress = prev === next ? 1 : (days - prev) / (next - prev);
  const remainingMs = Math.max(0, next * 86400000 - ms);
  return { next, remainingMs, progress: Math.min(1, Math.max(0, progress)) };
}

function fmtCountdown(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years >= 1) {
    const rem = Math.floor((days % 365) / 30);
    return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
  }
  if (months >= 1) {
    const rem = Math.floor((days % 30) / 7);
    return rem > 0 ? `${months}mo ${rem}w` : `${months}mo`;
  }
  if (weeks >= 1) {
    const rem = days % 7;
    return rem > 0 ? `${weeks}w ${rem}d` : `${weeks}w`;
  }
  if (days >= 1) {
    const rem = Math.floor((ms % 86400000) / 3600000);
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  }
  if (hours >= 1) {
    const rem = Math.floor((ms % 3600000) / 60000);
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  }
  return totalMins > 0 ? `${totalMins}m` : '< 1m';
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
  const rounded = Math.round(amount * 100) / 100;
  return `${s}${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function formatBest(days: number, ms: number) {
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const totalDays = Math.floor(ms / 86400000);
  const weeks = Math.floor(totalDays / 7);
  const months = Math.floor(totalDays / 30);
  const years = Math.floor(totalDays / 365);
  const isCurrentBest = totalDays === days;

  if (isCurrentBest) {
    if (totalDays === 0 && hours === 0) return `${mins}m`;
    if (totalDays === 0) return `${hours}h ${mins}m`;
    if (totalDays < 7) return `${totalDays}d ${hours}h`;
    if (totalDays < 30) return `${weeks}w ${totalDays % 7}d`;
    if (totalDays < 365) return `${months}mo ${totalDays % 30}d`;
    return `${years}y ${Math.floor((totalDays % 365) / 30)}mo`;
  }

  if (days === 0) return 'just started';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w ${days % 7}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
}

function formatTimeLeft(days: number): string {
  if (days <= 0) return 'now';
  if (days < 1 / 24) return `${Math.ceil(days * 1440)} min`;
  if (days < 1) return `${Math.ceil(days * 24)} hour${Math.ceil(days * 24) !== 1 ? 's' : ''}`;
  const d = Math.ceil(days);
  return `${d} day${d !== 1 ? 's' : ''}`;
}

function fmtTimeSince(ms: number): string {
  if (ms < 60000) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) {
    const rem = mins % 60;
    return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(ms / 86400000);
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

function milestoneLabel(days: number) {
  const map: Record<number, string> = {
    [1/24]: '1 hour', [3/24]: '3 hours', [6/24]: '6 hours', [12/24]: '12 hours',
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
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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
  const p = Math.floor(progress * 10) / 10;
  const r = Math.round(20 + (34 - 20) * p);
  const g = Math.round(80 + (197 - 80) * p);
  const b = Math.round(40 + (94 - 40) * p);
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
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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

function SubDayCountdown({ quitDate, nextDays, style }: { quitDate: string; nextDays: number; style: any }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const targetMs = parseQuitDate(quitDate).getTime() + nextDays * 86400000;
  const remaining = Math.max(0, targetMs - Date.now());
  if (remaining <= 0) return <Text style={style}>{`🎉 ${milestoneLabel(nextDays)} — milestone reached!`}</Text>;
  return <Text style={style}>{`${fmtCountdown(remaining)} to reach ${milestoneLabel(nextDays)}`}</Text>;
}

function SavingsGoalCard({ goal, totalPaid, goalFor, goalIcon, currency }: {
  goal: number; totalPaid: number; goalFor: string; goalIcon: string; currency: string;
}) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const pct = Math.min(1, goal > 0 ? totalPaid / goal : 0);
  const pctDisplay = Math.round(pct * 100);
  const remaining = Math.max(0, goal - totalPaid);
  const done = pct >= 1;
  return (
    <View style={s.goalCard}>
      <View style={s.goalRow}>
        <Text style={s.goalEmoji}>{goalIcon}</Text>
        <View style={s.goalBody}>
          <Text style={s.goalLabel}>{done ? 'Goal reached! ' : 'Saving towards'}</Text>
          <Text style={s.goalName} numberOfLines={1}>{goalFor || 'My goal'}</Text>
        </View>
        <View style={s.goalAmts}>
          <Text style={s.goalPaid}>{fmt(totalPaid, currency)}</Text>
          <Text style={s.goalTotal}>of {fmt(goal, currency)}</Text>
        </View>
      </View>
      <View style={s.goalBarBg}>
        <View style={[s.goalBarFill, { width: `${pctDisplay}%` as any }, done && s.goalBarDone]} />
      </View>
      <View style={s.goalFootRow}>
        <Text style={[s.goalPct, done && { color: c.success }]}>{pctDisplay}% complete</Text>
        {!done && <Text style={s.goalRemaining}>{fmt(remaining, currency)} to go</Text>}
      </View>
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
  earnedBadges: string[];
  badgeTimestamps: Record<string, string>;
  todayMood: number | null;
  todayMoodNote: string | null;
  todayMoodId: string | null;
  weekMoods: { date: string; mood: number | null; note: string | null }[];
  totalLost: number;
  totalPaid: number;
  debtItems: { id: string; name: string; totalAmount: number; paidAmount: number; earned: boolean; earnedAt: string | null }[];
  checklistCompleted: boolean;
  checklistProgress: number; // 0–1
  savingsGoal: number | null;
  savingsGoalFor: string;
  savingsGoalIcon: string;
}

function fmtLive(amount: number, currency = 'USD') {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency;
  return `${s}${amount.toFixed(1)}`;
}

function SavedCard({ quitDate, weeklyBet, currency, totalPaid, nowMs }: {
  quitDate: string | null; weeklyBet: string | null; currency: string;
  totalLost: number; totalPaid: number; nowMs: number;
}) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const ms = quitDate ? Math.max(0, nowMs - parseQuitDate(quitDate).getTime()) : 0;
  const moneySaved = (ms / 86400000) * weeklyToDaily(weeklyBet);
  return (
    <View style={s.savedCard}>
      <View style={s.savedRow}>
        <Text style={s.savedEmoji}>💸</Text>
        <View style={s.savedBody}>
          <Text style={s.savedLabel}>Not spent since day one</Text>
          <Text style={s.savedSub}>
            {weeklyBet ? `Theoretical · ${fmt(Number(weeklyBet), currency)}/week` : 'Set weekly spending in Tracker'}
          </Text>
        </View>
        <Text style={[s.savedAmt, { color: c.textMuted }]}>{fmtLive(moneySaved, currency)}</Text>
      </View>
      {totalPaid > 0 && (
        <>
          <View style={s.savedSep} />
          <View style={s.savedRow}>
            <Text style={s.savedEmoji}>💰</Text>
            <View style={s.savedBody}>
              <Text style={s.savedLabel}>Total banked</Text>
              <Text style={s.savedSub}>Money you've set aside</Text>
            </View>
            <Text style={[s.savedAmt, { color: c.success }]}>{fmt(totalPaid, currency)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { avatarUrl } = useUser();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moodSubmitting, setMoodSubmitting] = useState(false);
  const [relapseLoading, setRelapseLoading] = useState(false);
  const [relapseConfirmVisible, setRelapseConfirmVisible] = useState(false);
  const [tick, setTick] = useState(0);
  const prevNextMilestone = useRef<number | null>(null);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [selectedBadge, setSelectedBadge] = useState<typeof BADGE_DEFS[0] | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [checklistBadgeVisible, setChecklistBadgeVisible] = useState(false);
  const [goalSetBadgeVisible, setGoalSetBadgeVisible] = useState(false);
  const [goalReachedBadgeVisible, setGoalReachedBadgeVisible] = useState(false);
  const badgeScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const fetchingRef = useRef(false);
  const moodScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moodCardY, setMoodCardY] = useState(0);
  const [badgeMsgIndex, setBadgeMsgIndex] = useState(0);
  const [editingMood, setEditingMood] = useState(false);
  const [moodNote, setMoodNote] = useState('');
  const [editMoodValue, setEditMoodValue] = useState<number | null>(null);

  // Auto-refresh when a milestone is crossed so the badge is awarded and the display updates
  useEffect(() => {
    if (!data?.quitDate) return;
    const ms = Math.max(0, Date.now() - parseQuitDate(data.quitDate).getTime());
    const { next } = getMilestone(ms);
    if (prevNextMilestone.current !== null && prevNextMilestone.current !== next) {
      fetchData();
    }
    prevNextMilestone.current = next;
  }, [tick]);

  const randomQuote = useCallback(() => {
    setQuoteIndex(i => {
      let next = i;
      while (next === i) next = Math.floor(Math.random() * QUOTES.length);
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { fetchingRef.current = false; return; }

    const today = todayStr();

    const [profileRes, streakRes, badgesRes, moodRes, weekMoodRes, lossesRes, debtsRes, debtPaymentsRes] = await Promise.all([
      supabase.from('users').select('display_name, motivation, quit_date, quit_timestamp, weekly_bet, currency, notif_milestone').eq('id', user.id).single(),
      supabase.from('streaks').select('longest_streak').eq('user_id', user.id).single(),
      supabase.from('badges').select('badge_type, earned_at').eq('user_id', user.id),
      supabase.from('mood_checkins').select('id, mood, note').eq('user_id', user.id).gte('created_at', localMidnight()).maybeSingle(),
      supabase.from('mood_checkins').select('mood, note, created_at').eq('user_id', user.id).gte('created_at', (() => { const t = new Date(); const sun = new Date(t); sun.setDate(t.getDate() - t.getDay()); return new Date(sun.getFullYear(), sun.getMonth(), sun.getDate()).toISOString(); })()).order('created_at', { ascending: true }),
      supabase.from('losses').select('type, amount').eq('user_id', user.id).eq('type', 'saving'),
      supabase.from('debts').select('id, name, total_amount').eq('user_id', user.id),
      supabase.from('debt_payments').select('debt_id, amount').eq('user_id', user.id),
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

    const dedupeGuard = new Set([...earnedBadges]);

    const toAward = BADGE_DEFS.filter(b => streakDaysFloat >= b.days && !dedupeGuard.has(b.type));
    if (toAward.length > 0) {
      // Insert individually — null error = newly inserted, code 23505 = already exists.
      // This is reliable even when the SELECT above returns stale/empty data due to RLS.
      const newlyAwarded: typeof toAward = [];
      for (const b of toAward) {
        const { error } = await supabase.from('badges').insert({ user_id: user.id, badge_type: b.type });
        if (!error) newlyAwarded.push(b);
      }

      // Only log and notify for badges actually inserted this run
      const toLog = newlyAwarded.filter(b => b.days > 0);
      if (toLog.length > 0) {
        await supabase.from('losses').insert(toLog.map(b => ({
          user_id: user.id, type: 'milestone_earned', amount: Math.floor(b.days),
          category: 'Milestone', note: `${b.emoji} ${b.label}`,
        })));

        // Send immediate notification for each newly earned milestone
        // (scheduleAllNotifications skips past-due milestones, so we fire in-app here)
        if (profile?.notif_milestone) {
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'granted') {
            for (const b of toLog) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `${b.emoji} ${b.label} milestone!`,
                  body: `You've been clean for ${b.label}. That's a real achievement — keep going.`,
                  data: { screen: '/(tabs)/' },
                },
                trigger: null,
              });
            }
          }
        }
      }

      newlyAwarded.forEach(b => earnedBadges.push(b.type));
    }

    // Update longest streak
    const streak = Math.floor(streakDaysFloat);
    const longest = streakRes.data?.longest_streak ?? 0;
    if (streak > longest) {
      await supabase.from('streaks').update({ longest_streak: streak }).eq('user_id', user.id);
    }

    const lossRows = lossesRes.data ?? [];
    const totalLost = 0;
    const totalPaid = lossRows.reduce((s, r) => s + Number(r.amount), 0);

    const debtRows = debtsRes.data ?? [];
    const paymentRows = debtPaymentsRes.data ?? [];
    const paidByDebt: Record<string, number> = {};
    for (const p of paymentRows) {
      paidByDebt[p.debt_id] = (paidByDebt[p.debt_id] ?? 0) + Number(p.amount);
    }
    const debtItems = debtRows.map(d => {
      const paidAmount = paidByDebt[d.id] ?? 0;
      const earned = paidAmount >= Number(d.total_amount);
      const badgeType = `debt_${d.id}`;
      return { id: d.id, name: d.name, totalAmount: Number(d.total_amount), paidAmount, earned, earnedAt: badgeTimestamps[badgeType] ?? null };
    });
    const newDebtBadges = debtItems
      .filter(d => d.earned && !dedupeGuard.has(`debt_${d.id}`))
      .map(d => ({ user_id: user.id, badge_type: `debt_${d.id}` }));
    if (newDebtBadges.length > 0) {
      await supabase.from('badges').upsert(newDebtBadges, { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
      newDebtBadges.forEach(b => earnedBadges.push(b.badge_type));
    }

    // Savings goal badges
    const [savingsGoalRaw, savingsGoalForRaw, savingsGoalIconRaw, checklistRaw, checklistBadgeSent, goalSetBadgeSent, goalReachedBadgeSent] = await Promise.all([
      AsyncStorage.getItem(SAVINGS_GOAL_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
      AsyncStorage.getItem(CHECKLIST_KEY),
      AsyncStorage.getItem(CHECKLIST_BADGE_SENT_KEY),
      AsyncStorage.getItem(GOAL_SET_BADGE_SENT_KEY),
      AsyncStorage.getItem(GOAL_REACHED_BADGE_SENT_KEY),
    ]);
    const savingsGoalAmount = savingsGoalRaw ? Number(savingsGoalRaw) : null;
    const totalManualSavings = lossRows.reduce((s, r) => s + Number(r.amount), 0);

    if (savingsGoalAmount && !goalSetBadgeSent) {
      await AsyncStorage.setItem(GOAL_SET_BADGE_SENT_KEY, '1');
      await supabase.from('badges').upsert([{ user_id: user.id, badge_type: 'goal_set' }], { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
      await supabase.from('losses').insert({ user_id: user.id, type: 'milestone_earned', amount: 0, category: 'Milestone', note: '📍 Goal Setter badge earned' });
      earnedBadges.push('goal_set');
      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      if (notifStatus === 'granted') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '📍 Goal Setter badge earned!',
            body: "You've set a savings goal. Having a target makes recovery real — keep saving.",
            data: { screen: '/(tabs)/' },
          },
          trigger: Platform.OS === 'android'
            ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false, channelId: 'cornerday' } as any
            : null,
        });
      }
    }
    if (savingsGoalAmount && savingsGoalAmount > 0 && totalManualSavings >= savingsGoalAmount && !goalReachedBadgeSent) {
      await AsyncStorage.setItem(GOAL_REACHED_BADGE_SENT_KEY, '1');
      await supabase.from('badges').upsert([{ user_id: user.id, badge_type: 'goal_reached' }], { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
      await supabase.from('losses').insert({ user_id: user.id, type: 'milestone_earned', amount: savingsGoalAmount, category: 'Milestone', note: '🎊 Savings goal reached' });
      earnedBadges.push('goal_reached');
      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      if (notifStatus === 'granted') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎊 Goal Reached badge earned!',
            body: "You've reached your savings goal. That's a massive achievement — be proud.",
            data: { screen: '/(tabs)/' },
          },
          trigger: Platform.OS === 'android'
            ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false, channelId: 'cornerday' } as any
            : null,
        });
      }
    }

    // Prevention checklist badge — driven by AsyncStorage, no DB insert needed
    let checklistData: Record<string, boolean> = {};
    try { checklistData = checklistRaw ? JSON.parse(checklistRaw) : {}; } catch { /* corrupted, treat as empty */ }
    const checklistChecked = Object.values(checklistData).filter(Boolean).length;
    const checklistCompleted = checklistChecked >= CHECKLIST_TOTAL;
    if (checklistCompleted && !checklistBadgeSent) {
      await AsyncStorage.setItem(CHECKLIST_BADGE_SENT_KEY, '1');
      await supabase.from('losses').insert({
        user_id: user.id, type: 'milestone_earned', amount: 0,
        category: 'Milestone', note: '🛡️ Safe Zone — prevention checklist completed',
      });
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🛡️ Safe Zone badge earned!',
            body: "You've completed every step of the prevention checklist. Your recovery is protected.",
            data: { screen: '/(tabs)/' },
          },
          trigger: Platform.OS === 'android'
            ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false, channelId: 'cornerday' } as any
            : null,
        });
      }
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
      totalLost,
      totalPaid,
      debtItems,
      checklistCompleted,
      checklistProgress: CHECKLIST_TOTAL > 0 ? Math.min(1, checklistChecked / CHECKLIST_TOTAL) : 0,
      savingsGoal: savingsGoalAmount,
      savingsGoalFor: savingsGoalForRaw ?? '',
      savingsGoalIcon: savingsGoalIconRaw ?? '🎯',
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
        const today = new Date();
        const sun = new Date(today);
        sun.setDate(today.getDate() - today.getDay());
        return Array.from({ length: 7 }, (_, i) => {
          const d = new Date(sun);
          d.setDate(sun.getDate() + i);
          const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString();
          return { date: key, mood: byDate[key]?.mood ?? null, note: byDate[key]?.note ?? null };
        });
      })(),
    });
    } finally {
      fetchingRef.current = false;
    }
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

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => {
      clearInterval(id);
      if (moodScrollTimerRef.current) clearTimeout(moodScrollTimerRef.current);
    };
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
    const timer = setTimeout(() => {
      badgeScrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [data?.earnedBadges.length]);

  // Award badges in real-time when the live counter crosses a threshold (fetchData only runs on focus/mount).
  const lastBadgeFetchMs = useRef(0);
  useEffect(() => {
    if (!data) return;
    const hasUnearned = BADGE_DEFS.some(
      b => b.days > 0 && streakMs >= b.days * 86400000 && !data.earnedBadges.includes(b.type)
    );
    if (hasUnearned && Date.now() - lastBadgeFetchMs.current > 30_000) {
      lastBadgeFetchMs.current = Date.now();
      fetchData();
    }
  }, [streakMs, data, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    randomQuote();
    await fetchData();
    setRefreshing(false);
  }, [fetchData, randomQuote]);

  // Must be before any early returns to follow Rules of Hooks
  const nowMs = useMemo(() => Date.now(), [tick]);
  const streakInfo = useMemo(() => calcStreakInfo(data?.quitDate ?? null), [data?.quitDate, tick]);
  const { value: streakValue, unit: streakUnit, days: streakDays, ms: streakMs } = streakInfo;

  const shareStreak = async () => {
    const label = streakDays >= 1
      ? `${streakDays} day${streakDays !== 1 ? 's' : ''}`
      : `${streakValue} ${streakUnit}`;
    await Share.share({
      message: `${label} free from gambling! 💪\n\nThe day you turn it around starts today. #CornerDay`,
      title: 'My Recovery Streak',
    });
  };

  const shareMilestone = async () => {
    if (!selectedBadge) return;
    const label = streakDays >= 1 ? `${streakDays} day${streakDays !== 1 ? 's' : ''}` : `${streakValue} ${streakUnit}`;
    await Share.share({
      message: `I just hit my ${selectedBadge.label} milestone! ${selectedBadge.emoji}\n\n${label} free from gambling and counting. 💪\n#CornerDay #Recovery`,
      title: `${selectedBadge.label} Milestone`,
    });
  };

  const postToCommunity = () => {
    if (!selectedBadge) return;
    const label = streakDays >= 1 ? `${streakDays} day${streakDays !== 1 ? 's' : ''}` : `${streakValue} ${streakUnit}`;
    const content = `Just hit my ${selectedBadge.label} milestone! ${selectedBadge.emoji} ${label} free from gambling and counting. 💪`;
    setSelectedBadge(null);
    router.push({ pathname: '/(tabs)/community/new-post', params: { initialContent: content, initialTag: '#Milestone' } } as any);
  };

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

  const handleClearMood = async () => {
    if (!data?.todayMoodId) return;
    setMoodSubmitting(true);
    await supabase.from('mood_checkins').delete().eq('id', data.todayMoodId);
    const todayKey = new Date().toLocaleDateString();
    setData(prev => {
      if (!prev) return prev;
      const weekMoods = prev.weekMoods.map(d => d.date === todayKey ? { ...d, mood: null, note: null } : d);
      return { ...prev, todayMood: null, todayMoodNote: null, todayMoodId: null, weekMoods };
    });
    setEditingMood(false);
    setMoodNote('');
    setEditMoodValue(null);
    setMoodSubmitting(false);
  };

  const handleRelapse = () => setRelapseConfirmVisible(true);

  const doRelapse = async () => {
    setRelapseLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const today = todayStr();
      const newQuitTimestamp = new Date().toISOString();
      const days = streakDays;
      await Promise.all([
        supabase.from('users').update({ quit_date: today, quit_timestamp: newQuitTimestamp }).eq('id', user.id),
        supabase.from('streaks').update({ current_streak: 0, streak_start_date: today }).eq('user_id', user.id),
        supabase.from('badges').delete().eq('user_id', user.id),
        supabase.from('losses').insert({
          user_id: user.id, type: 'streak_reset', amount: 0,
          category: 'Streak Reset',
          note: days > 0 ? `After ${days} day${days !== 1 ? 's' : ''}` : null,
        }),
      ]);
      // Reschedule notifications against the new quit timestamp
      const { data: prefsRow } = await supabase
        .from('users')
        .select('notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching')
        .eq('id', user.id)
        .single();
      const prefs = {
        notif_milestone: prefsRow?.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
        notif_daily_streak: prefsRow?.notif_daily_streak ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
        notif_daily_checkin: prefsRow?.notif_daily_checkin ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
        notif_weekly_summary: prefsRow?.notif_weekly_summary ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
        notif_milestone_approaching: prefsRow?.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
      };
      await scheduleAllNotifications(prefs, newQuitTimestamp);
      // Optimistic reset: update local state immediately so the UI reacts without
      // racing against useFocusEffect (which also calls fetchData and may have a
      // stale quit_timestamp if the user navigates to account before this resolves).
      setData(prev => prev ? {
        ...prev,
        quitDate: newQuitTimestamp,
        earnedBadges: [],
        badgeTimestamps: {},
      } : prev);
    }
    setRelapseLoading(false);
  };


  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (!data) return null;

  const { next, remainingMs, progress } = getMilestone(streakMs);
  const motivations = (data.motivation ?? '').split(',').filter(Boolean).map(
    m => MOTIVATION_MAP[m] ?? { label: m, emoji: '💪' }
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* ── Header ── */}
      <LinearGradient colors={[c.headerGradStart, c.headerGradEnd]} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <View style={s.headerTop}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.greeting}>{getGreeting(data.displayName)}</Text>
                <Text style={s.quote} numberOfLines={2}>"{QUOTES[quoteIndex]}"</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/account' as any)} hitSlop={10}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={s.headerAvatar} />
                ) : (
                  <View style={s.headerAvatarFallback}>
                    <Ionicons name="person" size={18} color={c.primary} />
                  </View>
                )}
              </Pressable>
            </View>

            {/* Streak card inside header */}
            <View style={s.streakCard}>
              <CircularProgress progress={progress} next={next} />
              <View style={s.streakRight}>
                <View style={s.streakTitleRow}>
                  <Text style={s.streakTitle}>Current streak</Text>
                  <Pressable onPress={shareStreak} hitSlop={8}>
                    <Ionicons name="share-outline" size={15} color="rgba(255,255,255,0.65)" />
                  </Pressable>
                </View>
                <LiveCounter quitDate={data.quitDate} />
                <View style={s.separator} />
                {next < 1 && data.quitDate
                  ? <SubDayCountdown quitDate={data.quitDate} nextDays={next} style={s.milestoneTxt} />
                  : <Text style={s.milestoneTxt}>
                      {remainingMs <= 0
                        ? `🎉 ${milestoneLabel(next)} — milestone reached!`
                        : `${fmtCountdown(remainingMs)} to reach ${milestoneLabel(next)}`}
                    </Text>
                }
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
        ref={bodyScrollRef}
        style={s.body}
        contentContainerStyle={s.bodyContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>

        {/* Stats */}
        <SavedCard quitDate={data.quitDate} weeklyBet={data.weeklyBet} currency={data.currency} totalLost={data.totalLost} totalPaid={data.totalPaid} nowMs={nowMs} />

        {/* Badges */}
        <View style={s.card}>
          <View style={s.milestonesHeader}>
            <Text style={s.weekStripTitle}>Milestones</Text>
            <Text style={s.milestonesHint}>Tap for details</Text>
          </View>
          <ScrollView ref={badgeScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgesRow}>
            {BADGE_DEFS.map(badge => {
              // started badge (days: 0) is earned from day 0 — always show as earned
              const earned = badge.days === 0 || data.earnedBadges.includes(badge.type);
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
            {data.debtItems.map(debt => {
              const progress = debt.earned ? 1 : debt.totalAmount > 0 ? Math.min(1, debt.paidAmount / debt.totalAmount) : 0;
              return (
                <Pressable key={debt.id} style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  onPress={() => { setSelectedDebtId(debt.id); setBadgeMsgIndex(Math.floor(Math.random() * 20)); }}>
                  <View style={[s.badgeCircle, debt.earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={progress} />
                    <Text style={s.badgeEmoji}>{debt.earned ? '🏦' : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !debt.earned && s.badgeLabelLocked]} numberOfLines={1} ellipsizeMode="tail">{debt.name} paid</Text>
                </Pressable>
              );
            })}
            {(() => {
              const earned = data.checklistCompleted;
              return (
                <Pressable style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  onPress={() => { setChecklistBadgeVisible(true); setBadgeMsgIndex(Math.floor(Math.random() * 20)); }}>
                  <View style={[s.badgeCircle, earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={earned ? 1 : data.checklistProgress} />
                    <Text style={s.badgeEmoji}>{earned ? '🛡️' : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !earned && s.badgeLabelLocked]} numberOfLines={1}>Safe Zone</Text>
                </Pressable>
              );
            })()}
            {(() => {
              const earned = data.earnedBadges.includes('goal_set');
              return (
                <Pressable style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  onPress={() => { setGoalSetBadgeVisible(true); setBadgeMsgIndex(Math.floor(Math.random() * 20)); }}>
                  <View style={[s.badgeCircle, earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={earned ? 1 : 0} />
                    <Text style={s.badgeEmoji}>{earned ? '📍' : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !earned && s.badgeLabelLocked]} numberOfLines={1}>Goal Setter</Text>
                </Pressable>
              );
            })()}
            {(() => {
              const earned = data.earnedBadges.includes('goal_reached');
              const progress = data.savingsGoal && data.savingsGoal > 0
                ? Math.min(1, data.totalPaid / data.savingsGoal) : 0;
              return (
                <Pressable style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  onPress={() => { setGoalReachedBadgeVisible(true); setBadgeMsgIndex(Math.floor(Math.random() * 20)); }}>
                  <View style={[s.badgeCircle, earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={earned ? 1 : progress} />
                    <Text style={s.badgeEmoji}>{earned ? '🎊' : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !earned && s.badgeLabelLocked]} numberOfLines={1}>Goal Met</Text>
                </Pressable>
              );
            })()}
          </ScrollView>
        </View>

        {/* Log urge */}
        <Pressable
          style={({ pressed }) => [s.urgeLogCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/urge')}>
          <Text style={s.urgeLogIcon}>🧠</Text>
          <View style={s.urgeLogText}>
            <Text style={s.urgeLogTitle}>Feeling an urge?</Text>
            <Text style={s.urgeLogSub}>Support is one tap away</Text>
          </View>
          <Text style={s.urgeLogArrow}>›</Text>
        </Pressable>

        {/* Mood check-in */}
        <View style={s.moodCard} onLayout={e => setMoodCardY(e.nativeEvent.layout.y)}>
          {data.todayMood !== null && !editingMood ? (
            <>
              <View style={s.moodDone}>
                <View style={s.moodDoneRow}>
                  <Text style={s.moodDoneLabel}>Today's mood: </Text>
                  <Text style={s.moodDoneEmoji}>{MOODS[data.todayMood - 1]}</Text>
                  {data.todayMoodNote
                    ? <Text style={s.moodDoneNote} numberOfLines={1}>{' '}{data.todayMoodNote}</Text>
                    : null}
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
                <ActivityIndicator color={c.primary} style={{ marginTop: 8 }} />
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
                      placeholderTextColor={c.textFaint}
                      value={moodNote}
                      onChangeText={setMoodNote}
                      maxLength={200}
                      returnKeyType="done"
                      onFocus={() => {
                        if (moodScrollTimerRef.current) clearTimeout(moodScrollTimerRef.current);
                        moodScrollTimerRef.current = setTimeout(() => bodyScrollRef.current?.scrollTo({ y: moodCardY, animated: true }), 300);
                      }}
                    />
                    <Pressable
                      onPress={() => editMoodValue && handleMood(editMoodValue, moodNote)}
                      disabled={!editMoodValue}
                      style={({ pressed }) => [s.moodSaveBtn, !editMoodValue && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
                      <Text style={s.moodSaveTxt}>Save</Text>
                    </Pressable>
                  </View>
                  {editingMood && (
                    <View style={s.moodCancelRow}>
                      <Pressable onPress={handleClearMood} style={({ pressed }) => [s.moodCancelBtn, pressed && { opacity: 0.6 }]}>
                        <Text style={s.moodClearTxt}>Clear today's mood</Text>
                      </Pressable>
                      <Pressable onPress={() => { setEditingMood(false); setMoodNote(''); setEditMoodValue(null); }} style={({ pressed }) => [s.moodCancelBtn, pressed && { opacity: 0.6 }]}>
                        <Text style={s.moodCancelTxt}>Cancel</Text>
                      </Pressable>
                    </View>
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
            const today = new Date();
            const sun = new Date(today);
            sun.setDate(today.getDate() - today.getDay());
            const d = new Date(sun);
            d.setDate(sun.getDate() + i);
            const dayLabel = d.toLocaleDateString([], { weekday: 'short' }).slice(0, 2);
            const isToday = i === today.getDay();
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

        {/* Analytics */}
        <Pressable
          style={({ pressed }) => [s.urgeLogCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/analytics' as any)}>
          <Text style={s.urgeLogIcon}>📊</Text>
          <View style={s.urgeLogText}>
            <Text style={s.urgeLogTitle}>Progress Analytics</Text>
            <Text style={s.urgeLogSub}>Mood trends, savings history & more</Text>
          </View>
          <Text style={s.urgeLogArrow}>›</Text>
        </Pressable>

        {/* Your why */}
        {motivations.length > 0 && (
          <View style={s.whyAnchorCard}>
            <Text style={s.whyAnchorLabel}>Your why</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.whyAnchorRow}>
              {motivations.map((m, i) => (
                <View key={i} style={s.whyAnchorChip}>
                  <Text style={s.whyAnchorEmoji}>{m.emoji}</Text>
                  <Text style={s.whyAnchorText}>{m.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

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
              ? <ActivityIndicator color={c.textMuted} size="small" />
              : <Text style={s.relapseBtnTxt}>Reset my streak</Text>}
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Badge detail modal */}
      <Modal visible={!!selectedBadge} transparent animationType="fade" onRequestClose={() => setSelectedBadge(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelectedBadge(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            {selectedBadge && (() => {
              const earned = data.earnedBadges.includes(selectedBadge.type);
              const earnedAt = data.badgeTimestamps[selectedBadge.type];
              const dailyRate = weeklyToDaily(data.weeklyBet);
              const streakFrac = streakMs / 86400000;
              // Treat as completed if streak has already passed this milestone,
              // even if the DB row is missing (e.g. after a reset without re-award)
              const isPast = streakFrac >= selectedBadge.days;
              const progress = (earned || isPast) ? 1 : selectedBadge.days > 0 ? Math.min(1, streakFrac / selectedBadge.days) : 1;
              const pct = Math.round(progress * 100);

              if (earned || isPast) {
                // Prefer actual earned_at timestamp; fall back to calculated completion date
                const completedDate = earnedAt
                  ? new Date(earnedAt)
                  : (data.quitDate
                    ? new Date(parseQuitDate(data.quitDate).getTime() + selectedBadge.days * 86400000)
                    : null);
                const msSince = Math.max(0, streakMs - selectedBadge.days * 86400000);
                const savedAtMilestone = selectedBadge.days * dailyRate;
                const savedTotal = (streakMs / 86400000) * dailyRate;
                return (
                  <>
                    <Text style={s.modalEmoji}>{selectedBadge.emoji}</Text>
                    <Text style={s.modalTitle}>{BADGE_CELEBRATIONS[badgeMsgIndex % BADGE_CELEBRATIONS.length].icon} {BADGE_CELEBRATIONS[badgeMsgIndex % BADGE_CELEBRATIONS.length].text}</Text>
                    <Text style={s.modalSubtitle}>{selectedBadge.label} milestone reached</Text>
                    <View style={s.modalDivider} />
                    {completedDate && (
                      <View style={s.modalRow}>
                        <Text style={s.modalRowLabel}>Completed on</Text>
                        <Text style={s.modalRowValue}>{completedDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                      </View>
                    )}
                    <View style={s.modalRow}>
                      <Text style={s.modalRowLabel}>Achieved</Text>
                      <Text style={s.modalRowValue}>{fmtTimeSince(msSince)}</Text>
                    </View>
                    {selectedBadge.days > 0 && (
                      dailyRate > 0 ? (
                        <>
                          <View style={s.modalRow}>
                            <Text style={s.modalRowLabel}>Saved at milestone</Text>
                            <Text style={s.modalRowValue}>{fmt(savedAtMilestone, data.currency)}</Text>
                          </View>
                          <View style={s.modalRow}>
                            <Text style={s.modalRowLabel}>Saved total</Text>
                            <Text style={[s.modalRowValue, { color: c.primary }]}>{fmt(savedTotal, data.currency)}</Text>
                          </View>
                        </>
                      ) : (
                        <View style={s.modalRow}>
                          <Text style={s.modalRowLabel}>Saved total</Text>
                          <Text style={[s.modalRowValue, { color: c.textFaint }]}>Set weekly spend in Tracker</Text>
                        </View>
                      )
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
                        <Text style={[s.modalRowValue, { color: c.primary }]}>{fmt(savedAtMilestone, data.currency)}</Text>
                      </View>
                    )}
                    <Text style={s.modalMessage}>{BADGE_PENDING_MSGS[badgeMsgIndex]}</Text>
                  </>
                );
              }
            })()}
            <View style={s.modalActions}>
              {selectedBadge && (data.earnedBadges.includes(selectedBadge.type) || streakMs / 86400000 >= selectedBadge.days) && (
                <View style={s.modalShareRow}>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={shareMilestone}>
                    <Ionicons name="share-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Share</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={postToCommunity}>
                    <Ionicons name="people-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Community</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setSelectedBadge(null)}>
                <Text style={s.modalCloseTxt}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reset streak confirmation */}
      <Modal visible={relapseConfirmVisible} transparent animationType="fade" onRequestClose={() => setRelapseConfirmVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setRelapseConfirmVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            
            <View style={s.confirmIconRow}>
              <View style={s.confirmIconCircle}>
                <Text style={{ fontSize: 28 }}>🔄</Text>
              </View>
            </View>
            <Text style={s.confirmTitle}>Reset your streak?</Text>
            <Text style={s.confirmBody}>
              This will start your streak from today.{'\n'}It's okay — every restart is still progress.
            </Text>
            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setRelapseConfirmVisible(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.confirmReset, relapseLoading && { opacity: 0.6 }]}
                onPress={() => { setRelapseConfirmVisible(false); doRelapse(); }}
                disabled={relapseLoading}>
                <Text style={s.confirmResetTxt}>Reset streak</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Debt badge modal */}
      {/* Prevention checklist badge modal */}
      <Modal visible={checklistBadgeVisible} transparent animationType="fade" onRequestClose={() => setChecklistBadgeVisible(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setChecklistBadgeVisible(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            {(() => {
              const earned = data.checklistCompleted;
              const cel = BADGE_CELEBRATIONS[badgeMsgIndex % BADGE_CELEBRATIONS.length];
              return (
                <>
                  <Text style={s.modalEmoji}>{earned ? '🛡️' : '🔒'}</Text>
                  <Text style={s.modalTitle}>{earned ? `${cel.icon} ${cel.text}` : 'Safe Zone'}</Text>
                  <Text style={s.modalSubtitle}>
                    {earned
                      ? 'Prevention checklist completed'
                      : 'Complete the prevention checklist in the Support tab to earn this badge'}
                  </Text>
                  <View style={s.modalDivider} />
                  <Text style={s.modalMessage}>
                    {earned
                      ? 'You\'ve taken every practical step to protect your recovery. That takes real courage and commitment.'
                      : 'The prevention checklist walks you through 13 practical steps — from deleting apps and blocking transactions to self-exclusion and building your support network.'}
                  </Text>
                </>
              );
            })()}
            <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setChecklistBadgeVisible(false)}>
              <Text style={s.modalCloseTxt}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Goal setter badge modal */}
      <Modal visible={goalSetBadgeVisible} transparent animationType="fade" onRequestClose={() => setGoalSetBadgeVisible(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setGoalSetBadgeVisible(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            {(() => {
              const earned = data.earnedBadges.includes('goal_set');
              const cel = BADGE_CELEBRATIONS[badgeMsgIndex % BADGE_CELEBRATIONS.length];
              return (
                <>
                  <Text style={s.modalEmoji}>{earned ? '📍' : '🔒'}</Text>
                  <Text style={s.modalTitle}>{earned ? `${cel.icon} ${cel.text}` : 'Goal Setter'}</Text>
                  <Text style={s.modalSubtitle}>{earned ? 'Savings goal set' : 'Set a savings goal to earn this badge'}</Text>
                  <View style={s.modalDivider} />
                  <Text style={s.modalMessage}>
                    {earned
                      ? 'You\'ve given your savings a purpose. Having a goal turns money saved into something meaningful — keep building.'
                      : 'Head to the Tracker tab, tap your savings goal, and set a target amount. Having something to aim for makes every dollar saved feel real.'}
                  </Text>
                </>
              );
            })()}
            <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setGoalSetBadgeVisible(false)}>
              <Text style={s.modalCloseTxt}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Goal reached badge modal */}
      <Modal visible={goalReachedBadgeVisible} transparent animationType="fade" onRequestClose={() => setGoalReachedBadgeVisible(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setGoalReachedBadgeVisible(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            {(() => {
              const earned = data.earnedBadges.includes('goal_reached');
              const cel = BADGE_CELEBRATIONS[badgeMsgIndex % BADGE_CELEBRATIONS.length];
              const progress = data.savingsGoal && data.savingsGoal > 0
                ? Math.min(1, data.totalPaid / data.savingsGoal) : 0;
              return (
                <>
                  <Text style={s.modalEmoji}>{earned ? '🎊' : '🔒'}</Text>
                  <Text style={s.modalTitle}>{earned ? `${cel.icon} ${cel.text}` : 'Goal Met'}</Text>
                  <Text style={s.modalSubtitle}>
                    {earned
                      ? 'Savings goal reached'
                      : data.savingsGoal
                        ? `${Math.round(progress * 100)}% of the way there`
                        : 'Set a savings goal in the Tracker tab'}
                  </Text>
                  <View style={s.modalDivider} />
                  <Text style={s.modalMessage}>
                    {earned
                      ? 'You set a goal and you reached it. That\'s not luck — that\'s discipline and commitment. What you\'ve built here is real.'
                      : data.savingsGoal
                        ? 'Every saving logged moves you closer to this badge. Keep going — you\'re doing it.'
                        : 'Set a savings goal in the Tracker tab to start tracking your progress toward this badge.'}
                  </Text>
                </>
              );
            })()}
            <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setGoalReachedBadgeVisible(false)}>
              <Text style={s.modalCloseTxt}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!selectedDebtId} transparent animationType="fade" onRequestClose={() => setSelectedDebtId(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelectedDebtId(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            {selectedDebtId && (() => {
              const debt = data.debtItems.find(d => d.id === selectedDebtId);
              if (!debt) return null;
              const pct = Math.round(debt.earned ? 100 : debt.totalAmount > 0 ? Math.min(100, (debt.paidAmount / debt.totalAmount) * 100) : 0);
              const owed = Math.max(0, debt.totalAmount - debt.paidAmount);
              const cel = BADGE_CELEBRATIONS[badgeMsgIndex % BADGE_CELEBRATIONS.length];
              return (
                <>
                  <Text style={s.modalEmoji}>{debt.earned ? '🏦' : '🔒'}</Text>
                  <Text style={s.modalTitle}>{debt.earned ? `${cel.icon} ${cel.text}` : `${debt.name} paid`}</Text>
                  <Text style={s.modalSubtitle}>{debt.earned ? `${debt.name} — fully paid` : `${pct}% of the way there`}</Text>
                  {!debt.earned && (
                    <View style={s.modalProgressBar}>
                      <View style={[s.modalProgressFill, { width: `${pct}%` }]} />
                    </View>
                  )}
                  <View style={s.modalDivider} />
                  <View style={s.modalRow}>
                    <Text style={s.modalRowLabel}>Total</Text>
                    <Text style={s.modalRowValue}>{fmt(debt.totalAmount, data.currency)}</Text>
                  </View>
                  <View style={s.modalRow}>
                    <Text style={s.modalRowLabel}>Paid back</Text>
                    <Text style={[s.modalRowValue, { color: c.primary }]}>{fmt(debt.paidAmount, data.currency)}</Text>
                  </View>
                  {owed > 0 && (
                    <View style={s.modalRow}>
                      <Text style={s.modalRowLabel}>Still owed</Text>
                      <Text style={[s.modalRowValue, { color: c.error }]}>{fmt(owed, data.currency)}</Text>
                    </View>
                  )}
                  {debt.earned && <Text style={s.modalMessage}>{BADGE_EARNED_MSGS[badgeMsgIndex]}</Text>}
                </>
              );
            })()}
            <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setSelectedDebtId(null)}>
              <Text style={s.modalCloseTxt}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { paddingBottom: 20 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12, gap: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  headerAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 21, fontWeight: '700', color: c.white },
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
  streakTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakTitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  milestoneTxt: { fontSize: 13, color: c.white, fontWeight: '500' },
  liveCounter: { fontSize: 14, fontWeight: '700', color: c.white, fontVariant: ['tabular-nums'] },
  longestTxt: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  startedTxt: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  resetLink: { marginTop: 2 },
  resetLinkTxt: { fontSize: 11, color: '#ff8a80', fontWeight: '600' },

  // Circular
  circPct: { fontSize: 32, fontWeight: '800', color: c.white, lineHeight: 36 },
  circTime: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 },

  // Body
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  // Your why
  whyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bgCard,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: c.primary,
  },
  whyEmoji: { fontSize: 18 },
  whyText: { flex: 1, gap: 6 },
  whyLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whyValue: { fontSize: 14, color: c.textPrimary, fontWeight: '600' },

  // Stats
  savedCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16 },
  savedTitle: { fontSize: 12, fontWeight: '700', color: c.textFaint, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savedSep: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 12 },
  savedEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  savedBody: { flex: 1 },
  savedLabel: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  savedSub: { fontSize: 12, color: c.textFaint, marginTop: 2 },
  savedAmt: { fontSize: 17, fontWeight: '800' },

  // Card
  card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: c.textSecondary },

  // Mood
  moodCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 12 },
  moodCardTitle: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  moodBtn: { padding: 4 },
  moodEmoji: { fontSize: 26 },
  moodDone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moodDoneRow: { flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'nowrap' },
  moodDoneLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
  moodDoneEmoji: { fontSize: 18 },
  moodDoneNote: { fontSize: 13, color: c.textBody, flex: 1 },
  moodEditBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.bgTeal },
  moodEditBtnTxt: { fontSize: 12, color: c.primary, fontWeight: '700' },
  moodBtnSelected: { backgroundColor: c.bgTeal, borderRadius: 8 },
  moodInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  moodInputInline: {
    flex: 1, borderWidth: 1, borderColor: c.borderLight, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: c.textSecondary,
  },
  moodCancelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  moodCancelBtn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  moodCancelTxt: { fontSize: 12, color: c.textFaint },
  moodClearTxt: { fontSize: 12, color: c.error },
  moodSaveBtn: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  moodSaveTxt: { fontSize: 13, color: c.white, fontWeight: '700' },

  // Badges
  badgesRow: { flexDirection: 'row', gap: 18, paddingVertical: 4 },
  badgeItem: { alignItems: 'center', gap: 5, width: 57 },
  badgeCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badgeEarned: { backgroundColor: c.bgTeal },
  badgeLocked: { backgroundColor: c.bgElement },
  badgeEmoji: { fontSize: 20 },
  milestonesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  milestonesHint: { fontSize: 11, color: c.textFaint, fontStyle: 'italic' },
  badgeLabel: { fontSize: 10, color: c.textBody, fontWeight: '600', textAlign: 'center' },
  badgeLabelLocked: { color: c.textFaint },

  urgeLogCard: {
    backgroundColor: c.bgCard, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  urgeLogIcon: { fontSize: 26 },
  urgeLogText: { flex: 1 },
  urgeLogTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  urgeLogSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  urgeLogArrow: { fontSize: 22, color: c.textFaint, fontWeight: '300' },

  // Your why anchor
  whyAnchorCard: {
    backgroundColor: c.bgCard,
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: c.primary,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 0,
    overflow: 'hidden',
  },
  whyAnchorLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  whyAnchorRow: { flexDirection: 'row', gap: 8, paddingRight: 16, alignItems: 'center' },
  whyAnchorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.bgElement, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  whyAnchorEmoji: { fontSize: 16 },
  whyAnchorText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },

  // Relapse
  relapseCard: {
    backgroundColor: c.bgCard,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  relapseTitle: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  relapseSubtitle: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 18 },
  relapseBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.borderError,
    backgroundColor: c.bgError,
  },
  relapseBtnTxt: { fontSize: 13, color: c.error, fontWeight: '600' },

  // Week mood strip
  weekStrip: { backgroundColor: c.bgCard, borderRadius: 14, padding: 12, gap: 10 },
  weekStripTitle: { fontSize: 12, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  weekStripRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekStripDay: { alignItems: 'center', gap: 6 },
  weekStripLabel: { fontSize: 10, color: c.textFaint, fontWeight: '600' },
  weekStripLabelToday: { color: c.primary },
  weekStripDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.bgElement, alignItems: 'center', justifyContent: 'center' },
  weekStripDotToday: { backgroundColor: c.bgTeal },
  weekStripEmoji: { fontSize: 18 },
  weekStripEmpty: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.borderLight },

  pressed: { opacity: 0.7 },

  // Badge modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay, padding: 24 },
  modalSheet: {
    backgroundColor: c.bgCard, borderRadius: 22, width: '100%',
    padding: 24, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  modalEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: c.textBody, textAlign: 'center', marginBottom: 4 },
  modalDivider: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 8 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  modalRowLabel: { fontSize: 14, color: c.textMuted },
  modalRowValue: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  modalProgressBar: { height: 6, backgroundColor: c.borderSubtle, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  modalProgressFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 3 },
  modalMessage: { fontSize: 13, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginTop: 8 },
  modalActions: { flexDirection: 'column', gap: 10, marginTop: 16 },
  modalShareRow: { flexDirection: 'row', gap: 10 },
  modalShareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    backgroundColor: c.bgTeal, borderWidth: 1, borderColor: c.primary,
  },
  modalShareTxt: { color: c.primary, fontWeight: '700', fontSize: 15 },
  modalClose: {
    backgroundColor: c.bgElement, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCloseTxt: { color: c.textBody, fontWeight: '700', fontSize: 15 },

  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay, padding: 24 },
  confirmSheet: {
    backgroundColor: c.bgCard, borderRadius: 22, padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  confirmIconRow: { alignItems: 'center', marginBottom: 12 },
  confirmIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff8f0', borderWidth: 1.5, borderColor: '#f5d0a0',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 21, marginBottom: 4 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.bgElement },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  confirmReset: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.error },
  confirmResetTxt: { color: c.white, fontWeight: '700', fontSize: 15 },

  // Savings goal card
  goalCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalEmoji: { fontSize: 26, width: 32, textAlign: 'center' },
  goalBody: { flex: 1, gap: 2 },
  goalLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  goalName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
  goalAmts: { alignItems: 'flex-end' },
  goalPaid: { fontSize: 15, fontWeight: '800', color: c.primary },
  goalTotal: { fontSize: 11, color: c.textFaint },
  goalBarBg: { height: 8, backgroundColor: c.borderSubtle, borderRadius: 4, overflow: 'hidden' },
  goalBarFill: { height: '100%', backgroundColor: c.primaryMid, borderRadius: 4 },
  goalBarDone: { backgroundColor: c.success },
  goalFootRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalPct: { fontSize: 12, color: c.primary, fontWeight: '600' },
  goalRemaining: { fontSize: 12, color: c.textFaint },
});
