import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import PreferencesIllustration from '@/components/PreferencesIllustration';
import * as Notifications from 'expo-notifications';
import { maybeRequestReview } from '@/lib/review';
import { supabase } from '@/lib/supabase';
import { parseQuitDate } from '@/lib/parseQuitDate';
import { DEFAULT_NOTIF_PREFS, scheduleAllNotifications, scheduleOnboardingCheckin, scheduleUrgePredictionNotification } from '@/lib/notifications';
import { notifySupporter } from '@/lib/notifySupporter';
import { haptic, hapticMedium } from '@/lib/haptics';
import { showInterstitialIfReady } from '@/lib/ads';
import { usePurchases } from '@/context/purchases';
import { CHECKLIST_KEY, CHECKLIST_TOTAL, SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY, MILESTONE_NOTIFS_KEY, PROFILE_NUDGE_SHOWN_KEY, MOTIVATION_PHOTO_KEY, STREAK_SHIELD_KEY, SHIELD_UNDO_KEY, CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_CELEBRATED_KEY, URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY } from '@/constants/storage-keys';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';
import { SkeletonBox } from '@/components/skeleton';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import Logo from '@/components/Logo';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { setImagePickerActive } from '@/lib/image-picker-active';
import { registerHomeRefresh, unregisterHomeRefresh } from '@/lib/homeBus';
import { authFlags } from '@/lib/auth-flags';
import { MilestoneCelebrationModal } from '@/components/MilestoneCelebrationModal';
import { BADGE_CELEBRATIONS, BADGE_DEFS, BADGE_EARNED_MSGS } from '@/constants/badgeConstants';

// ─── Constants ────────────────────────────────────────────────────────────────

const MILESTONES = [1/24, 3/24, 6/24, 12/24, 1, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 100, 120, 150, 180, 200, 270, 365, 500, 548, 730, 821, 912, 1000, 1095, 1186, 1278, 1369, 1460, 1551, 1643, 1734, 1825, 1917, 2008, 2099, 2190, 2281, 2373, 2464, 2555, 2646, 2738, 2829, 2920, 3011, 3103, 3194, 3285, 3376, 3468, 3559, 3650];

const SHARE_TAGLINES = [
  'The day you turn it around starts today.',
  'Every day clean is a victory worth celebrating.',
  "You're stronger than any urge.",
  'One day at a time. One win at a time.',
  'The money you didn\'t lose is already yours.',
  'Your future self is cheering you on.',
  'Breaking free is the hardest and best thing you\'ll ever do.',
  'This is what courage looks like.',
  'You chose yourself today.',
  'The streak is proof — you can do this.',
  'Every no to gambling is a yes to your future.',
  'Progress over perfection, always.',
  'Your recovery is real and it matters.',
  'You didn\'t give in. That\'s everything.',
  'The best bet you ever made was stopping.',
  'Showing up for yourself, every single day.',
  'The hardest part is already behind you.',
  'What you\'re building here is worth more than any win.',
  'This is your story. You\'re writing a better one.',
  'Keep going. You\'re closer than you think.',
];

const ACTIVITY_BADGE_DEFS = [
  { type: 'first_checkin',    emoji: '🧘', label: 'First Check-in',  earned: 'First mood check-in logged.',                 pending: 'Log your first mood check-in on the home screen.' },
  { type: 'checkins_7',      emoji: '🗓️', label: '7 Check-ins',     earned: '7 mood check-ins logged.',                    pending: 'Log 7 mood check-ins.' },
  { type: 'checkins_14',     emoji: '📆', label: '14 Check-ins',    earned: '14 mood check-ins logged.',                   pending: 'Log 14 mood check-ins.' },
  { type: 'checkins_30',     emoji: '📅', label: '30 Check-ins',    earned: '30 mood check-ins logged.',                   pending: 'Log 30 mood check-ins.' },
  { type: 'checkins_50',     emoji: '✅', label: '50 Check-ins',    earned: '50 mood check-ins logged.',                   pending: 'Log 50 mood check-ins.' },
  { type: 'checkins_75',     emoji: '🌟', label: '75 Check-ins',    earned: '75 mood check-ins logged.',                   pending: 'Log 75 mood check-ins.' },
  { type: 'checkins_100',    emoji: '🏅', label: '100 Check-ins',   earned: '100 mood check-ins logged.',                  pending: 'Log 100 mood check-ins.' },
  { type: 'checkins_200',    emoji: '🎯', label: '200 Check-ins',   earned: '200 mood check-ins logged.',                  pending: 'Log 200 mood check-ins.' },
  { type: 'checkins_365',    emoji: '📖', label: '365 Check-ins',   earned: '365 mood check-ins — a full year of tracking.',pending: 'Log 365 mood check-ins.' },
  { type: 'first_journal',   emoji: '📝', label: 'First Entry',     earned: 'First urge journal entry logged.',            pending: 'Log an urge from the Support screen.' },
  { type: 'urge_overcame_1', emoji: '🛡️', label: 'Urge Fighter',   earned: 'Overcame your first urge.',                   pending: 'Log an urge you overcame in the Support screen.' },
  { type: 'urge_overcame_5', emoji: '🌱', label: '5 Urges',        earned: 'Overcame 5 urges.',                           pending: 'Overcome 5 urges.' },
  { type: 'urge_overcame_10',emoji: '💪', label: '10 Urges',       earned: 'Overcame 10 urges.',                          pending: 'Overcome 10 urges.' },
  { type: 'urge_overcame_25',emoji: '⚔️', label: '25 Urges',       earned: 'Overcame 25 urges.',                          pending: 'Overcome 25 urges.' },
  { type: 'urge_overcame_50',emoji: '🔰', label: '50 Urges',       earned: 'Overcame 50 urges.',                          pending: 'Overcome 50 urges.' },
  { type: 'urge_overcame_75',emoji: '🦅', label: '75 Urges',       earned: 'Overcame 75 urges.',                          pending: 'Overcome 75 urges.' },
  { type: 'urge_overcame_100',emoji:'🏆', label: '100 Urges',      earned: 'Overcame 100 urges.',                         pending: 'Overcome 100 urges.' },
  { type: 'loss_first_log',  emoji: '🧭', label: 'Honest Start',   earned: 'Faced your situation honestly — that takes real courage.', pending: 'Log a loss or add a debt in the Tracker tab.' },
  { type: 'first_payment',   emoji: '💰', label: 'First Payment',  earned: 'First debt payment logged.',                  pending: 'Log a payment in the Tracker tab.' },
  { type: 'payments_5',      emoji: '📈', label: '5 Payments',     earned: '5 debt payments logged.',                     pending: 'Log 5 payments in the Tracker tab.' },
  { type: 'payments_10',     emoji: '💸', label: '10 Payments',    earned: '10 debt payments logged.',                    pending: 'Log 10 payments in the Tracker tab.' },
  { type: 'payments_25',     emoji: '🏦', label: '25 Payments',    earned: '25 debt payments logged.',                    pending: 'Log 25 payments in the Tracker tab.' },
  { type: 'payments_50',     emoji: '🌿', label: '50 Payments',    earned: '50 debt payments logged.',                    pending: 'Log 50 payments in the Tracker tab.' },
  { type: 'payments_100',    emoji: '🎖️', label: '100 Payments',   earned: '100 debt payments logged.',                   pending: 'Log 100 payments in the Tracker tab.' },
  { type: 'community_first_post', emoji: '🤝', label: 'First Story', earned: 'Posted your first story to the community.', pending: 'Share your first post in the Community tab.' },
];

const PAYMENT_BADGE_TYPES = ['first_payment', 'payments_5', 'payments_10', 'payments_25', 'payments_50', 'payments_100'];
const CHECKIN_BADGE_TYPES = ['first_checkin', 'checkins_7', 'checkins_14', 'checkins_30', 'checkins_50', 'checkins_75', 'checkins_100', 'checkins_200', 'checkins_365'];
const URGE_BADGE_TYPES    = ['first_journal', 'urge_overcame_1', 'urge_overcame_5', 'urge_overcame_10', 'urge_overcame_25', 'urge_overcame_50', 'urge_overcame_75', 'urge_overcame_100'];
const ACTIVITY_BADGE_THRESHOLDS: Record<string, number> = {
  first_checkin: 1, checkins_7: 7, checkins_14: 14, checkins_30: 30, checkins_50: 50, checkins_75: 75, checkins_100: 100, checkins_200: 200, checkins_365: 365,
  first_journal: 1, urge_overcame_1: 1, urge_overcame_5: 5, urge_overcame_10: 10, urge_overcame_25: 25, urge_overcame_50: 50, urge_overcame_75: 75, urge_overcame_100: 100,
  first_payment: 1, payments_5: 5, payments_10: 10, payments_25: 25, payments_50: 50, payments_100: 100,
};

const MOODS = ['😢', '😕', '😐', '🙂', '😄'];
const MOOD_LABELS = ['Rough', 'Meh', 'Okay', 'Good', 'Great'];

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
  const first = name?.split(' ')?.[0];
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

function formatStreakFull(ms: number): string {
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days  = Math.floor(ms / 86400000);
  const weeks = Math.floor(days / 7);
  if (weeks >= 1) { const d = days - weeks * 7; return d > 0 ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ${d} ${d === 1 ? 'day' : 'days'}` : `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`; }
  if (days >= 1)  { const h = hours - days * 24; return h > 0 ? `${days} ${days === 1 ? 'day' : 'days'} ${h} ${h === 1 ? 'hour' : 'hours'}` : `${days} ${days === 1 ? 'day' : 'days'}`; }
  if (hours >= 1) { const m = mins - hours * 60; return m > 0 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} ${m} ${m === 1 ? 'minute' : 'minutes'}` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`; }
  if (mins >= 1) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  return '< 1 minute';
}

function getMilestone(ms: number) {
  const days = ms / 86400000;
  const next = MILESTONES.find(m => m > days) ?? 3650;
  const remainingMs = Math.max(0, next * 86400000 - ms);
  // Measured from the quit date (day 0) to the next milestone, not from the
  // previous milestone — the ring shows "how close to [next milestone]", and
  // a 6-day streak with "1 Week" as the label should read as ~86% (6/7), not
  // 50% (as it would if measured from the prior 5-day badge instead).
  const progress = Math.min(1, days / next);
  return { next, remainingMs, progress };
}

function fmtCountdown(ms: number, ceilHours = false): string {
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
    const remH = ceilHours
      ? Math.ceil((ms % 86400000) / 3600000)
      : Math.floor((ms % 86400000) / 3600000);
    if (remH >= 24) return `${days + 1}d`;
    return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
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
    if (totalDays === 0 && hours === 0) return mins > 0 ? `${mins}m` : 'just started';
    if (totalDays === 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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
  return formatStreakFull(days * 86400000);
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
  return BADGE_DEFS.find(b => b.days === days)?.label ?? `${days} days`;
}

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


// mood_checkins.local_date is an explicit date column the client sets at
// insert time (see todayStr() below) — the DB's uniqueness constraint is
// keyed on it, not on created_at, so there's no timestamp-boundary math to
// get wrong here. (An earlier version of this tried to approximate "today"
// via created_at range queries against a UTC-day-scoped DB constraint;
// those two boundaries disagree for any non-UTC timezone during some part
// of the day, in both directions — a real mood log could get silently
// rejected as a duplicate of a differently-dated row, or a genuinely new
// day's entry could get merged into an old one and immediately display as
// unset again. Storing the local day explicitly removes the ambiguity.)

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

  useFocusEffect(useCallback(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []));

  if (!quitDate) return null;

  const ms = Math.max(0, Date.now() - parseQuitDate(quitDate).getTime());
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const years = Math.floor(days / 365);
  const months = Math.floor(days / 30);
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 365;
  const remainingAfterMonths = days - months * 30;
  const remainingAfterWeeks = days % 7;
  const label = years >= 1
    ? `${plural(years, 'year')}${remainingDays > 0 ? `, ${plural(remainingDays, 'day')}` : ''}`
    : months >= 1
      ? `${plural(months, 'month')}${remainingAfterMonths > 0 ? `, ${plural(remainingAfterMonths, 'day')}` : ''}`
      : weeks >= 2
        ? `${plural(weeks, 'week')}${remainingAfterWeeks > 0 ? `, ${plural(remainingAfterWeeks, 'day')}` : ''}`
        : days > 0
          ? `${plural(days, 'day')}${hours > 0 ? `, ${plural(hours, 'hour')}` : mins > 0 ? `, ${plural(mins, 'minute')}` : ''}`
          : hours > 0
            ? `${plural(hours, 'hour')}${mins > 0 ? `, ${plural(mins, 'minute')}` : ''}`
            : mins > 0
              ? `${plural(mins, 'minute')}, ${plural(secs, 'second')}`
              : secs > 0 ? `${plural(secs, 'second')}` : 'just started';

  return <Text style={s.liveCounter}>{label}</Text>;
}

function SubDayCountdown({ quitDate, nextDays, style }: { quitDate: string; nextDays: number; style: any }) {
  const [, setTick] = useState(0);
  useFocusEffect(useCallback(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []));
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

function computeCheckinStreak(rows: { created_at: string }[]): { current: number; best: number } {
  const unique = [...new Set(rows.map(r => new Date(r.created_at).toLocaleDateString('en-CA')))]
    .sort().reverse();
  if (unique.length === 0) return { current: 0, best: 0 };
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const yesterStr = yest.toLocaleDateString('en-CA');
  let current = 0;
  if (unique[0] === todayStr || unique[0] === yesterStr) {
    // Use noon to avoid DST midnight edge cases when stepping back one day at a time
    const d = new Date(unique[0] + 'T12:00:00');
    for (const dateStr of unique) {
      if (dateStr === d.toLocaleDateString('en-CA')) { current++; d.setDate(d.getDate() - 1); }
      else break;
    }
  }
  let best = 0, run = 1;
  for (let i = 1; i < unique.length; i++) {
    const a = new Date(unique[i - 1] + 'T12:00:00');
    const b = new Date(unique[i] + 'T12:00:00');
    const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
    if (diff === 1) { run++; } else { best = Math.max(best, run); run = 1; }
  }
  best = Math.max(best, run);
  return { current, best };
}

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
  totalPaid: number;
  debtItems: { id: string; name: string; totalAmount: number; paidAmount: number; earned: boolean; earnedAt: string | null }[];
  checklistCompleted: boolean;
  checklistProgress: number; // 0–1
  savingsGoal: number | null;
  savingsGoalFor: string;
  savingsGoalIcon: string;
  checkinStreak: { current: number; best: number };
  calendarDays: { iso: string; status: 'clean' | 'relapse' | 'inactive'; mood: number | null }[];
  moodCount: number;
  urgesOvercome: number;
  paymentCount: number;
}

function fmtLive(amount: number, currency = 'USD') {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency;
  return `${s}${amount.toFixed(1)}`;
}

function SavedCard({ quitDate, weeklyBet, currency, totalPaid, nowMs }: {
  quitDate: string | null; weeklyBet: string | null; currency: string;
  totalPaid: number; nowMs: number;
}) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const ms = quitDate ? Math.max(0, nowMs - parseQuitDate(quitDate).getTime()) : 0;
  const moneySaved = (ms / 86400000) * weeklyToDaily(weeklyBet);
  return (
    <View style={s.savedCard}>
      {!!weeklyBet && (
        <View style={s.savedRow}>
          <Text style={s.savedEmoji}>💸</Text>
          <View style={s.savedBody}>
            <Text style={s.savedLabel}>Not spent since day one</Text>
            <Text style={s.savedSub}>{`Theoretical · ${fmt(Number(weeklyBet), currency)}/week`}</Text>
          </View>
          <Text style={[s.savedAmt, { color: c.textMuted }]}>{fmtLive(moneySaved, currency)}</Text>
        </View>
      )}
      {totalPaid > 0 && (
        <>
          {!!weeklyBet && <View style={s.savedSep} />}
          <View style={s.savedRow}>
            <Text style={s.savedEmoji}>💰</Text>
            <View style={s.savedBody}>
              <Text style={s.savedLabel}>Total banked</Text>
              <Text style={s.savedSub}>Money you&apos;ve set aside</Text>
            </View>
            <Text style={[s.savedAmt, { color: c.success }]}>{fmt(totalPaid, currency)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function SavedCardWrapper(props: Parameters<typeof SavedCard>[0]) {
  const { weeklyBet, totalPaid } = props;
  if (!weeklyBet && totalPaid === 0) return null;
  return <SavedCard {...props} />;
}

// ─── Milestone celebration ─────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors: c, colorScheme } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { checkin, scrollTo } = useLocalSearchParams<{ checkin?: string; scrollTo?: string }>();
  const cc = colorScheme === 'dark' ? {
    gradient:        ['#062e2e', '#0F6E6E', '#1a9a9a'] as const,
    brand:           'rgba(255,255,255,0.7)',
    bigText:         '#ffffff',
    unit:            'rgba(255,255,255,0.8)',
    sub:             'rgba(255,255,255,0.7)',
    pillBg:          'rgba(255,255,255,0.15)',
    pillTxt:         '#ffffff',
    divider:         'rgba(255,255,255,0.2)',
    stat:            'rgba(255,255,255,0.85)',
    detailBg:        'rgba(255,255,255,0.08)',
    detailBorder:    'rgba(255,255,255,0.12)',
    detailLabel:     'rgba(255,255,255,0.55)',
    detailValue:     '#ffffff',
    detailHighlight: '#a8d8d0',
    tagline:         'rgba(255,255,255,0.55)',
    hashtag:         'rgba(255,255,255,0.4)',
    progressTrack:   'rgba(255,255,255,0.18)',
    progressFill:    '#a8d8d0',
  } : {
    gradient:        ['#f8fefe', '#edfafa', '#dff5f5'] as const,
    brand:           '#0a6868',
    bigText:         '#0F6E6E',
    unit:            '#0F6E6E',
    sub:             'rgba(10,104,104,0.65)',
    pillBg:          'rgba(15,110,110,0.1)',
    pillTxt:         '#0F6E6E',
    divider:         'rgba(15,110,110,0.15)',
    stat:            '#0F6E6E',
    detailBg:        'rgba(15,110,110,0.06)',
    detailBorder:    'rgba(15,110,110,0.12)',
    detailLabel:     'rgba(10,104,104,0.7)',
    detailValue:     '#0a5a5a',
    detailHighlight: '#0F6E6E',
    tagline:         'rgba(6,46,46,0.5)',
    hashtag:         'rgba(15,110,110,0.4)',
    progressTrack:   'rgba(15,110,110,0.15)',
    progressFill:    '#0F6E6E',
  };
  const { avatarUrl } = useUser();
  const { isPremium } = usePurchases();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moodSubmitting, setMoodSubmitting] = useState(false);
  const [relapseLoading, setRelapseLoading] = useState(false);
  const [relapseConfirmVisible, setRelapseConfirmVisible] = useState(false);
  const [tick, setTick] = useState(0);
  const prevNextMilestone = useRef<number | null>(null);
  const celebrationQueue = useRef<NonNullable<typeof celebrationBadge>[]>([]);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [selectedBadge, setSelectedBadge] = useState<typeof BADGE_DEFS[0] | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [checklistBadgeVisible, setChecklistBadgeVisible] = useState(false);
  const [goalSetBadgeVisible, setGoalSetBadgeVisible] = useState(false);
  const [goalReachedBadgeVisible, setGoalReachedBadgeVisible] = useState(false);
  const badgeScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const fetchingRef = useRef(false);
  const pendingFetchRef = useRef(false);
  const isMountedRef = useRef(true);
  // Guards against fetchData's badge-award loop (computed from a snapshot of
  // quit_timestamp) racing with doRelapse (which resets quit_timestamp and
  // deletes all badges) — see doRelapse and the badge-award loop in fetchData.
  const relapseInProgressRef = useRef(false);
  const moodScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrolledBadgeCountRef = useRef(0);
  const [moodCardY, setMoodCardY] = useState(0);
  const [badgesCardY, setBadgesCardY] = useState(0);

  // Auto-scroll to mood check-in when arriving from 3-day check-in notification
  useEffect(() => {
    if (checkin === 'true' && moodCardY > 0) {
      const t = setTimeout(() => bodyScrollRef.current?.scrollTo({ y: moodCardY, animated: true }), 500);
      return () => clearTimeout(t);
    }
  }, [checkin, moodCardY]);

  // Auto-scroll to badges/milestones section when arriving from milestone notification
  useEffect(() => {
    if (scrollTo === 'badges' && badgesCardY > 0) {
      const t = setTimeout(() => bodyScrollRef.current?.scrollTo({ y: badgesCardY, animated: true }), 500);
      return () => clearTimeout(t);
    }
  }, [scrollTo, badgesCardY]);

  // Declared here (rather than with the rest of the state further down) because
  // the two useFocusEffect callbacks immediately below reference their setters.
  const [showProfileNudge, setShowProfileNudge] = useState(false);
  const [motivationPhoto, setMotivationPhoto] = useState<string | null>(null);
  const [shieldEnabled, setShieldEnabled] = useState(false);
  const [shieldUndo, setShieldUndo] = useState<{ prevQuit: string; prevStreakDays: number; expiresAt: number } | null>(null);
  const [customMilestone, setCustomMilestone] = useState<{ type: string; target: number; icon?: string } | null>(null);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(PROFILE_NUDGE_SHOWN_KEY).then(async v => {
      if (!v) {
        const { data: { user } } = await supabase.auth.getUser();
        const accountAgeMs = user?.created_at ? Date.now() - new Date(user.created_at).getTime() : 0;
        if (accountAgeMs > 86400000) {
          AsyncStorage.setItem(PROFILE_NUDGE_SHOWN_KEY, '1');
          return;
        }
        setShowProfileNudge(true);
        AsyncStorage.setItem(PROFILE_NUDGE_SHOWN_KEY, '1');
      }
    });
  }, []));

  useFocusEffect(useCallback(() => {
    Promise.all([
      AsyncStorage.getItem(MOTIVATION_PHOTO_KEY),
      AsyncStorage.getItem(STREAK_SHIELD_KEY),
      AsyncStorage.getItem(SHIELD_UNDO_KEY),
      AsyncStorage.getItem(CUSTOM_MILESTONE_KEY),
    ]).then(([rawPhoto, rawShield, rawUndo, rawMilestone]) => {
      setMotivationPhoto(rawPhoto ? rawPhoto.split('?t=')[0] + '?t=' + Date.now() : null);
      // Streak Shield is premium-only, but the flag is a plain AsyncStorage
      // value with no premium recheck at the point of use — if a subscription
      // lapses, the flag would otherwise keep applying the 24h relapse-undo
      // protection indefinitely. Recheck against live premium status here and
      // clear the stale flag if it no longer applies.
      if (rawShield === 'true' && !isPremium) {
        setShieldEnabled(false);
        AsyncStorage.removeItem(STREAK_SHIELD_KEY);
      } else {
        setShieldEnabled(rawShield === 'true' && isPremium);
      }
      if (rawUndo) {
        try {
          const parsed = JSON.parse(rawUndo);
          if (parsed.expiresAt > Date.now()) setShieldUndo(parsed);
          else { setShieldUndo(null); AsyncStorage.removeItem(SHIELD_UNDO_KEY); }
        } catch { setShieldUndo(null); }
      } else {
        setShieldUndo(null);
      }
      if (rawMilestone) {
        try {
          const parsed = JSON.parse(rawMilestone);
          if (parsed.type && parsed.target > 0) setCustomMilestone(parsed);
          else setCustomMilestone(null);
        } catch {
          const n = Number(rawMilestone);
          setCustomMilestone(!isNaN(n) && n > 0 ? { type: 'days', target: n, icon: '📅' } : null);
        }
      } else {
        setCustomMilestone(null);
      }
    });
  }, [isPremium]));

  const dismissProfileNudge = useCallback(() => {
    setShowProfileNudge(false);
  }, []);

  const [badgeMsgIndex, setBadgeMsgIndex] = useState(0);
  const [editingMood, setEditingMood] = useState(false);
  const [moodNote, setMoodNote] = useState('');
  const [editMoodValue, setEditMoodValue] = useState<number | null>(null);
  const [partnerMsg, setPartnerMsg] = useState<{ id: string; message: string } | null>(null);
  const [showShareCard, setShowShareCard] = useState(false);
  const [capturingShare, setCapturingShare] = useState(false);
  const [shareCardBadge, setShareCardBadge] = useState<{ emoji: string; label: string } | null>(null);
  const [shareTagline, setShareTagline] = useState('');
  const [shareCardHideTime, setShareCardHideTime] = useState(false);
  const [shareCardDetails, setShareCardDetails] = useState<Array<{ label: string; value: string; highlight?: boolean }>>([]);
  const [shareCardLocked, setShareCardLocked] = useState(false);
  const [shareCardProgress, setShareCardProgress] = useState(0);
  const [shareCardMessage, setShareCardMessage] = useState('');
  const [shareCardMilestoneLabel, setShareCardMilestoneLabel] = useState<string | null>(null);
  const [shareCardEarnedOn, setShareCardEarnedOn] = useState<string | null>(null);
  const [shareCardAction, setShareCardAction] = useState<{ label: string; onPress: () => void } | null>(null);
  const [urgePeakHour, setUrgePeakHour] = useState<number | null>(null);
  const [customMilestoneCelebVisible, setCustomMilestoneCelebVisible] = useState(false);
  const [calDayModal, setCalDayModal] = useState<{ iso: string; status: 'clean' | 'relapse' | 'inactive'; mood: number | null } | null>(null);
  const [celebrationBadge, setCelebrationBadge] = useState<{ type?: string; emoji: string; label: string; celebration: { icon: string; text: string }; msg: string; earnedAt?: string } | null>(null);
  const shareCardRef = useRef<View>(null);
  const celebrationCardRef = useRef<View>(null);
  const [celebrationTagline, setCelebrationTagline] = useState(() => SHARE_TAGLINES[0]);

  useEffect(() => {
    if (celebrationBadge) {
      setCelebrationTagline(SHARE_TAGLINES[Math.floor(Math.random() * SHARE_TAGLINES.length)]);
    }
  }, [celebrationBadge]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check custom milestone when data or milestone setting changes
  useEffect(() => {
    if (!data || !customMilestone) return;
    const { type, target } = customMilestone;
    const streakDaysFloat = data.quitDate ? Math.max(0, Date.now() - parseQuitDate(data.quitDate).getTime()) / 86400000 : 0;
    const value =
      type === 'days'     ? streakDaysFloat :
      type === 'savings'  ? data.totalPaid :
      type === 'urges'    ? data.urgesOvercome :
      type === 'payments' ? data.paymentCount : 0;
    if (value >= target) {
      const celebKey = `${type}_${target}`;
      AsyncStorage.getItem(CUSTOM_MILESTONE_CELEBRATED_KEY).then(raw => {
        if (raw !== celebKey) {
          setCustomMilestoneCelebVisible(true);
          AsyncStorage.setItem(CUSTOM_MILESTONE_CELEBRATED_KEY, celebKey);
        }
      });
    }
  }, [data, customMilestone]);

  const randomQuote = useCallback(() => {
    setQuoteIndex(i => {
      let next = i;
      while (next === i) next = Math.floor(Math.random() * QUOTES.length);
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) { pendingFetchRef.current = true; return; }
    fetchingRef.current = true;
    pendingFetchRef.current = false;
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { fetchingRef.current = false; return; }

    const today = todayStr();

    const [profileRes, streakRes, badgesRes, moodRes, weekMoodRes, lossesRes, debtsRes, debtPaymentsRes, urgeRes, urgesOvercomeCountRes, moodCountRes, paymentCountRes, checkinDatesRes, calRelapseRes, lossCountRes, communityPostCountRes] = await Promise.all([
      supabase.from('users').select('display_name, motivation, quit_date, quit_timestamp, weekly_bet, currency, notif_milestone, notif_urge_prediction, is_premium, savings_goal_amount, savings_goal_label, savings_goal_icon, custom_milestone_type, custom_milestone_target, custom_milestone_icon, shield_undo_prev_quit, shield_undo_prev_streak_days, shield_undo_expires_at, shield_undo_relapse_row_id').eq('id', user.id).maybeSingle(),
      supabase.from('streaks').select('longest_streak').eq('user_id', user.id).maybeSingle(),
      supabase.from('badges').select('badge_type, earned_at').eq('user_id', user.id),
      supabase.from('mood_checkins').select('id, mood, note').eq('user_id', user.id).eq('local_date', today).maybeSingle(),
      supabase.from('mood_checkins').select('mood, note, created_at').eq('user_id', user.id).gte('created_at', (() => { const t = new Date(); t.setDate(t.getDate() - 6); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).toISOString(); })()).order('created_at', { ascending: true }),
      supabase.from('losses').select('type, amount').eq('user_id', user.id).eq('type', 'saving'),
      supabase.from('debts').select('id, name, total_amount').eq('user_id', user.id),
      supabase.from('debt_payments').select('debt_id, amount').eq('user_id', user.id),
      supabase.from('urge_journal').select('created_at', { count: 'exact' }).eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('urge_journal').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('outcome', 'overcame'),
      supabase.from('mood_checkins').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('debt_payments').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('mood_checkins').select('mood, created_at').eq('user_id', user.id).gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString()).order('created_at', { ascending: false }),
      supabase.from('losses').select('created_at').eq('user_id', user.id).eq('type', 'streak_reset').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      supabase.from('losses').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('type', 'session'),
      supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    if (!isMountedRef.current) return;
    if (profileRes.error) throw profileRes.error;
    if (streakRes.error) console.warn('[home] streakRes error:', streakRes.error.message);
    if (badgesRes.error) console.warn('[home] badgesRes error:', badgesRes.error.message);
    if (moodRes.error) console.warn('[home] moodRes error:', moodRes.error.message);

    const profile = profileRes.data;
    const badgeRows = badgesRes.data ?? [];
    const earnedBadges = badgeRows.map(b => b.badge_type);
    const badgeTimestamps: Record<string, string> = {};
    badgeRows.forEach(b => { if (b.earned_at) badgeTimestamps[b.badge_type] = b.earned_at; });

    let pendingCelebration: { type?: string; emoji: string; label: string; celebration: { icon: string; text: string }; msg: string; earnedAt?: string } | null = null;
    // Each badge category below only fired the *first* one to newly-earn a
    // celebration and silently dropped the rest — badges from a later
    // category were still written to the DB (so they're not lost from
    // "earned" state), but their popup was permanently skipped even after
    // the first one was dismissed. celebrationQueue exists precisely for
    // this ("next" is shifted off it when a celebration is closed, further
    // down) but nothing was ever pushed into it. Route every newly-earned
    // celebration through here instead of dropping it.
    celebrationQueue.current = [];
    const addCelebration = (payload: NonNullable<typeof pendingCelebration>) => {
      if (!pendingCelebration) pendingCelebration = payload;
      else celebrationQueue.current.push(payload);
    };

    // Auto-award badges
    const quitStr = profile?.quit_timestamp ?? profile?.quit_date;
    const streakDaysFloat = quitStr
      ? Math.max(0, Date.now() - parseQuitDate(quitStr).getTime()) / 86400000
      : 0;

    const dedupeGuard = new Set([...earnedBadges]);
    const quitTs = quitStr ? parseQuitDate(quitStr).getTime() : Date.now();

    const toAward = BADGE_DEFS.filter(b => streakDaysFloat >= b.days && !dedupeGuard.has(b.type));
    if (toAward.length > 0) {
      // Insert individually — null error = newly inserted, code 23505 = already exists.
      // This is reliable even when the SELECT above returns stale/empty data due to RLS.
      const newlyAwarded: typeof toAward = [];
      for (const b of toAward) {
        // A relapse mid-loop resets quit_timestamp and deletes all badges — stop
        // awarding against this now-stale streak snapshot instead of racing it.
        if (relapseInProgressRef.current) break;
        // Use the actual moment the milestone was reached, not now
        const earnedAt = new Date(quitTs + b.days * 86400000).toISOString();
        const { error } = await supabase.from('badges').insert({ user_id: user.id, badge_type: b.type, earned_at: earnedAt });
        if (!error) {
          newlyAwarded.push(b);
        } else if (error.code !== '23505') {
          console.warn('[badges] insert error:', error.code, error.message);
        }
      }

      // Only log and notify for badges actually inserted this run
      const toLog = newlyAwarded.filter(b => b.days > 0);
      if (toLog.length > 0) {
        const { error: journalErr } = await supabase.from('losses').insert(toLog.map(b => ({
          user_id: user.id, type: 'milestone_earned', amount: Math.floor(b.days),
          category: 'Milestone', note: `${b.emoji} ${b.label}`,
          created_at: new Date(quitTs + b.days * 86400000).toISOString(),
        })));
        if (journalErr) console.warn('Milestone journal insert failed:', journalErr.message);


      }

      newlyAwarded.forEach(b => earnedBadges.push(b.type));
      if (newlyAwarded.length > 0) {
        // Only celebrate the highest milestone reached — avoids flooding the user
        // with sequential popups when they reopen the app after time away.
        const highest = newlyAwarded[newlyAwarded.length - 1];
        addCelebration({
          type: highest.type,
          emoji: highest.emoji,
          label: highest.label,
          celebration: BADGE_CELEBRATIONS[Math.floor(Math.random() * BADGE_CELEBRATIONS.length)],
          msg: BADGE_EARNED_MSGS[Math.floor(Math.random() * BADGE_EARNED_MSGS.length)],
          earnedAt: new Date(quitTs + highest.days * 86400000).toISOString(),
        });
      }

      // Notify supporter for the highest milestone earned this run (last = most significant)
      const notifyBadge = toLog[toLog.length - 1];
      if (notifyBadge) notifySupporter('milestone', notifyBadge.label).catch(e => console.warn('[milestone] notifySupporter error:', e));

      // Prompt for a store review at meaningful milestones
      if (newlyAwarded.some(b => b.type === '1_week'))  maybeRequestReview('7_day').catch(() => {});
      if (newlyAwarded.some(b => b.type === '1_month')) maybeRequestReview('1_month').catch(() => {});
    }

    // Update longest streak
    const streak = Math.floor(streakDaysFloat);
    const longest = streakRes.data?.longest_streak ?? 0;
    if (streak > longest) {
      await supabase.from('streaks').upsert({ user_id: user.id, longest_streak: streak }, { onConflict: 'user_id' });
    }

    const lossRows = lossesRes.data ?? [];
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
      const newlyPaidDebt = debtItems.filter(d => d.earned && !dedupeGuard.has(`debt_${d.id}`)).pop();
      if (newlyPaidDebt) {
        addCelebration({
          emoji: '🏦', label: `${newlyPaidDebt.name} paid off`,
          celebration: BADGE_CELEBRATIONS[Math.floor(Math.random() * BADGE_CELEBRATIONS.length)],
          msg: BADGE_EARNED_MSGS[Math.floor(Math.random() * BADGE_EARNED_MSGS.length)],
        });
      }
    }

    // Activity badges
    const moodCount = moodCountRes.count ?? 0;
    const urgeList = urgeRes.data ?? [];
    const urgesOvercome = urgesOvercomeCountRes.count ?? 0;
    const paymentCount = paymentCountRes.count ?? 0;
    const lossCount = lossCountRes.count ?? 0;
    const communityPostCount = communityPostCountRes.count ?? 0;
    const activityConditions: Record<string, boolean> = {
      first_checkin:         moodCount >= 1,
      checkins_7:            moodCount >= 7,
      checkins_14:           moodCount >= 14,
      checkins_30:           moodCount >= 30,
      checkins_50:           moodCount >= 50,
      checkins_75:           moodCount >= 75,
      checkins_100:          moodCount >= 100,
      checkins_200:          moodCount >= 200,
      checkins_365:          moodCount >= 365,
      first_journal:         (urgeRes.count ?? urgeList.length) >= 1,
      urge_overcame_1:       urgesOvercome >= 1,
      urge_overcame_5:       urgesOvercome >= 5,
      urge_overcame_10:      urgesOvercome >= 10,
      urge_overcame_25:      urgesOvercome >= 25,
      urge_overcame_50:      urgesOvercome >= 50,
      urge_overcame_75:      urgesOvercome >= 75,
      urge_overcame_100:     urgesOvercome >= 100,
      loss_first_log:       lossCount >= 1 || debtRows.length >= 1,
      first_payment:        paymentCount >= 1,
      payments_5:           paymentCount >= 5,
      payments_10:          paymentCount >= 10,
      payments_25:          paymentCount >= 25,
      payments_50:          paymentCount >= 50,
      payments_100:         paymentCount >= 100,
      community_first_post: communityPostCount >= 1,
    };
    const newActivityBadges = ACTIVITY_BADGE_DEFS
      .filter(b => activityConditions[b.type] && !dedupeGuard.has(b.type))
      .map(b => ({ user_id: user.id, badge_type: b.type }));
    if (newActivityBadges.length > 0) {
      await supabase.from('badges').upsert(newActivityBadges, { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
      newActivityBadges.forEach(b => earnedBadges.push(b.badge_type));
      const celebBadge = ACTIVITY_BADGE_DEFS.find(b => b.type === newActivityBadges[newActivityBadges.length - 1].badge_type);
      if (celebBadge) {
        addCelebration({
          type: celebBadge.type,
          emoji: celebBadge.emoji,
          label: celebBadge.label,
          celebration: BADGE_CELEBRATIONS[Math.floor(Math.random() * BADGE_CELEBRATIONS.length)],
          msg: BADGE_EARNED_MSGS[Math.floor(Math.random() * BADGE_EARNED_MSGS.length)],
        });
      }
    }

    // Savings goal badges
    const [savingsGoalRaw, savingsGoalForFallback, savingsGoalIconFallback, checklistRaw] = await Promise.all([
      AsyncStorage.getItem(SAVINGS_GOAL_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
      AsyncStorage.getItem(CHECKLIST_KEY),
    ]);
    // Savings goal: Supabase is authoritative, AsyncStorage is fallback for legacy data
    const _sbGoal = profile?.savings_goal_amount != null ? Number(profile.savings_goal_amount) : null;
    const _rawGoal = savingsGoalRaw ? Number(savingsGoalRaw) : null;
    const savingsGoalAmount = _sbGoal ?? (_rawGoal !== null && !isNaN(_rawGoal) ? _rawGoal : null);
    const savingsGoalForRaw = profile?.savings_goal_label ?? savingsGoalForFallback;
    const savingsGoalIconRaw = profile?.savings_goal_icon ?? savingsGoalIconFallback;
    const totalManualSavings = lossRows.reduce((s, r) => s + Number(r.amount), 0);

    if (savingsGoalAmount && !earnedBadges.includes('goal_set')) {
      await supabase.from('badges').upsert([{ user_id: user.id, badge_type: 'goal_set' }], { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
      await supabase.from('losses').insert({ user_id: user.id, type: 'milestone_earned', amount: 0, category: 'Milestone', note: '📍 Goal Setter badge earned' });
      earnedBadges.push('goal_set');
      addCelebration({
        emoji: '📍', label: 'Goal Setter',
        celebration: BADGE_CELEBRATIONS[Math.floor(Math.random() * BADGE_CELEBRATIONS.length)],
        msg: BADGE_EARNED_MSGS[Math.floor(Math.random() * BADGE_EARNED_MSGS.length)],
      });
    }
    if (savingsGoalAmount && savingsGoalAmount > 0 && totalManualSavings >= savingsGoalAmount && !earnedBadges.includes('goal_reached')) {
      await supabase.from('badges').upsert([{ user_id: user.id, badge_type: 'goal_reached' }], { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
      await supabase.from('losses').insert({ user_id: user.id, type: 'milestone_earned', amount: savingsGoalAmount, category: 'Milestone', note: '🎊 Savings goal reached' });
      earnedBadges.push('goal_reached');
      maybeRequestReview('savings_goal');
      addCelebration({
        emoji: '🎊', label: 'Goal Met',
        celebration: BADGE_CELEBRATIONS[Math.floor(Math.random() * BADGE_CELEBRATIONS.length)],
        msg: BADGE_EARNED_MSGS[Math.floor(Math.random() * BADGE_EARNED_MSGS.length)],
      });
    }

    // Prevention checklist badge — guard via DB earnedBadges (source of truth)
    let checklistData: Record<string, boolean> = {};
    try { checklistData = checklistRaw ? JSON.parse(checklistRaw) : {}; } catch { /* corrupted, treat as empty */ }
    const checklistChecked = Object.values(checklistData).filter(Boolean).length;
    const checklistCompleted = checklistChecked >= CHECKLIST_TOTAL;
    if (checklistCompleted && !earnedBadges.includes('checklist_complete')) {
      await supabase.from('badges').upsert([{ user_id: user.id, badge_type: 'checklist_complete' }], { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
      earnedBadges.push('checklist_complete');
      await supabase.from('losses').insert({
        user_id: user.id, type: 'milestone_earned', amount: 0,
        category: 'Milestone', note: '🛡️ Safe Zone — prevention checklist completed',
      });
      addCelebration({
        emoji: '🛡️', label: 'Safe Zone',
        celebration: BADGE_CELEBRATIONS[Math.floor(Math.random() * BADGE_CELEBRATIONS.length)],
        msg: BADGE_EARNED_MSGS[Math.floor(Math.random() * BADGE_EARNED_MSGS.length)],
      });
    }

    // Custom milestone: restore from Supabase if AsyncStorage was wiped
    const validMilestoneTypes = ['days', 'savings', 'urges', 'payments'] as const;
    if (profile?.custom_milestone_type && validMilestoneTypes.includes(profile.custom_milestone_type as any) && Number(profile.custom_milestone_target) > 0) {
      const m = { type: profile.custom_milestone_type as 'days' | 'savings' | 'urges' | 'payments', target: Number(profile.custom_milestone_target), icon: profile.custom_milestone_icon ?? '📅' };
      setCustomMilestone(prev => prev ?? m);
    }
    // Shield undo: restore from Supabase if AsyncStorage was wiped
    const sbUndoExpires = Number(profile?.shield_undo_expires_at ?? 0);
    if (profile?.shield_undo_prev_quit && sbUndoExpires > Date.now()) {
      const undoData = { prevQuit: profile.shield_undo_prev_quit, prevStreakDays: Number(profile.shield_undo_prev_streak_days ?? 0), expiresAt: sbUndoExpires, relapseRowId: profile.shield_undo_relapse_row_id ?? null };
      setShieldUndo(prev => prev ?? undoData);
    } else if (sbUndoExpires > 0 && sbUndoExpires <= Date.now()) {
      // Expired entry still on server — clean it up
      supabase.from('users').update({ shield_undo_prev_quit: null, shield_undo_prev_streak_days: null, shield_undo_expires_at: null, shield_undo_relapse_row_id: null }).eq('id', user.id).then(() => {}, () => {});
    }

    const notifPrefs = {
      ...DEFAULT_NOTIF_PREFS,
      notif_milestone: profile?.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
      notif_urge_prediction: profile?.notif_urge_prediction ?? false,
    };
    const { status: notifStatus } = await Notifications.getPermissionsAsync();
    if (notifStatus === 'granted') {
      await scheduleUrgePredictionNotification(
        urgeRes.data ?? [],
        notifPrefs,
        profile?.is_premium ?? false,
      );
    }

    if (!isMountedRef.current) return;
    if (pendingCelebration) setCelebrationBadge(pendingCelebration);

    // Compute peak urge hour for home screen card
    const urgeEntries = urgeRes.data ?? [];
    if (profile?.is_premium && urgeEntries.length >= 3) {
      const hourCounts: Record<number, number> = {};
      for (const e of urgeEntries) {
        const h = new Date(e.created_at).getHours();
        hourCounts[h] = (hourCounts[h] ?? 0) + 1;
      }
      const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
      const peak = sorted.length > 0 ? parseInt(sorted[0][0], 10) : NaN;
      setUrgePeakHour(!isNaN(peak) ? peak : null);
    } else {
      setUrgePeakHour(null);
    }

    setData({
      displayName: profile?.display_name || user.email?.split('@')?.[0] || null,
      motivation: profile?.motivation ?? null,
      quitDate: profile?.quit_timestamp ?? profile?.quit_date ?? null,
      weeklyBet: profile?.weekly_bet ?? null,
      currency: profile?.currency ?? 'USD',
      longestStreak: Math.max(longest, streak),
      earnedBadges,
      badgeTimestamps,
      totalPaid,
      debtItems,
      checklistCompleted,
      checklistProgress: CHECKLIST_TOTAL > 0 ? Math.min(1, checklistChecked / CHECKLIST_TOTAL) : 0,
      savingsGoal: savingsGoalAmount,
      savingsGoalFor: savingsGoalForRaw ?? '',
      savingsGoalIcon: savingsGoalIconRaw ?? '🎯',
      moodCount,
      urgesOvercome,
      paymentCount,
      checkinStreak: computeCheckinStreak(checkinDatesRes.data ?? []),
      calendarDays: (() => {
        const relapseSet = new Set((calRelapseRes.data ?? []).map((r: { created_at: string }) => new Date(r.created_at).toLocaleDateString('en-CA')));
        const moodMap: Record<string, number> = {};
        (checkinDatesRes.data ?? []).forEach((r: { created_at: string; mood: number }) => { moodMap[new Date(r.created_at).toLocaleDateString('en-CA')] = r.mood; });
        const rawQ = profile?.quit_timestamp ?? profile?.quit_date ?? null;
        let qLocal: Date | null = null;
        if (rawQ) { const ms = Date.parse(rawQ.includes('T') ? rawQ : rawQ + 'T00:00:00'); if (!isNaN(ms)) { const qd = new Date(ms); qLocal = new Date(qd.getFullYear(), qd.getMonth(), qd.getDate()); } }
        const nd = new Date();
        return Array.from({ length: 30 }, (_, i) => {
          const d = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate() - (29 - i));
          const iso = d.toLocaleDateString('en-CA');
          return { iso, status: (!qLocal || d < qLocal) ? 'inactive' as const : relapseSet.has(iso) ? 'relapse' as const : 'clean' as const, mood: moodMap[iso] ?? null };
        });
      })(),
      todayMood: moodRes.data?.mood ?? null,
      todayMoodNote: moodRes.data?.note ?? null,
      todayMoodId: moodRes.data?.id ?? null,
      weekMoods: (() => {
        const isoDay = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const rows = weekMoodRes.data ?? [];
        const byDate: Record<string, { mood: number; note: string | null }> = {};
        rows.forEach(r => {
          const rd = new Date(r.created_at);
          byDate[isoDay(rd)] = { mood: r.mood, note: r.note ?? null };
        });
        const today = new Date();
        return Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today);
          d.setDate(today.getDate() - (6 - i));
          const key = isoDay(d);
          return { date: key, mood: byDate[key]?.mood ?? null, note: byDate[key]?.note ?? null };
        });
      })(),
    });
    } catch {
      setLoadError(true);
    } finally {
      fetchingRef.current = false;
      if (pendingFetchRef.current && isMountedRef.current) {
        pendingFetchRef.current = false;
        fetchData();
      }
    }
  }, []);

  // Auto-refresh when a milestone is crossed so the badge is awarded and the display
  // updates. Placed after fetchData's own declaration (rather than up with the other
  // effects) since it calls fetchData directly.
  useEffect(() => {
    if (!data?.quitDate) return;
    const quitDate = parseQuitDate(data.quitDate);
    if (isNaN(quitDate.getTime())) return;
    const ms = Math.max(0, Date.now() - quitDate.getTime());
    const { next } = getMilestone(ms);
    if (prevNextMilestone.current !== null && prevNextMilestone.current !== next) {
      if (!fetchingRef.current) {
        fetchData().then(() => { prevNextMilestone.current = next; });
      }
    } else {
      prevNextMilestone.current = next;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, fetchData]);

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  useEffect(() => {
    registerHomeRefresh(fetchData);
    return () => unregisterHomeRefresh(fetchData);
  }, [fetchData]);

  useEffect(() => {
    fetchData().finally(() => {
      setLoading(false);
    });
  }, [fetchData]);

  const fetchPartnerMsg = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMountedRef.current) return;
      const { data: link } = await supabase
        .from('partner_links')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!link || !isMountedRef.current) return;
      const { data: msg } = await supabase
        .from('partner_messages')
        .select('id, message')
        .eq('link_id', link.id)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isMountedRef.current) setPartnerMsg(msg ?? null);
    } catch (e) {
      console.warn('[fetchPartnerMsg]', e);
    }
  }, []);

  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => {
    if (authFlags.postResetInProgress) {
      authFlags.postResetInProgress = false;
      setLoading(true);
      fetchData().finally(() => setLoading(false));
    } else {
      fetchData();
    }
    fetchPartnerMsg();
    setFocusTick(t => t + 1);
  }, [fetchData, fetchPartnerMsg]));

  useEffect(() => {
    fetchPartnerMsg();
  }, [fetchPartnerMsg]);

  useFocusEffect(useCallback(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => {
      clearInterval(id);
      if (moodScrollTimerRef.current) clearTimeout(moodScrollTimerRef.current);
    };
  }, []));

  useEffect(() => {
    if (!data) return;
    const currentCount = data.earnedBadges.length;
    if (currentCount === lastScrolledBadgeCountRef.current) return;
    lastScrolledBadgeCountRef.current = currentCount;
    const unearnedStart = BADGE_DEFS.findIndex(b => b.days > 0 && !data.earnedBadges.includes(b.type));
    const visibleBadges = BADGE_DEFS.filter((b, i) => {
      const earned = b.days === 0 || data.earnedBadges.includes(b.type);
      return earned || (unearnedStart >= 0 && i >= unearnedStart && i < unearnedStart + 6);
    });
    const lastEarnedIdx = visibleBadges.reduce((acc, b, i) =>
      data.earnedBadges.includes(b.type) ? i : acc, -1);
    const targetIdx = lastEarnedIdx >= 0 ? lastEarnedIdx : 0;
    const ITEM_WIDTH = 57 + 18; // badgeItem width + gap
    const screenWidth = Dimensions.get('window').width;
    const cardPadding = 48; // card horizontal padding both sides
    const offset = targetIdx * ITEM_WIDTH - (screenWidth - cardPadding - 57) / 2;
    const timer = setTimeout(() => {
      badgeScrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: false });
    }, 120);
    return () => clearTimeout(timer);
  }, [data?.earnedBadges.length, focusTick]);

  // Must be before any early returns to follow Rules of Hooks — and before the
  // useEffect below that depends on streakMs to avoid temporal dead zone issues.
  const nowMs = useMemo(() => Date.now(), [tick]);
  const streakInfo = useMemo(() => calcStreakInfo(data?.quitDate ?? null), [data?.quitDate, tick]);
  const { value: streakValue, unit: streakUnit, days: streakDays, ms: streakMs } = streakInfo;

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
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchData, randomQuote]);

  const pickMotivationPhoto = async () => {
    setImagePickerActive(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access in your device settings to add a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        exif: false,
      });
      if (result.canceled) return;
      try {
        const src = result.assets[0].uri;
        const resized = await ImageManipulator.manipulateAsync(
          src,
          [{ resize: { width: 1080, height: 1080 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        const destFile = new File(Paths.document, 'motivation_photo.jpg');
        if (destFile.exists) destFile.delete();
        await new File(resized.uri).copy(destFile);
        const photoUri = destFile.uri + '?t=' + Date.now();
        await AsyncStorage.setItem(MOTIVATION_PHOTO_KEY, photoUri);
        setMotivationPhoto(photoUri);
      } catch (err) {
        console.error('[MotivationPhoto] save error:', err);
        Alert.alert('Could not save photo', 'Please try again.');
      }
    } finally {
      setTimeout(() => setImagePickerActive(false), 500);
    }
  };

  const openShareCard = (
    badge: { emoji: string; label: string } | null,
    hideTime = false,
    details: Array<{ label: string; value: string; highlight?: boolean }> = [],
    locked = false,
    progress = 0,
    message = '',
    milestoneLabel: string | null = null,
    earnedOn: string | null = null,
    action: { label: string; onPress: () => void } | null = null,
  ) => {
    setShareCardBadge(badge);
    setShareCardHideTime(hideTime);
    setShareCardDetails(details);
    setShareCardLocked(locked);
    setShareCardProgress(progress);
    setShareCardMessage(message);
    setShareCardMilestoneLabel(milestoneLabel);
    setShareCardEarnedOn(earnedOn);
    setShareCardAction(action);
    if (!locked) setShareTagline(SHARE_TAGLINES[Math.floor(Math.random() * SHARE_TAGLINES.length)]);
    setShowShareCard(true);
  };

  const STREAK_CARD_EMOJIS = ['✨', '🌟', '💫', '⚡', '🦋', '🌊', '🎯', '💪', '🌈', '🔑', '🕊️', '🌸', '🦅', '👑', '🔥', '💎', '🏆', '🌱'];
  const shareStreak = () => {
    if (!data) return;
    const decorEmoji = STREAK_CARD_EMOJIS[Math.floor(Math.random() * STREAK_CARD_EMOJIS.length)];
    const details: Array<{ label: string; value: string; highlight?: boolean }> = [];
    if (data.quitDate) {
      details.push({ label: 'Started', value: new Date(parseQuitDate(data.quitDate)).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) });
    }
    openShareCard({ emoji: decorEmoji, label: '' }, false, details);
  };

  const shareMilestone = () => {
    if (!selectedBadge) return;
    openShareCard(
      { emoji: selectedBadge.emoji, label: selectedBadge.label },
      selectedBadge.days === 0,
      [],
      false,
      0,
      '',
      selectedBadge.days > 0 ? selectedBadge.label : null,
      selectedBadge.days > 0 ? (data?.badgeTimestamps?.[selectedBadge.type] ?? null) : null,
    );
  };

  const captureAndShare = async () => {
    if (!shareCardRef.current || capturingShare) return;
    setCapturingShare(true);
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your streak' });
    } catch {
      await Share.share({ message: `${formatStreakFull(streakMs)} free from gambling! 💪\n\nThe day you turn it around starts today. #CornerDay` });
    } finally {
      setCapturingShare(false);
    }
  };

  const handleCelebrationShare = async () => {
    if (!celebrationCardRef.current) return;
    try {
      const uri = await captureRef(celebrationCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your milestone' });
    } catch {
      const label = celebrationBadge?.label ?? 'Milestone';
      await Share.share({ message: `${label} reached! 🎉\n\nThe day you turn it around starts today. #CornerDay` });
    }
  };

  const postToCommunity = () => {
    if (!selectedBadge) return;
    const content = `Just hit my ${selectedBadge.label} milestone! ${selectedBadge.emoji} ${formatStreakFull(streakMs)} free from gambling and counting. 💪`;
    setSelectedBadge(null);
    router.push({ pathname: '/(tabs)/community/new-post', params: { initialContent: content, initialTag: '#Milestone' } } as any);
  };

  const handleMood = async (mood: number, note?: string) => {
    if (!data || moodSubmitting) return;
    setMoodSubmitting(true);
    const isNewInsert = !data.todayMoodId;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const noteVal = note?.trim() || null;
        if (data.todayMoodId) {
          const { error: updateErr } = await supabase.from('mood_checkins').update({ mood, note: noteVal }).eq('id', data.todayMoodId).eq('user_id', user.id);
          if (updateErr) { Alert.alert('Could not save mood', updateErr.message); setEditingMood(false); setMoodNote(''); setEditMoodValue(null); return; }
        } else {
          const localDate = todayStr();
          const { data: inserted, error: insertErr } = await supabase.from('mood_checkins').insert({ user_id: user.id, mood, note: noteVal, local_date: localDate }).select('id').maybeSingle();
          if (insertErr) {
            if (insertErr.code === '23505') {
              // The DB constraint is keyed on (user_id, local_date), so a
              // conflict means a row already exists for this exact local
              // date — e.g. logged from another device, or this client's
              // local todayMoodId was stale — find it by the same key.
              const { data: existing } = await supabase.from('mood_checkins').select('id').eq('user_id', user.id).eq('local_date', localDate).maybeSingle();
              if (existing?.id) {
                const { error: updateErr } = await supabase.from('mood_checkins').update({ mood, note: noteVal }).eq('id', existing.id).eq('user_id', user.id);
                if (updateErr) { Alert.alert('Could not save mood', updateErr.message); return; }
                if (!isMountedRef.current) return;
                setData(prev => prev ? { ...prev, todayMoodId: existing.id } : prev);
              } else {
                Alert.alert('Could not save mood', insertErr.message);
                return;
              }
            } else {
              Alert.alert('Could not save mood', insertErr.message);
              return;
            }
          } else if (!inserted?.id) { Alert.alert('Could not save mood', 'No row ID returned. Please try again.'); return; }
          if (!isMountedRef.current) return;
          if (inserted?.id) {
            setData(prev => prev ? { ...prev, todayMoodId: inserted.id } : prev);
          }
          showInterstitialIfReady(isPremium);
        }
        if (!isMountedRef.current) return;
        const todayKey = todayStr();
        setData(prev => {
          if (!prev) return prev;
          const weekMoods = prev.weekMoods.map(d => d.date === todayKey ? { ...d, mood, note: noteVal } : d);
          const calendarDays = prev.calendarDays.map(d => d.iso === todayKey ? { ...d, mood } : d);
          if (isNewInsert) {
            return { ...prev, todayMood: mood, todayMoodNote: noteVal, weekMoods, calendarDays, moodCount: prev.moodCount + 1 };
          }
          return { ...prev, todayMood: mood, todayMoodNote: noteVal, weekMoods, calendarDays };
        });
        hapticMedium();
        setEditingMood(false);
        setMoodNote('');
        setEditMoodValue(null);
        if (isNewInsert) fetchData();
      }
    } finally {
      if (isMountedRef.current) setMoodSubmitting(false);
    }
  };

  const handleClearMood = async () => {
    if (!data?.todayMoodId) return;
    setMoodSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('mood_checkins').delete().eq('id', data.todayMoodId).eq('user_id', user.id);
      if (error) {
        Alert.alert('Could not clear mood', error.message);
        return;
      }
      const todayKey = todayStr();
      setData(prev => {
        if (!prev) return prev;
        const weekMoods = prev.weekMoods.map(d => d.date === todayKey ? { ...d, mood: null, note: null } : d);
        const calendarDays = prev.calendarDays.map(d => d.iso === todayKey ? { ...d, mood: null } : d);
        const newCurrent = Math.max(0, prev.checkinStreak.current - 1);
        return { ...prev, todayMood: null, todayMoodNote: null, todayMoodId: null, weekMoods, calendarDays, moodCount: Math.max(0, prev.moodCount - 1), checkinStreak: { current: newCurrent, best: prev.checkinStreak.best } };
      });
      setEditingMood(false);
      setMoodNote('');
      setEditMoodValue(null);
    } finally {
      setMoodSubmitting(false);
    }
  };

  const handleRelapse = () => { haptic(); setRelapseConfirmVisible(true); };

  const doRelapse = async () => {
    // Ref check (not just the relapseLoading state disabling the button) —
    // state updates are async, so a fast double-tap can fire this twice
    // before the button re-renders as disabled, which would double-insert
    // the streak_reset journal row and race the RPC.
    if (relapseInProgressRef.current) return;
    relapseInProgressRef.current = true;
    setRelapseLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const today = todayStr();
        const newQuitTimestamp = new Date().toISOString();
        const days = streakDays;
        const { error: rpcError } = await supabase.rpc('reset_streak', {
          p_user_id: user.id,
          p_quit_date: today,
          p_quit_timestamp: newQuitTimestamp,
        });
        if (rpcError) {
          Alert.alert('Could not reset streak', rpcError.message);
          return;
        }
        let relapseRowId: string | null = null;
        const insertJournalRow = () => supabase.from('losses').insert({
          user_id: user.id, type: 'streak_reset', amount: 0,
          category: 'Streak Reset',
          note: days > 0 ? `After ${days} day${days !== 1 ? 's' : ''}` : null,
        }).select('id').maybeSingle();
        let { data: journalRow, error: journalErr } = await insertJournalRow();
        if (journalErr) {
          // The reset_streak RPC above already committed — the streak itself
          // is reset regardless of what happens here, so there's no clean
          // "abort" path left. Retry once, since this row is what the
          // Recovery Calendar reads to know a day was a slip; if it never
          // saves, that day would silently render as clean instead.
          console.warn('[doRelapse] journal insert failed, retrying once:', journalErr.message);
          ({ data: journalRow, error: journalErr } = await insertJournalRow());
        }
        if (journalErr) {
          console.warn('[doRelapse] journal insert failed after retry:', journalErr.message);
        } else if (journalRow?.id) {
          relapseRowId = journalRow.id;
        }
        // Save shield undo state if shield is enabled
        if (shieldEnabled && data?.quitDate) {
          const undoExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
          const undoData = { prevQuit: data.quitDate, prevStreakDays: days, expiresAt: undoExpiresAt, relapseRowId };
          await Promise.all([
            AsyncStorage.setItem(SHIELD_UNDO_KEY, JSON.stringify(undoData)),
            supabase.from('users').update({ shield_undo_prev_quit: data.quitDate, shield_undo_prev_streak_days: days, shield_undo_expires_at: undoExpiresAt, shield_undo_relapse_row_id: relapseRowId }).eq('id', user.id),
          ]);
          setShieldUndo({ prevQuit: undoData.prevQuit, prevStreakDays: undoData.prevStreakDays, expiresAt: undoData.expiresAt });
        }
        // Delete day-based streak badges so they re-award on the new streak — but
        // NOT activity/achievement badges (payments, check-ins, urges overcome,
        // debt paid off, etc.), which stay true regardless of the current streak
        // length. Deleting everything meant a relapsing user immediately got a
        // fresh "🏅 Achievement earned!" celebration popup for something they'd
        // unlocked long ago, the moment they opened Home after a relapse.
        // Skip deletion when shield is on — doUndoRelapse restores the old quit date,
        // and 23505 upsert guards prevent duplicate badges from re-awarding cleanly.
        if (!shieldEnabled) {
          const streakBadgeTypes = BADGE_DEFS.map(b => b.type);
          await supabase.from('badges').delete().eq('user_id', user.id).in('badge_type', streakBadgeTypes);
        }
        // When shield is on, badges survive — keep MILESTONE_NOTIFS_KEY so the scheduler
        // doesn't re-fire notifications for milestones the user still owns.
        const relapseKeysToRemove = [CUSTOM_MILESTONE_CELEBRATED_KEY, URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY];
        if (!shieldEnabled) relapseKeysToRemove.unshift(MILESTONE_NOTIFS_KEY);
        await AsyncStorage.multiRemove(relapseKeysToRemove);
        // Reschedule notifications against the new quit timestamp, passing surviving badges
        // so already-earned milestones are excluded from the new notification schedule.
        const badgeTypesForNotif = shieldEnabled ? (data?.earnedBadges ?? []) : [];
        const { data: prefsRow } = await supabase
          .from('users')
          .select('notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching, notif_urge_prediction, notif_community')
          .eq('id', user.id)
          .maybeSingle();
        const prefs = {
          notif_milestone: prefsRow?.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
          notif_daily_streak: prefsRow?.notif_daily_streak ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
          notif_daily_checkin: prefsRow?.notif_daily_checkin ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
          notif_weekly_summary: prefsRow?.notif_weekly_summary ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
          notif_milestone_approaching: prefsRow?.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
          notif_urge_prediction: prefsRow?.notif_urge_prediction ?? DEFAULT_NOTIF_PREFS.notif_urge_prediction,
          notif_community: prefsRow?.notif_community ?? DEFAULT_NOTIF_PREFS.notif_community,
        };
        await scheduleAllNotifications(prefs, newQuitTimestamp, badgeTypesForNotif);
        await scheduleOnboardingCheckin();
        notifySupporter('relapse').catch(e => console.warn('[relapse] notifySupporter error:', e));
        if (!isMountedRef.current) return;
        setData(prev => {
          if (!prev) return prev;
          if (shieldEnabled) return { ...prev, quitDate: newQuitTimestamp };
          // Only the deleted streak badges drop out of local state — achievement
          // badges (payments, check-ins, etc.) were never deleted, so keep them.
          const streakBadgeTypeSet = new Set(BADGE_DEFS.map(b => b.type));
          const earnedBadges = prev.earnedBadges.filter(t => !streakBadgeTypeSet.has(t));
          const badgeTimestamps = Object.fromEntries(
            Object.entries(prev.badgeTimestamps).filter(([t]) => !streakBadgeTypeSet.has(t))
          );
          return { ...prev, quitDate: newQuitTimestamp, earnedBadges, badgeTimestamps };
        });
        // Let the reset itself finish and the UI update first — this is a
        // secondary, non-blocking heads-up, not an error that stops the flow.
        if (journalErr) {
          Alert.alert(
            'Streak reset',
            "Your streak was reset, but we couldn't save today's note — your Recovery Calendar may not show it. That's okay, your reset streak is what matters."
          );
        }
      }
    } finally {
      relapseInProgressRef.current = false;
      setRelapseLoading(false);
    }
  };


  const doUndoRelapse = async () => {
    if (!shieldUndo) return;
    setRelapseLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { prevQuit, prevStreakDays } = shieldUndo;
      const prevDate = prevQuit.split('T')[0];
      const [undoUserRes, undoStreakRes] = await Promise.all([
        supabase.from('users').update({ quit_timestamp: prevQuit, quit_date: prevDate }).eq('id', user.id),
        supabase.from('streaks').update({ current_streak: prevStreakDays, streak_start_date: prevDate }).eq('user_id', user.id),
      ]);
      if (undoUserRes.error || undoStreakRes.error) {
        Alert.alert('Could not undo reset', 'Please try again.');
        return;
      }
      // Remove the specific streak_reset loss row that was created by doRelapse
      // Use the stored row ID to avoid deleting the wrong row if the user relapses twice
      const rawUndo = await AsyncStorage.getItem(SHIELD_UNDO_KEY);
      let storedRelapseRowId: string | null = null;
      if (rawUndo) {
        try { storedRelapseRowId = JSON.parse(rawUndo)?.relapseRowId ?? null; } catch { /* ignore */ }
      }
      if (storedRelapseRowId) {
        await supabase.from('losses').delete().eq('id', storedRelapseRowId).eq('user_id', user.id);
      }
      await Promise.all([
        AsyncStorage.removeItem(SHIELD_UNDO_KEY),
        supabase.from('users').update({ shield_undo_prev_quit: null, shield_undo_prev_streak_days: null, shield_undo_expires_at: null, shield_undo_relapse_row_id: null }).eq('id', user.id),
      ]);
      setShieldUndo(null);
      // Restore badge/notification flags so milestones can re-fire
      await AsyncStorage.removeItem(MILESTONE_NOTIFS_KEY);
      // Reschedule notifications against the restored quit timestamp
      const { data: prefsRow } = await supabase.from('users').select('notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching, notif_urge_prediction, notif_community').eq('id', user.id).maybeSingle();
      const prefs = {
        notif_milestone: prefsRow?.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
        notif_daily_streak: prefsRow?.notif_daily_streak ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
        notif_daily_checkin: prefsRow?.notif_daily_checkin ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
        notif_weekly_summary: prefsRow?.notif_weekly_summary ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
        notif_milestone_approaching: prefsRow?.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
        notif_urge_prediction: prefsRow?.notif_urge_prediction ?? DEFAULT_NOTIF_PREFS.notif_urge_prediction,
        notif_community: prefsRow?.notif_community ?? DEFAULT_NOTIF_PREFS.notif_community,
      };
      await scheduleAllNotifications(prefs, prevQuit);
      await scheduleOnboardingCheckin();
      await fetchData();
    } finally {
      setRelapseLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bgScreen }}>
        <SkeletonBox height={220} radius={0} />
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonBox height={160} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SkeletonBox height={70} />
            <SkeletonBox height={70} />
            <SkeletonBox height={70} />
          </View>
          <SkeletonBox height={90} />
          <SkeletonBox height={140} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[s.loadingContainer, { gap: 16 }]}>
        {loadError ? (
          <>
            <Text style={{ fontSize: 15, color: c.textBody, textAlign: 'center' }}>
              Couldn&apos;t load your data. Check your connection.
            </Text>
            <Pressable
              style={({ pressed }) => [{ backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 }, pressed && { opacity: 0.8 }]}
              onPress={() => { setLoadError(false); setLoading(true); fetchData().finally(() => setLoading(false)); }}>
              <Text style={{ color: c.white, fontWeight: '700', fontSize: 15 }}>Try again</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  const { next, remainingMs, progress } = getMilestone(streakMs);
  const motivations = (data.motivation ?? '').split(',').filter(Boolean).map(
    m => MOTIVATION_MAP[m] ?? { label: m, emoji: '💪' }
  );
  const checkinStreak = data.checkinStreak.current;
  const msToPersonalBest = data.longestStreak > 0 && streakMs < data.longestStreak * 86400000
    ? Math.max(0, data.longestStreak * 86400000 - streakMs)
    : null;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: c.headerBg }]}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <View style={s.headerTop}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.greeting} numberOfLines={1}>{getGreeting(data.displayName)}</Text>
                <Text style={s.quote} numberOfLines={2}>&quot;{QUOTES[quoteIndex]}&quot;</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/account' as any)} hitSlop={10} accessibilityLabel="Account and settings" accessibilityRole="button" style={{ marginTop: 6, marginRight: 2 }}>
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
                    <Ionicons name="share-outline" size={15} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                </View>
                <LiveCounter quitDate={data.quitDate} />
                <View style={s.separator} />
                {next < 1 && data.quitDate
                  ? <SubDayCountdown quitDate={data.quitDate} nextDays={next} style={s.milestoneTxt} />
                  : <Text style={s.milestoneTxt}>
                      {remainingMs <= 0
                        ? `🎉 ${milestoneLabel(next)} reached!`
                        : `${fmtCountdown(remainingMs, true)} to ${milestoneLabel(next)}`}
                    </Text>
                }
                <View style={s.streakMetaRow}>
                  <Text style={s.longestTxt}>Best: {formatBest(data.longestStreak, streakMs)}</Text>
                  {msToPersonalBest !== null && (
                    <Text style={s.personalBestTxt}>· {fmtCountdown(msToPersonalBest)} to beat</Text>
                  )}
                </View>
                {!!data.quitDate && (
                  <Text style={s.startedTxt}>{formatStartDate(data.quitDate)}</Text>
                )}
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* ── Body ── */}
      <ScrollView
        ref={bodyScrollRef}
        style={s.body}
        contentContainerStyle={s.bodyContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>

        {/* Partner message banner */}
        {partnerMsg && (
          <Pressable
            style={({ pressed }) => [s.partnerMsgBanner, pressed && { opacity: 0.85 }]}
            onPress={async () => {
              setPartnerMsg(null);
              try {
                await supabase.from('partner_messages').update({ read_at: new Date().toISOString() }).eq('id', partnerMsg.id);
              } catch (_e) {}
            }}>
            <Text style={s.partnerMsgEmoji}>💙</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.partnerMsgLabel}>Message from someone in your corner</Text>
              <Text style={s.partnerMsgTxt} numberOfLines={3}>{partnerMsg.message}</Text>
            </View>
            <Ionicons name="close-outline" size={18} color={c.primary} />
          </Pressable>
        )}

        {/* Stats */}
        <SavedCardWrapper quitDate={data.quitDate} weeklyBet={data.weeklyBet} currency={data.currency} totalPaid={data.totalPaid} nowMs={nowMs} />

        {/* Badges */}
        <View style={s.card} onLayout={e => setBadgesCardY(e.nativeEvent.layout.y)}>
          <View style={s.milestonesHeader}>
            <Text style={s.weekStripTitle}>Milestones</Text>
            <Text style={s.milestonesHint}>Tap for details</Text>
          </View>
          <ScrollView ref={badgeScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgesRow}>
            {(() => {
              const unearnedStart = BADGE_DEFS.findIndex(b => b.days > 0 && !data.earnedBadges.includes(b.type));
              return BADGE_DEFS.filter((badge, i) => {
                const earned = badge.days === 0 || data.earnedBadges.includes(badge.type);
                return earned || (unearnedStart >= 0 && i >= unearnedStart && i < unearnedStart + 6);
              });
            })().map(badge => {
              // started badge (days: 0) is earned from day 0 — always show as earned
              const earned = badge.days === 0 || data.earnedBadges.includes(badge.type);
              const streakFrac = streakMs / 86400000;
              const progress = earned ? 1 : badge.days > 0 ? Math.min(1, streakFrac / badge.days) : 1;
              return (
                <Pressable key={badge.type} style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  accessibilityLabel={`${badge.label} — ${earned ? 'earned' : 'locked'}`}
                  accessibilityRole="button"
                  onPress={() => {
                  if (earned) {
                    const earnedAt = data.badgeTimestamps[badge.type];
                    const dailyRate = weeklyToDaily(data.weeklyBet);
                    const det: Array<{ label: string; value: string; highlight?: boolean }> = [];
                    if (badge.days === 0) {
                      const d = earnedAt ?? data.quitDate;
                      if (d) det.push({ label: 'Started on', value: new Date(d).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) });
                    } else {
                      if (earnedAt) det.push({ label: 'Earned on', value: new Date(earnedAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) });
                      const currentQuitTs = data.quitDate ? parseQuitDate(data.quitDate).getTime() : 0;
                      const badgeIsCurrentStreak = earnedAt ? new Date(earnedAt).getTime() >= currentQuitTs : false;
                      if (badgeIsCurrentStreak) {
                        det.push({ label: 'Current streak', value: formatStreakFull(streakMs) });
                      }
                      if (dailyRate > 0) {
                        det.push({ label: 'Saved at milestone', value: fmt(badge.days * dailyRate, data.currency) });
                        if (badgeIsCurrentStreak) {
                          det.push({ label: 'Total saved', value: fmt((streakMs / 86400000) * dailyRate, data.currency), highlight: true });
                        }
                      }
                    }
                    openShareCard(
                      { emoji: badge.emoji, label: badge.label },
                      badge.days === 0,
                      det,
                      false,
                      0,
                      '',
                      badge.days > 0 ? badge.label : null,
                      badge.days > 0 ? (earnedAt ?? null) : null,
                    );
                  } else {
                    const sf = streakMs / 86400000;
                    const dLeft = badge.days - sf;
                    const estDate = data.quitDate ? new Date(parseQuitDate(data.quitDate).getTime() + badge.days * 86400000) : null;
                    const dr = weeklyToDaily(data.weeklyBet);
                    const det: Array<{ label: string; value: string; highlight?: boolean }> = [
                      { label: 'Time remaining', value: formatTimeLeft(dLeft) },
                      ...(estDate ? [{ label: 'Est. date', value: estDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) }] : []),
                      ...(dr > 0 ? [{ label: "You'll have saved", value: fmt(badge.days * dr, data.currency), highlight: true }] : []),
                    ];
                    openShareCard({ emoji: badge.emoji, label: badge.label }, true, det, true, badge.days > 0 ? Math.min(1, sf / badge.days) : 0, BADGE_PENDING_MSGS[Math.floor(Math.random() * BADGE_PENDING_MSGS.length)]);
                  }
                }}>
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
                  accessibilityLabel={`${debt.name} paid — ${debt.earned ? 'earned' : 'locked'}`}
                  accessibilityRole="button"
                  onPress={() => { if (debt.earned) { openShareCard({ emoji: '🏦', label: `${debt.name} paid` }, true, [{ label: 'Total paid off', value: fmt(debt.totalAmount, data.currency), highlight: true }]); } else { const owed = Math.max(0, debt.totalAmount - debt.paidAmount); openShareCard({ emoji: '🏦', label: `${debt.name} paid` }, true, [{ label: 'Total', value: fmt(debt.totalAmount, data.currency) }, { label: 'Paid back', value: fmt(debt.paidAmount, data.currency), highlight: true }, ...(owed > 0 ? [{ label: 'Still owed', value: fmt(owed, data.currency) }] : [])], true, debt.totalAmount > 0 ? Math.min(1, debt.paidAmount / debt.totalAmount) : 0, "Keep making payments and this badge will be yours."); } }}>
                  <View style={[s.badgeCircle, debt.earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={progress} />
                    <Text style={s.badgeEmoji}>{debt.earned ? '🏦' : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !debt.earned && s.badgeLabelLocked]} numberOfLines={1} ellipsizeMode="tail">{debt.name} paid</Text>
                </Pressable>
              );
            })}
            {(() => {
              const earned = data.checklistCompleted || data.earnedBadges.includes('checklist_complete');
              return (
                <Pressable style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  accessibilityLabel={`Safe Zone — ${earned ? 'earned' : 'locked'}`}
                  accessibilityRole="button"
                  onPress={() => {
                    if (earned) {
                      openShareCard({ emoji: '🛡️', label: 'Safe Zone' }, true, [{ label: 'Achievement', value: 'All prevention steps completed' }]);
                    } else {
                      const done = Math.round(data.checklistProgress * CHECKLIST_TOTAL);
                      openShareCard(
                        { emoji: '🛡️', label: 'Safe Zone' }, true,
                        [{ label: 'Steps completed', value: `${done} of ${CHECKLIST_TOTAL}` }],
                        true, data.checklistProgress,
                        'Complete every step of the prevention checklist.',
                        null, null,
                        { label: 'Open Checklist', onPress: () => { setShowShareCard(false); router.push('/(tabs)/urge/checklist' as any); } },
                      );
                    }
                  }}>
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
              if (!data.savingsGoal && !earned) return null;
              return (
                <Pressable style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  accessibilityLabel={`Goal Setter — ${earned ? 'earned' : 'locked'}`}
                  accessibilityRole="button"
                  onPress={() => { if (earned) { openShareCard({ emoji: '📍', label: 'Goal Setter' }, true, [{ label: 'Saving towards', value: data.savingsGoalFor || 'My goal' }, { label: 'Goal amount', value: fmt(data.savingsGoal ?? 0, data.currency) }]); } else { openShareCard({ emoji: '📍', label: 'Goal Setter' }, true, [], true, 0, "Set a savings goal in the Tracker tab to earn this badge."); } }}>
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
              if (!data.savingsGoal && !earned) return null;
              const progress = data.savingsGoal && data.savingsGoal > 0
                ? Math.min(1, data.totalPaid / data.savingsGoal) : 0;
              return (
                <Pressable style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  accessibilityLabel={`Goal Met — ${earned ? 'earned' : 'locked'}`}
                  accessibilityRole="button"
                  onPress={() => { if (earned) { openShareCard({ emoji: '🎊', label: 'Goal Met' }, true, [{ label: 'Goal', value: data.savingsGoalFor || 'My goal' }, { label: 'Amount saved', value: fmt(data.totalPaid, data.currency), highlight: true }]); } else { const prog = data.savingsGoal && data.savingsGoal > 0 ? Math.min(1, data.totalPaid / data.savingsGoal) : 0; const det = data.savingsGoal ? [{ label: 'Goal', value: fmt(data.savingsGoal, data.currency) }, { label: 'Saved so far', value: fmt(data.totalPaid, data.currency), highlight: true as const }, { label: 'Remaining', value: fmt(Math.max(0, data.savingsGoal - data.totalPaid), data.currency) }] : [{ label: 'Next step', value: 'Set a savings goal in Tracker' }]; openShareCard({ emoji: '🎊', label: 'Goal Met' }, true, det, true, prog, "Every saving logged brings you closer to this milestone."); } }}>
                  <View style={[s.badgeCircle, earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={earned ? 1 : progress} />
                    <Text style={s.badgeEmoji}>{earned ? '🎊' : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !earned && s.badgeLabelLocked]} numberOfLines={1}>Goal Met</Text>
                </Pressable>
              );
            })()}
            {(() => {
              const debtFullyPaid = data.debtItems.length > 0 && data.debtItems.every(d => d.paidAmount >= d.totalAmount);
              const firstUnearned = (group: string[]) => group.findIndex(t => !data.earnedBadges.includes(t));
              // Gateway badges — hidden until earned; chains exclude them for progressive display
              const GATEWAY_BADGES = new Set(['loss_first_log', 'first_payment', 'first_journal', 'community_first_post']);
              const PAYMENT_CHAIN = PAYMENT_BADGE_TYPES.filter(t => t !== 'first_payment');
              const URGE_CHAIN    = URGE_BADGE_TYPES.filter(t => t !== 'first_journal');
              const firstUnearnedPaymentChain = debtFullyPaid ? -1 : firstUnearned(PAYMENT_CHAIN);
              const firstUnearnedCheckin = firstUnearned(CHECKIN_BADGE_TYPES);
              const firstUnearnedUrge    = firstUnearned(URGE_CHAIN);
              const progressiveFilter = (group: string[], firstIdx: number, badge: { type: string }, showAhead = 2) => {
                if (data.earnedBadges.includes(badge.type)) return true;
                const idx = group.indexOf(badge.type);
                return firstIdx >= 0 && idx >= firstIdx && idx < firstIdx + showAhead;
              };
              return ACTIVITY_BADGE_DEFS.filter(badge => {
                if (GATEWAY_BADGES.has(badge.type)) return data.earnedBadges.includes(badge.type);
                if (PAYMENT_BADGE_TYPES.includes(badge.type)) {
                  if (!data.earnedBadges.includes('first_payment')) return false;
                  return progressiveFilter(PAYMENT_CHAIN, firstUnearnedPaymentChain, badge, 1);
                }
                if (CHECKIN_BADGE_TYPES.includes(badge.type)) return progressiveFilter(CHECKIN_BADGE_TYPES, firstUnearnedCheckin, badge, 1);
                if (URGE_BADGE_TYPES.includes(badge.type)) {
                  if (!data.earnedBadges.includes('first_journal')) return false;
                  return progressiveFilter(URGE_CHAIN, firstUnearnedUrge, badge, 1);
                }
                return true;
              });
            })().map(badge => {
              const earned = data.earnedBadges.includes(badge.type);
              const earnedAt = data.badgeTimestamps[badge.type];
              const activityCount = CHECKIN_BADGE_TYPES.includes(badge.type) ? data.moodCount
                : URGE_BADGE_TYPES.includes(badge.type) ? data.urgesOvercome
                : PAYMENT_BADGE_TYPES.includes(badge.type) ? data.paymentCount
                : 0;
              const progress = earned ? 1 : Math.min(1, activityCount / (ACTIVITY_BADGE_THRESHOLDS[badge.type] ?? 1));
              return (
                <Pressable key={badge.type} style={({ pressed }) => [s.badgeItem, pressed && { opacity: 0.75 }]}
                  accessibilityLabel={`${badge.label} — ${earned ? 'earned' : 'locked'}`}
                  accessibilityRole="button"
                  onPress={() => {
                    if (earned) {
                      const det: Array<{ label: string; value: string }> = [{ label: 'Achievement', value: badge.earned }];
                      if (earnedAt) det.unshift({ label: 'Earned on', value: new Date(earnedAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) });
                      openShareCard({ emoji: badge.emoji, label: badge.label }, true, det);
                    } else {
                      openShareCard({ emoji: badge.emoji, label: badge.label }, true, [{ label: 'How to earn', value: badge.pending }], true, progress, badge.pending);
                    }
                  }}>
                  <View style={[s.badgeCircle, earned ? s.badgeEarned : s.badgeLocked]}>
                    <BadgeRing progress={progress} />
                    <Text style={s.badgeEmoji}>{earned ? badge.emoji : '🔒'}</Text>
                  </View>
                  <Text style={[s.badgeLabel, !earned && s.badgeLabelLocked]} numberOfLines={2} ellipsizeMode="tail">{badge.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Quick actions */}
        <View style={s.quickActionsCard}>
          <Pressable style={({ pressed }) => [s.quickActionBtn, pressed && { opacity: 0.7 }]} onPress={() => router.push('/urge')}>
            <Text style={s.quickActionEmoji}>🧠</Text>
            <Text style={s.quickActionLabel}>Urge Help</Text>
          </Pressable>
          <View style={s.quickActionDivider} />
          <Pressable style={({ pressed }) => [s.quickActionBtn, pressed && { opacity: 0.7 }]} onPress={() => router.push('/journal' as any)}>
            <Text style={s.quickActionEmoji}>📓</Text>
            <Text style={s.quickActionLabel}>Journal</Text>
          </Pressable>
          <View style={s.quickActionDivider} />
          <Pressable style={({ pressed }) => [s.quickActionBtn, pressed && { opacity: 0.7 }]} onPress={() => router.push('/analytics' as any)}>
            <Text style={s.quickActionEmoji}>📊</Text>
            <Text style={s.quickActionLabel}>Analytics</Text>
          </Pressable>
        </View>

        {/* Mood — combined check-in + week strip */}
        <View style={s.moodCard} onLayout={e => setMoodCardY(e.nativeEvent.layout.y)}>
          {data.todayMood !== null && !editingMood ? (
            <View style={s.moodDoneWrap}>
              <View style={s.moodDone}>
                <View style={s.moodDoneRow}>
                  <Text style={s.moodDoneLabel}>Today&apos;s mood: </Text>
                  <Text style={s.moodDoneEmoji}>{MOODS[data.todayMood - 1]}</Text>
                  {data.todayMoodNote
                    ? <Text style={s.moodDoneNote} numberOfLines={1}>{' '}{data.todayMoodNote}</Text>
                    : null}
                </View>
                <Pressable onPress={() => { setEditingMood(true); setMoodNote(data.todayMoodNote ?? ''); setEditMoodValue(data.todayMood); }} style={({ pressed }) => [s.moodEditBtn, pressed && { opacity: 0.6 }]}>
                  <Text style={s.moodEditBtnTxt}>Edit</Text>
                </Pressable>
              </View>
              {checkinStreak >= 2 && (
                <Text style={s.moodStreakTxt}>🔥 {checkinStreak}-day check-in streak{data.checkinStreak.best > checkinStreak ? ` · best ${data.checkinStreak.best}d` : checkinStreak >= data.checkinStreak.best && checkinStreak >= 7 ? ' · personal best!' : ''}</Text>
              )}
            </View>
          ) : (
            <>
              <View style={s.moodCardTitleRow}>
                <Text style={s.moodCardTitle}>How are you feeling today?</Text>
                {checkinStreak >= 2 && (
                  <Text style={s.moodStreakBadge}>🔥 {checkinStreak}d</Text>
                )}
              </View>
              {moodSubmitting ? (
                <ActivityIndicator color={c.primary} style={{ marginTop: 8 }} />
              ) : (
                <>
                  <View style={s.moodRow}>
                    {MOODS.map((emoji, i) => {
                      const moodAccessibilityLabels = [
                        'Mood 1 — Very bad',
                        'Mood 2 — Bad',
                        'Mood 3 — Neutral',
                        'Mood 4 — Good',
                        'Mood 5 — Great',
                      ];
                      return (
                        <Pressable
                          key={i}
                          onPress={() => { haptic(); setEditMoodValue(i + 1); }}
                          accessibilityLabel={moodAccessibilityLabels[i]}
                          accessibilityRole="button"
                          style={({ pressed }) => [s.moodBtn, pressed && s.pressed,
                            editMoodValue === i + 1 && s.moodBtnSelected]}>
                          <Text style={s.moodEmoji}>{emoji}</Text>
                          <Text style={[s.moodLabelTxt, editMoodValue === i + 1 && s.moodLabelTxtSelected]}>
                            {MOOD_LABELS[i]}
                          </Text>
                        </Pressable>
                      );
                    })}
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
                        <Text style={s.moodClearTxt}>Clear today&apos;s mood</Text>
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

          <View style={s.moodInnerDivider} />

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
          {(() => {
            const logged = data.weekMoods.filter(d => d.mood !== null);
            if (logged.length < 2) return null;
            const avg = logged.reduce((s, d) => s + d.mood!, 0) / logged.length;
            const avgEmoji = MOODS[Math.round(avg) - 1];
            return (
              <Text style={s.moodAvgTxt}>This week: {avgEmoji} avg mood</Text>
            );
          })()}
        </View>


        {/* Your why */}
        {motivations.length > 0 && (
          <View style={[s.whyAnchorCard, { backgroundColor: c.headerBg }]}>
            <View style={s.whyAnchorHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.whyAnchorLabel}>Your why</Text>
                <Text style={s.whyAnchorSub}>What you&apos;re fighting for</Text>
                <ScrollView style={{ marginTop: 12, maxHeight: 80 }} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={s.whyAnchorCol}>
                  {motivations.map((m, i) => (
                    <View key={i} style={[s.whyAnchorChip, i > 0 && { marginTop: 6 }]}>
                      <Text style={s.whyAnchorEmoji}>{m.emoji}</Text>
                      <Text style={s.whyAnchorText}>{m.label}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
              <Pressable onPress={pickMotivationPhoto}>
                {motivationPhoto ? (
                  <Image source={{ uri: motivationPhoto }} style={s.whyAnchorPhoto} />
                ) : (
                  <View style={[s.whyAnchorPhoto, s.whyAnchorPhotoEmpty]}>
                    <Text style={{ fontSize: 22 }}>📷</Text>
                    <Text style={s.whyAnchorPhotoAddTxt}>Add</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Urge prediction card — only visible 1h before and after peak */}
        {urgePeakHour !== null && (() => {
          const nowHour = new Date().getHours();
          const diff = ((nowHour - urgePeakHour + 24) % 24);
          if (diff > 1 && diff < 23) return null;
          const h = urgePeakHour;
          const period = h < 12 ? 'AM' : 'PM';
          const display = h === 0 ? '12' : h <= 12 ? String(h) : String(h - 12);
          const warnH = urgePeakHour === 0 ? 23 : urgePeakHour - 1;
          const warnPeriod = warnH < 12 ? 'AM' : 'PM';
          const warnDisplay = warnH === 0 ? '12' : warnH <= 12 ? String(warnH) : String(warnH - 12);
          return (
            <Pressable
              style={({ pressed }) => [s.urgePredCard, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/(tabs)/urge' as any)}>
              <Text style={s.urgePredEmoji}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.urgePredTitle}>Your riskiest window</Text>
                <Text style={s.urgePredTime}>Around {display}:00 {period}</Text>
                <Text style={s.urgePredSub}>Reminder set for {warnDisplay}:30 {warnPeriod} · Tap for urge support</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
            </Pressable>
          );
        })()}

        {/* Recovery calendar heatmap */}
        {(() => {
          const days = data.calendarDays;
          if (days.length === 0) return null;
          const dotColor = (day: typeof days[0] | null): string => {
            if (!day) return 'transparent';
            if (day.status === 'inactive') return c.bgElement;
            if (day.status === 'relapse') return c.error;
            return c.primaryMid;
          };
          // Arrange into week columns (Sun→Sat going down each column)
          const firstDate = new Date(days[0].iso + 'T00:00:00');
          const startDow = firstDate.getDay();
          const padded: (typeof days[0] | null)[] = [...Array(startDow).fill(null), ...days];
          const calWeeks: (typeof days[0] | null)[][] = [];
          for (let i = 0; i < padded.length; i += 7) {
            const chunk = padded.slice(i, i + 7);
            while (chunk.length < 7) chunk.push(null);
            calWeeks.push(chunk);
          }
          const cleanCount = days.filter(d => d.status === 'clean').length;
          const relapseCount = days.filter(d => d.status === 'relapse').length;
          return (
            <View style={s.homCalCard}>
              <View style={s.homCalHeader}>
                <Text style={s.homCalTitle}>Recovery calendar</Text>
                <Text style={s.homCalSub}>{cleanCount} clean · {relapseCount > 0 ? `${relapseCount} slip${relapseCount > 1 ? 's' : ''}` : 'no slips'} · last 30 days</Text>
              </View>
              <View style={s.homCalDayLabels}>
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <Text key={i} style={s.homCalDayLabel}>{d}</Text>
                ))}
              </View>
              <View style={s.homCalGrid}>
                {calWeeks.map((week, wi) => (
                  <View key={wi} style={s.homCalCol}>
                    {week.map((day, di) => (
                      <Pressable
                        key={di}
                        style={({ pressed }) => [s.homCalDot, { backgroundColor: dotColor(day) }, pressed && day && day.status !== 'inactive' && { opacity: 0.7 }]}
                        onPress={() => { if (day && day.status !== 'inactive') setCalDayModal(day); }}
                      />
                    ))}
                  </View>
                ))}
              </View>
              <View style={s.homCalLegend}>
                <View style={s.homCalLegendItem}><View style={[s.homCalLegendDot, { backgroundColor: c.primary }]} /><Text style={s.homCalLegendTxt}>Clean</Text></View>
                <View style={s.homCalLegendItem}><View style={[s.homCalLegendDot, { backgroundColor: c.error }]} /><Text style={s.homCalLegendTxt}>Slip</Text></View>
                <View style={s.homCalLegendItem}><View style={[s.homCalLegendDot, { backgroundColor: c.bgElement }]} /><Text style={s.homCalLegendTxt}>Before start</Text></View>
              </View>
            </View>
          );
        })()}

        {/* Relapse card */}
        {streakDays >= 30 ? (
          <Pressable
            style={({ pressed }) => [s.relapseMinimal, pressed && { opacity: 0.6 }]}
            onPress={handleRelapse}
            disabled={relapseLoading}>
            {relapseLoading
              ? <ActivityIndicator color={c.textFaint} size="small" />
              : <Text style={s.relapseMinimalTxt}>Had a slip? Reset streak</Text>}
          </Pressable>
        ) : (
          <View style={s.relapseCard}>
            <Text style={s.relapseTitle}>Had a slip? That&apos;s okay.</Text>
            <Text style={s.relapseSubtitle}>
              Recovery isn&apos;t linear. Every restart is still progress.
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
        )}

        {/* Streak shield undo banner */}
        {shieldUndo && shieldUndo.expiresAt > Date.now() && (
          <View style={s.shieldUndoBanner}>
            <Text style={s.shieldUndoIcon}>🛡️</Text>
            <View style={s.shieldUndoBody}>
              <Text style={s.shieldUndoTitle}>Shield active</Text>
              <Text style={s.shieldUndoSub}>
                Undo expires in {Math.max(1, Math.ceil((shieldUndo.expiresAt - Date.now()) / 3600000))}h — restore your {shieldUndo.prevStreakDays}d streak
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [s.shieldUndoBtn, pressed && { opacity: 0.8 }]}
              onPress={doUndoRelapse}
              disabled={relapseLoading}>
              {relapseLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.shieldUndoBtnTxt}>Undo</Text>}
            </Pressable>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Calendar day detail modal */}
      <Modal visible={!!calDayModal} transparent animationType="fade" onRequestClose={() => setCalDayModal(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setCalDayModal(null)}>
          <Pressable style={[s.confirmSheet, { paddingBottom: 28 }]} onPress={() => {}}>
            {calDayModal && (() => {
              const d = new Date(calDayModal.iso + 'T00:00:00');
              const dateStr = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
              const isClean = calDayModal.status === 'clean';
              return (
                <>
                  <Text style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>
                    {isClean ? (calDayModal.mood ? MOODS[calDayModal.mood - 1] : '✅') : '😔'}
                  </Text>
                  <Text style={[s.confirmTitle, { marginBottom: 4 }]}>{dateStr}</Text>
                  <Text style={[s.confirmBody, { marginBottom: 0 }]}>
                    {isClean
                      ? calDayModal.mood
                        ? `You felt ${MOOD_LABELS[calDayModal.mood - 1].toLowerCase()} and stayed clean.`
                        : 'A clean day — no mood logged.'
                      : 'You had a slip this day. Every day after is progress.'}
                  </Text>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Custom milestone celebration modal */}
      <Modal visible={customMilestoneCelebVisible} transparent animationType="fade" onRequestClose={() => setCustomMilestoneCelebVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setCustomMilestoneCelebVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={s.confirmIconCircle}>
                <Text style={{ fontSize: 32 }}>{customMilestone?.icon ?? '🎯'}</Text>
              </View>
            </View>
            <Text style={s.confirmTitle}>{
              customMilestone?.type === 'days'     ? `${customMilestone.target} Days Clean!` :
              customMilestone?.type === 'savings'  ? `${customMilestone.target} Saved!` :
              customMilestone?.type === 'urges'    ? `${customMilestone.target} Urges Beaten!` :
              customMilestone?.type === 'payments' ? `${customMilestone.target} Payments Made!` : 'Milestone reached!'
            }</Text>
            <Text style={s.confirmBody}>
              You hit your personal milestone.{'\n'}This is exactly what you set out to do. 🏆
            </Text>
            <Pressable
              style={[s.continueBtn, { marginBottom: 6 }]}
              onPress={() => { setCustomMilestoneCelebVisible(false); openShareCard({ emoji: '🎯', label: customMilestone ? `${customMilestone.target} ${customMilestone.type === 'days' ? 'Days' : customMilestone.type === 'savings' ? 'Saved' : customMilestone.type === 'urges' ? 'Urges' : 'Payments'}` : 'Milestone' }, false); }}>
              <Text style={s.continueBtnTxt}>Share</Text>
            </Pressable>
            <View style={s.confirmDivider} />
            <Pressable style={s.confirmCancel} onPress={() => setCustomMilestoneCelebVisible(false)}>
              <Text style={s.confirmCancelTxt}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Badge detail modal */}
      <Modal visible={!!selectedBadge} transparent animationType="fade" onRequestClose={() => { if (selectedBadge?.type !== 'started') showInterstitialIfReady(isPremium); setSelectedBadge(null); }}>
        <Pressable style={s.modalOverlay} onPress={() => { if (selectedBadge?.type !== 'started') showInterstitialIfReady(isPremium); setSelectedBadge(null); }}>
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
                    <Text style={s.modalSubtitle}>You&apos;re {pct}% of the way there</Text>
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
                        <Text style={s.modalRowLabel}>You&apos;ll have saved</Text>
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
        <Pressable style={s.relapseOverlay} onPress={() => setRelapseConfirmVisible(false)}>
          <Pressable style={s.relapseSheet} onPress={() => {}}>
            <View style={s.relapseIconCircle}>
              <Text style={{ fontSize: 32 }}>🔄</Text>
            </View>
            <Text style={s.relapseSheetTitle}>Had a slip?</Text>
            <Text style={s.relapseSheetBody}>
              That&apos;s okay — every restart is still progress. You can get support right now, or reset and begin again.
            </Text>
            <Pressable
              style={({ pressed }) => [s.relapseUrgeBtn, pressed && { opacity: 0.85 }]}
              onPress={() => { setRelapseConfirmVisible(false); router.push('/(tabs)/urge' as any); }}>
              <Text style={s.relapseUrgeBtnTxt}>Get urge support</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.relapseResetBtn, relapseLoading && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
              onPress={() => { setRelapseConfirmVisible(false); doRelapse(); }}
              disabled={relapseLoading}>
              <Text style={s.relapseResetBtnTxt}>Reset my streak</Text>
            </Pressable>
            <View style={s.relapseSheetDivider} />
            <Pressable
              style={({ pressed }) => [s.relapseNotNowBtn, pressed && { opacity: 0.6 }]}
              onPress={() => setRelapseConfirmVisible(false)}>
              <Text style={s.relapseNotNowTxt}>Cancel</Text>
            </Pressable>
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
            <View style={s.modalActions}>
              {data.checklistCompleted && (
                <View style={s.modalShareRow}>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { setChecklistBadgeVisible(false); openShareCard({ emoji: '🛡️', label: 'Safe Zone' }, true); }}>
                    <Ionicons name="share-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Share</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { setChecklistBadgeVisible(false); router.push({ pathname: '/(tabs)/community/new-post', params: { initialContent: '🛡️ Just earned the Safe Zone badge — completed every step of the prevention checklist! Taking real action to protect my recovery. 💪', initialTag: '#Milestone' } } as any); }}>
                    <Ionicons name="people-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Community</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setChecklistBadgeVisible(false)}>
                <Text style={s.modalCloseTxt}>Close</Text>
              </Pressable>
            </View>
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
            <View style={s.modalActions}>
              {data.earnedBadges.includes('goal_set') && (
                <View style={s.modalShareRow}>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { setGoalSetBadgeVisible(false); openShareCard({ emoji: '📍', label: 'Goal Setter' }, true); }}>
                    <Ionicons name="share-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Share</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { setGoalSetBadgeVisible(false); router.push({ pathname: '/(tabs)/community/new-post', params: { initialContent: '📍 Just earned the Goal Setter badge! I\'ve set a savings goal and I\'m working toward it. Having something to aim for makes every day worth it. 💪', initialTag: '#Milestone' } } as any); }}>
                    <Ionicons name="people-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Community</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setGoalSetBadgeVisible(false)}>
                <Text style={s.modalCloseTxt}>Close</Text>
              </Pressable>
            </View>
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
            <View style={s.modalActions}>
              {data.earnedBadges.includes('goal_reached') && (
                <View style={s.modalShareRow}>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { setGoalReachedBadgeVisible(false); openShareCard({ emoji: '🎊', label: 'Goal Met' }, true); }}>
                    <Ionicons name="share-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Share</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { setGoalReachedBadgeVisible(false); router.push({ pathname: '/(tabs)/community/new-post', params: { initialContent: '🎊 Just reached my savings goal and earned the Goal Met badge! Proof that every day clean adds up to something real. 💪', initialTag: '#Milestone' } } as any); }}>
                    <Ionicons name="people-outline" size={16} color={c.primary} />
                    <Text style={s.modalShareTxt}>Community</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setGoalReachedBadgeVisible(false)}>
                <Text style={s.modalCloseTxt}>Close</Text>
              </Pressable>
            </View>
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
            <View style={s.modalActions}>
              {selectedDebtId && (() => {
                const debt = data.debtItems.find(d => d.id === selectedDebtId);
                return debt?.earned ? (
                  <View style={s.modalShareRow}>
                    <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { const d = data.debtItems.find(x => x.id === selectedDebtId); setSelectedDebtId(null); if (d) openShareCard({ emoji: '🏦', label: `${d.name} paid` }, true); }}>
                      <Ionicons name="share-outline" size={16} color={c.primary} />
                      <Text style={s.modalShareTxt}>Share</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [s.modalShareBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={() => { const d = data.debtItems.find(x => x.id === selectedDebtId); setSelectedDebtId(null); if (d) router.push({ pathname: '/(tabs)/community/new-post', params: { initialContent: `🏦 Just paid off "${d.name}"! Fully cleared this debt — one more step toward financial freedom. 💪`, initialTag: '#Milestone' } } as any); }}>
                      <Ionicons name="people-outline" size={16} color={c.primary} />
                      <Text style={s.modalShareTxt}>Community</Text>
                    </Pressable>
                  </View>
                ) : null;
              })()}
              <Pressable style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]} onPress={() => setSelectedDebtId(null)}>
                <Text style={s.modalCloseTxt}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* ── Share / badge card modal ── */}
      <Modal visible={showShareCard} transparent animationType="fade" onRequestClose={() => setShowShareCard(false)}>
        <Pressable style={s.shareOverlay} onPress={() => setShowShareCard(false)}>
          <Pressable onPress={() => {}} style={{ alignItems: 'center' }}>
            <View ref={shareCardRef} collapsable={false} style={s.shareCardWrap}>
              <LinearGradient
                colors={cc.gradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.shareCard}
              >
                <View style={s.shareCardTop}>
                  <Text style={[s.shareCardBrand, { color: cc.brand }]}>CornerDay</Text>
                  <View style={[s.shareCardLogoBadge, { backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(10,104,104,0.8)' }]}>
                    <Logo size={28} variant="white" />
                  </View>
                </View>

                {shareCardLocked ? (
                  <View style={s.shareCardCenter}>
                    <Text style={s.shareCardAchievementEmoji}>🔒</Text>
                    <Text style={[s.shareCardAchievementLabel, { color: cc.bigText }]}>{shareCardBadge?.label?.toUpperCase()}</Text>
                    {shareCardProgress > 0 && (
                      <Text style={[s.shareCardSub, { color: cc.sub }]}>{Math.round(shareCardProgress * 100)}% of the way there</Text>
                    )}
                  </View>
                ) : shareCardHideTime ? (
                  <View style={s.shareCardCenter}>
                    <Text style={s.shareCardAchievementEmoji}>{shareCardBadge?.emoji ?? '🏆'}</Text>
                    <Text style={[s.shareCardAchievementLabel, { color: cc.bigText }]}>{shareCardBadge?.label?.toUpperCase()}</Text>
                    <Text style={[s.shareCardSub, { color: cc.sub }]}>milestone earned</Text>
                  </View>
                ) : shareCardMilestoneLabel ? (
                  <View style={s.shareCardCenter}>
                    <Text style={[s.shareCardNum, { color: cc.bigText }]}>{shareCardMilestoneLabel.split(' ')[0]}</Text>
                    <Text style={[s.shareCardUnit, { color: cc.unit }]}>
                      {shareCardMilestoneLabel.split(' ').slice(1).join(' ').toUpperCase()}
                    </Text>
                    <Text style={[s.shareCardSub, { color: cc.sub }]}>milestone reached</Text>
                  </View>
                ) : (
                  <View style={s.shareCardCenter}>
                    {(() => {
                      const totalDays = Math.floor(streakMs / 86400000);
                      const totalHrs  = Math.floor(streakMs / 3600000);
                      const totalMins = Math.floor(streakMs / 60000);
                      let num: string, unit: string, extra: string | null = null;
                      if (totalDays >= 1) {
                        num  = String(totalDays);
                        unit = totalDays === 1 ? 'DAY' : 'DAYS';
                        const h = totalHrs - totalDays * 24;
                        if (h > 0) extra = `and ${h} ${h === 1 ? 'hour' : 'hours'}`;
                      } else if (totalHrs >= 1) {
                        num  = String(totalHrs);
                        unit = totalHrs === 1 ? 'HOUR' : 'HOURS';
                        const m = totalMins - totalHrs * 60;
                        if (m > 0) extra = `and ${m} min`;
                      } else {
                        num  = String(Math.max(1, totalMins));
                        unit = totalMins === 1 ? 'MINUTE' : 'MINUTES';
                      }
                      return (
                        <>
                          <Text style={[s.shareCardNum, { color: cc.bigText }]}>{num}</Text>
                          <Text style={[s.shareCardUnit, { color: cc.unit }]}>{unit}</Text>
                          {extra && <Text style={[s.shareCardStreakExtra, { color: cc.sub }]}>{extra}</Text>}
                          <Text style={[s.shareCardSub, { color: cc.sub, marginTop: 8 }]}>free from gambling</Text>
                        </>
                      );
                    })()}
                  </View>
                )}

                {shareCardLocked && shareCardProgress > 0 && (
                  <View style={[s.shareCardProgressTrack, { backgroundColor: cc.progressTrack }]}>
                    <View style={[s.shareCardProgressFill, { width: `${Math.round(shareCardProgress * 100)}%` as any, backgroundColor: cc.progressFill }]} />
                  </View>
                )}

                <View style={[s.shareCardDivider, { backgroundColor: cc.divider }]} />

                {shareCardDetails.length > 0 && (
                  <View style={[s.shareCardDetailBox, { backgroundColor: cc.detailBg }]}>
                    {shareCardDetails.map((d, i) => (
                      <View key={i} style={[s.shareCardDetailRow, { borderBottomColor: cc.detailBorder }, i === shareCardDetails.length - 1 && { borderBottomWidth: 0 }]}>
                        <Text style={[s.shareCardDetailLabel, { color: cc.detailLabel }]}>{d.label}</Text>
                        <Text style={[s.shareCardDetailValue, { color: cc.detailValue }, d.highlight && { color: cc.detailHighlight }]}>{d.value}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={s.shareCardBottom}>
                  {shareCardLocked ? (
                    <Text style={[s.shareCardTagline, { color: cc.tagline }]}>{shareCardMessage}</Text>
                  ) : (
                    <>
                      <Text style={[s.shareCardTagline, { color: cc.tagline }]}>&quot;{shareTagline}&quot;</Text>
                      <Text style={[s.shareCardHashtag, { color: cc.hashtag }]}>#CornerDay</Text>
                    </>
                  )}
                </View>
              </LinearGradient>
            </View>

            <View style={s.shareCardActions}>
              {shareCardLocked && shareCardAction && (
                <Pressable
                  style={({ pressed }) => [s.shareCardShareBtn, pressed && { opacity: 0.85 }]}
                  onPress={shareCardAction.onPress}
                >
                  <Text style={s.shareCardShareTxt}>{shareCardAction.label}</Text>
                </Pressable>
              )}
              {!shareCardLocked && (
                <>
                  <Pressable
                    style={({ pressed }) => [s.shareCardShareBtn, pressed && { opacity: 0.85 }]}
                    onPress={captureAndShare}
                    disabled={capturingShare}
                  >
                    <Ionicons name="share-outline" size={20} color="#fff" />
                    <Text style={s.shareCardShareTxt}>{capturingShare ? 'Preparing…' : 'Share'}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.shareCardCommunityBtn, pressed && { opacity: 0.85 }]}
                    onPress={() => {
                      setShowShareCard(false);
                      const label = formatStreakFull(streakMs);
                      const content = shareCardBadge
                        ? `Just hit my ${shareCardBadge.label} milestone! ${shareCardBadge.emoji} ${label} free from gambling and counting. 💪`
                        : `${label} free from gambling! 💪 ${shareTagline}`;
                      router.push({ pathname: '/(tabs)/community/new-post', params: { initialContent: content, initialTag: shareCardBadge ? '#Milestone' : '#WinToday' } } as any);
                    }}
                  >
                    <Ionicons name="people-outline" size={20} color="#0F6E6E" />
                    <Text style={s.shareCardCommunityTxt}>Post to Community</Text>
                  </Pressable>
                </>
              )}
              <Pressable
                style={({ pressed }) => [s.shareCardCloseBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowShareCard(false)}
              >
                <Text style={s.shareCardCloseTxt}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Profile nudge (shown once after onboarding) ── */}
      <Modal visible={showProfileNudge} transparent animationType="fade" onRequestClose={dismissProfileNudge}>
        <Pressable style={s.confirmOverlay} onPress={dismissProfileNudge}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 32 }}>
              <PreferencesIllustration width={220} height={150} />
            </View>
            <Text style={[s.confirmTitle, { textAlign: 'center' }]}>Make CornerDay yours</Text>
            <Text style={[s.confirmMsg, { textAlign: 'center', marginTop: 8 }]}>
              Add your goal, support type and a trusted contact in the{' '}
              <Text style={{ fontWeight: '700', color: c.primary }}>Account tab</Text>
              {' '}for better recovery stats and more personalised AI conversations.
            </Text>
            <View style={{ width: '100%', marginTop: 20 }}>
              <Pressable
                style={({ pressed }) => [s.continueBtn, { marginBottom: 6 }, pressed && { opacity: 0.8 }]}
                onPress={() => { dismissProfileNudge(); router.push('/(tabs)/account'); }}>
                <Text style={s.continueBtnTxt}>Go to Account</Text>
              </Pressable>
              <View style={s.confirmDivider} />
              <Pressable
                style={({ pressed }) => [s.modalClose, { width: '100%' }, pressed && { opacity: 0.7 }]}
                onPress={dismissProfileNudge}>
                <Text style={s.modalCloseTxt}>Got it, maybe later</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Milestone celebration ── */}
      {celebrationBadge && (() => {
        const badgeDef = BADGE_DEFS.find(d => d.type === celebrationBadge.type);
        const isTimeBadge = badgeDef !== undefined && badgeDef.days > 0;
        const earnedAtTs = celebrationBadge.earnedAt;
        const dailyRate = data ? weeklyToDaily(data.weeklyBet) : 0;
        const celebrationDetails: Array<{ label: string; value: string; highlight?: boolean }> = [];
        if (isTimeBadge && badgeDef) {
          if (earnedAtTs) celebrationDetails.push({ label: 'Earned on', value: new Date(earnedAtTs).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) });
          celebrationDetails.push({ label: 'Current streak', value: formatStreakFull(streakMs) });
          if (dailyRate > 0) {
            celebrationDetails.push({ label: 'Saved at milestone', value: fmt(badgeDef.days * dailyRate, data?.currency) });
            celebrationDetails.push({ label: 'Total saved', value: fmt((streakMs / 86400000) * dailyRate, data?.currency), highlight: true });
          }
        }
        return (
        <MilestoneCelebrationModal
          badge={celebrationBadge}
          tagline={celebrationTagline}
          isTimeBadge={isTimeBadge}
          details={celebrationDetails}
          cardRef={celebrationCardRef}
          onShare={handleCelebrationShare}
          onClose={async () => {
            const badgeType = celebrationBadge?.type;
            // The "Started" badge is the very first thing a brand-new user
            // sees, often seconds after finishing onboarding — showing an ad
            // right after closing it is a discouraging first impression.
            if (badgeType !== 'started') showInterstitialIfReady(isPremium, 0.33);
            setCelebrationBadge(null);
            if (badgeType === '1_week') maybeRequestReview('7_day');
            else if (badgeType === '1_month') maybeRequestReview('1_month');
            const next = celebrationQueue.current.shift();
            if (next) setTimeout(() => setCelebrationBadge(next), 400);
          }}
        />
        );
      })()}

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
  greeting: { fontSize: 18, fontWeight: '700', color: c.white },
  quote: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic', marginTop: 4 },

  // Streak card (inside header)
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 18,
    padding: 16,
    gap: 16,
  },
  streakRight: { flex: 1, gap: 8 },
  streakTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakTitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.9 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  milestoneTxt: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  liveCounter: { fontSize: 15, fontWeight: '800', color: c.white, fontVariant: ['tabular-nums'], lineHeight: 21, marginTop: 2 },
  streakMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  longestTxt: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  personalBestTxt: { fontSize: 11, color: 'rgba(168,216,208,0.9)', fontWeight: '600' },
  startedTxt: { fontSize: 10, color: 'rgba(255,255,255,0.38)' },
  resetLink: { marginTop: 2 },
  resetLinkTxt: { fontSize: 11, color: c.textError, fontWeight: '600' },

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
  savedSetupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savedSetupTxt: { fontSize: 13, fontWeight: '600', color: c.primary },

  // Card
  card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: c.textSecondary },

  // Mood
  moodCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 12 },
  moodInnerDivider: { height: 1, backgroundColor: c.borderLight, marginHorizontal: -12, marginVertical: 18 },
  moodCardTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  moodCardTitle:     { fontSize: 12, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  moodStreakBadge:   { fontSize: 12, fontWeight: '700', color: c.primary },
  moodRow: { flexDirection: 'row', paddingHorizontal: 12 },
  moodBtn: { flex: 1, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  moodEmoji: { fontSize: 26 },
  moodDone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moodDoneRow: { flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'nowrap' },
  moodDoneLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
  moodDoneEmoji: { fontSize: 18 },
  moodDoneNote: { fontSize: 13, color: c.textBody, flex: 1 },
  moodEditBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.bgTeal },
  moodEditBtnTxt: { fontSize: 12, color: c.primary, fontWeight: '700' },
  moodDoneWrap: { gap: 6 },
  moodStreakTxt: { fontSize: 12, color: c.primary, fontWeight: '600', opacity: 0.85 },
  moodAvgTxt: { fontSize: 12, color: c.textFaint, textAlign: 'center', marginTop: 10 },
  moodBtnSelected: { backgroundColor: c.bgTeal, borderRadius: 8 },
  moodLabelTxt: { fontSize: 10, color: c.textFaint, marginTop: 2 },
  moodLabelTxtSelected: { color: c.primary, fontWeight: '600' },
  moodInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
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

  // Quick actions grid
  quickActionsCard: {
    backgroundColor: c.bgCard, borderRadius: 14,
    flexDirection: 'row', overflow: 'hidden',
  },
  quickActionBtn: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 6 },
  quickActionEmoji: { fontSize: 24 },
  quickActionLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted },
  quickActionDivider: { width: 1, backgroundColor: c.borderSubtle, marginVertical: 12 },

  // Your why anchor
  whyAnchorCard: {
    borderRadius: 18,
    overflow: 'hidden',
    paddingTop: 18,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
  },
  whyAnchorHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  whyAnchorPhoto: {
    width: 136, height: 136, borderRadius: 14,
  },
  whyAnchorPhotoEmpty: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  whyAnchorPhotoAddTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.2 },
  whyAnchorFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44 }, // unused — kept to avoid style-key errors
  whyAnchorLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.1,
  },
  whyAnchorSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  whyAnchorRow: { flexDirection: 'row', gap: 8, paddingRight: 16, alignItems: 'center' }, // unused
  whyAnchorCol: { flexDirection: 'column' },
  whyAnchorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'flex-start',
  },
  whyAnchorEmoji: { fontSize: 14 },
  whyAnchorText: { fontSize: 12, fontWeight: '600', color: '#ffffff' },

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
  relapseMinimal: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  relapseMinimalTxt: { fontSize: 13, color: c.textFaint, textDecorationLine: 'underline' },

  // Streak shield undo banner
  shieldUndoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.bgTeal, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: c.primary + '40',
  },
  shieldUndoIcon: { fontSize: 22 },
  shieldUndoBody: { flex: 1 },
  shieldUndoTitle: { fontSize: 13, fontWeight: '700', color: c.primary },
  shieldUndoSub: { fontSize: 12, color: c.textBody, marginTop: 1 },
  shieldUndoBtn: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  shieldUndoBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Urge prediction card
  urgePredCard: {
    backgroundColor: c.bgCard,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderLeftWidth: 3,
    borderLeftColor: c.warn,
  },
  urgePredEmoji: { fontSize: 22 },
  urgePredTitle: { fontSize: 12, fontWeight: '700', color: c.warn, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  urgePredTime: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
  urgePredSub: { fontSize: 12, color: c.textMuted, lineHeight: 16 },

  // Partner message banner
  partnerMsgBanner: { backgroundColor: c.bgTeal, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  partnerMsgEmoji: { fontSize: 20 },
  partnerMsgLabel: { fontSize: 11, fontWeight: '600', color: c.primary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  partnerMsgTxt: { fontSize: 14, color: c.textPrimary, fontWeight: '500', lineHeight: 20 },

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

  // Recovery calendar heatmap
  homCalCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 10 },
  homCalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  homCalTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
  homCalSub: { fontSize: 11, color: c.textFaint },
  homCalDayLabels: { flexDirection: 'row', gap: 3 },
  homCalDayLabel: { flex: 1, fontSize: 9, color: c.textFaint, textAlign: 'center', fontWeight: '600' },
  homCalGrid: { flexDirection: 'column', gap: 3 },
  homCalCol: { flexDirection: 'row', gap: 3 },
  homCalDot: { flex: 1, aspectRatio: 1, borderRadius: 3 },
  homCalLegend: { flexDirection: 'row', gap: 14, marginTop: 2 },
  homCalLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  homCalLegendDot: { width: 8, height: 8, borderRadius: 2 },
  homCalLegendTxt: { fontSize: 10, color: c.textFaint },

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
  modalProgressFill: { height: '100%', backgroundColor: c.success, borderRadius: 3 },
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

  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 24 },
  confirmSheet: {
    backgroundColor: c.bgCard, borderRadius: 24, padding: 24, width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 32,
  },
  confirmIconRow: { alignItems: 'center', marginBottom: 20 },
  confirmIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: c.bgTeal,
    alignItems: 'center', justifyContent: 'center', marginBottom: 0,
  },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 10 },
  confirmMsg: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 22 },
  confirmBody: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  continueBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', width: '100%' },
  continueBtnTxt: { color: c.white, fontSize: 15, fontWeight: '700' },
  confirmSupportBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: c.bgTeal, width: '100%' },
  confirmSupportTxt: { fontSize: 15, fontWeight: '700', color: c.primary },
  confirmDivider: { height: 1, backgroundColor: c.borderSubtle, width: '100%', marginVertical: 10 },
  confirmActions: { width: '100%', marginTop: 10 },
  confirmCancel: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: c.bgElement, width: '100%' },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  confirmReset: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: c.error, width: '100%', marginBottom: 6 },
  confirmResetTxt: { color: c.white, fontWeight: '700', fontSize: 15 },

  relapseOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 24 },

  // Relapse confirmation sheet
  relapseSheet: {
    backgroundColor: c.bgCard, borderRadius: 26, padding: 28, width: '100%',
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 32,
  },
  relapseIconCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  relapseSheetTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 10 },
  relapseSheetBody: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  relapseUrgeBtn: {
    backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', width: '100%', marginBottom: 10,
  },
  relapseUrgeBtnTxt: { color: c.white, fontWeight: '700', fontSize: 16 },
  relapseResetBtn: {
    backgroundColor: c.error, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', width: '100%', marginBottom: 6,
  },
  relapseResetBtnTxt: { fontSize: 15, fontWeight: '600', color: c.white },
  relapseSheetDivider: { height: 1, backgroundColor: c.borderSubtle, width: '100%', marginVertical: 10 },
  relapseNotNowBtn: {
    backgroundColor: c.bgElement, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', width: '100%',
  },
  relapseNotNowTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },

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

  // Share card
  shareOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  shareCardWrap: { width: 320, borderRadius: 24, overflow: 'hidden' },
  shareCard: { width: 320, padding: 28, gap: 0 },
  shareCardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 28,
  },
  shareCardBrand: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  shareCardLogoBadge: { borderRadius: 8, padding: 5 },
  shareCardBadgeEmoji: { fontSize: 26 },
  shareCardCenter: { alignItems: 'center', gap: 4 },
  shareCardNum: { fontSize: 80, fontWeight: '900', color: '#fff', lineHeight: 84 },
  shareCardUnit: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 3 },
  shareCardStreakExtra: { fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 2, textAlign: 'center' },
  shareCardSub: { fontSize: 15, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  shareCardAchievementEmoji: { fontSize: 72, lineHeight: 80 },
  shareCardAchievementLabel: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 1, textAlign: 'center', marginTop: 8 },
  shareCardPill: {
    marginTop: 12, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  shareCardPillTxt: { fontSize: 13, color: '#fff', fontWeight: '600' },
  shareCardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 24 },
  shareCardNext: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  shareCardBottom: { alignItems: 'center', gap: 6 },
  shareCardTagline: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', textAlign: 'center' },
  shareCardHashtag: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  shareCardActions: { marginTop: 20, gap: 10, width: 320 },
  shareCardShareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15,
  },
  shareCardShareTxt: { color: c.white, fontWeight: '700', fontSize: 16 },
  shareCardCommunityBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.white, borderRadius: 14, paddingVertical: 15,
  },
  shareCardCommunityTxt: { color: c.primary, fontWeight: '700', fontSize: 16 },
  shareCardCloseBtn: { alignItems: 'center', paddingVertical: 10 },
  shareCardCloseTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  shareCardProgressTrack: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 3, overflow: 'hidden', marginTop: 16,
  },
  shareCardProgressFill: {
    height: '100%', backgroundColor: c.primaryLight, borderRadius: 3,
  },
  shareCardDetailBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, marginTop: 4, marginBottom: 20, paddingVertical: 4,
  },
  shareCardDetailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  shareCardDetailLabel: { fontSize: 13, color: 'rgba(255,255,255,0.55)', flexShrink: 0, marginRight: 12 },
  shareCardDetailValue: { fontSize: 13, fontWeight: '700', color: '#fff', flex: 1, textAlign: 'right', flexWrap: 'wrap' },
});
