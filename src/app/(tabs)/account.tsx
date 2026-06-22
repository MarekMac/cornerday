import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { setHapticsEnabled as setGlobalHaptics } from '@/lib/haptics';
import { parseQuitDate } from '@/lib/parseQuitDate';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import * as LocalAuthentication from 'expo-local-authentication';
import { ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY, MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY, CHECKLIST_KEY, CHECKLIST_TOTAL, SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY, GOAL_ICONS, TRUSTED_CONTACT_KEY, MOTIVATION_CACHE_KEY, MOTIVATION_PHOTO_KEY, COMMUNITY_GUIDELINES_SEEN_KEY, NOTIF_STREAK_HOUR_KEY, NOTIF_CHECKIN_HOUR_KEY, BIOMETRIC_LOCK_KEY, HAPTICS_KEY, STREAK_SHIELD_KEY, SHIELD_UNDO_KEY, CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY, CUSTOM_MILESTONE_CELEBRATED_KEY, URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_IDS_KEY, STORE_REVIEW_ASKED_KEY, PROFILE_NUDGE_SHOWN_KEY } from '@/constants/storage-keys';
import { GAME_BESTS_STORAGE_KEY } from '@/lib/useGameBests';
import { setImagePickerActive } from '@/lib/image-picker-active';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user';
import { generateUsername } from '@/lib/usernameGenerator';
import * as Notifications from 'expo-notifications';
import {
  DEFAULT_NOTIF_PREFS,
  NotifPrefs,
  requestNotificationPermissions,
  scheduleAllNotifications,
  scheduleOnboardingCheckin,
} from '@/lib/notifications';
import { usePurchases } from '@/context/purchases';
import Purchases from 'react-native-purchases';
import { ENTITLEMENT_ID } from '@/constants/revenuecat';
import { useAppTheme } from '@/context/theme';
import type { ThemePref } from '@/context/theme';
import { AppColors } from '@/constants/theme';

const ADMIN_BADGE_COLOR = '#7c5700'; // amber — admin-only, no theme equivalent

interface Profile {
  displayName: string | null;
  email: string | null;
  quitTimestamp: string | null;
  motivation: string | null;
  trigger: string | null;
  goal: string | null;
  supportType: string | null;
  weeklyBet: string | null;
  currency: string;
  isPremium: boolean;
  avatarUrl: string | null;
  longestStreak: number;
  longestStreakMs: number;
  milestonesEarned: number;
}

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
];

const CHIP_AMOUNTS = [
  { value: '20',   label: (s: string) => `${s}20` },
  { value: '50',   label: (s: string) => `${s}50` },
  { value: '100',  label: (s: string) => `${s}100` },
  { value: '200',  label: (s: string) => `${s}200` },
  { value: '500',  label: (s: string) => `${s}500` },
  { value: '1000', label: (s: string) => `${s}1000+` },
];

type FieldKey = 'motivation' | 'trigger' | 'goal' | 'support';

const MOTIVATION_OPTIONS = [
  { value: 'family', label: 'My family', emoji: '👨‍👩‍👧' },
  { value: 'finances', label: 'My finances', emoji: '💰' },
  { value: 'mental_health', label: 'My mental health', emoji: '🧠' },
  { value: 'saving', label: 'Saving for something', emoji: '🎯' },
  { value: 'better_self', label: 'Becoming a better me', emoji: '✨' },
  { value: 'break_free', label: 'Breaking free for good', emoji: '🔓' },
];

const TRIGGER_OPTIONS = [
  { value: 'financial_pressure', label: 'Financial pressure', emoji: '💸' },
  { value: 'betting_ads', label: 'Betting ads', emoji: '📱' },
  { value: 'social_pressure', label: 'Friends or social pressure', emoji: '👥' },
  { value: 'live_sport', label: 'Watching live sport', emoji: '⚽' },
  { value: 'stress', label: 'Stress', emoji: '😰' },
  { value: 'boredom', label: 'Boredom', emoji: '😶' },
];

const GOAL_OPTIONS = [
  { value: 'break_free', label: 'Break free from gambling', emoji: '🔓' },
  { value: 'pay_back', label: 'Pay back what I lost', emoji: '💳' },
  { value: 'save', label: 'Save for something important', emoji: '🏠' },
  { value: 'mental_health', label: 'Feel better mentally', emoji: '🌱' },
  { value: 'family', label: 'Be there for my family', emoji: '❤️' },
  { value: 'one_day', label: 'One day at a time', emoji: '🌅' },
];

const SUPPORT_OPTIONS = [
  { value: 'private', label: 'Keep this private', emoji: '🔒' },
  { value: 'partner', label: 'My partner', emoji: '💑' },
  { value: 'family', label: 'A family member', emoji: '👨‍👩‍👧' },
  { value: 'friend', label: 'A friend', emoji: '👋' },
  { value: 'therapist', label: 'A therapist', emoji: '🏥' },
];

const PLAN_DISTRACTION_OPTIONS = [
  { key: 'walk',     emoji: '🚶', label: 'Go for a walk' },
  { key: 'call',     emoji: '📞', label: 'Call someone' },
  { key: 'music',    emoji: '🎵', label: 'Listen to music' },
  { key: 'drink',    emoji: '🍵', label: 'Make a hot drink' },
  { key: 'read',     emoji: '📖', label: 'Read' },
  { key: 'exercise', emoji: '🏃', label: 'Exercise' },
  { key: 'breathe',  emoji: '🧘', label: 'Meditate' },
  { key: 'journal',  emoji: '✍️', label: 'Write in journal' },
  { key: 'shower',   emoji: '🛁', label: 'Take a shower' },
  { key: 'tv',       emoji: '🍿', label: 'Watch something' },
  { key: 'game',     emoji: '🎮', label: 'Play a game' },
  { key: 'outside',  emoji: '🌿', label: 'Go outside' },
  { key: 'create',   emoji: '🎨', label: 'Create something' },
  { key: 'text',     emoji: '💬', label: 'Text a friend' },
  { key: 'puzzle',   emoji: '🧩', label: 'Do a puzzle' },
];

const FIELD_CONFIG: Record<FieldKey, {
  title: string;
  options: { value: string; label: string; emoji: string }[];
  multi: boolean;
  dbField: string;
  label: string;
}> = {
  motivation: { title: 'What motivates you to quit?', options: MOTIVATION_OPTIONS, multi: true, dbField: 'motivation', label: 'Why you quit' },
  trigger: { title: 'What is your biggest trigger?', options: TRIGGER_OPTIONS, multi: false, dbField: 'trigger', label: 'Biggest trigger' },
  goal: { title: 'What is your main goal?', options: GOAL_OPTIONS, multi: true, dbField: 'goal', label: 'Main goal' },
  support: { title: 'Who is in your corner?', options: SUPPORT_OPTIONS, multi: false, dbField: 'support_type', label: 'Support' },
};

function getDisplayLabel(options: { value: string; label: string }[], raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(',').filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map(v => options.find(o => o.value === v)?.label ?? v).join(', ');
}

function formatQuitDate(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date} @ ${time}`;
}

function formatStreakDual(ms: number): string {
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days  = Math.floor(ms / 86400000);
  const weeks = Math.floor(days / 7);
  if (weeks >= 1) { const d = days - weeks * 7; return d > 0 ? `${weeks}w ${d}d` : `${weeks}w`; }
  if (days >= 1)  { const h = hours - days * 24; return h > 0 ? `${days}d ${h}h` : `${days}d`; }
  if (hours >= 1) { const m = mins - hours * 60; return m > 0 ? `${hours}h ${m}m` : `${hours}h`; }
  if (mins >= 1) return `${mins}m`;
  return '< 1m';
}

type MilestoneType = 'days' | 'savings' | 'urges' | 'payments';
interface CustomMilestone { type: MilestoneType; target: number; icon: string }
const MILESTONE_TYPES: { type: MilestoneType; emoji: string; label: string }[] = [
  { type: 'days',     emoji: '📅', label: 'Clean days'    },
  { type: 'savings',  emoji: '💰', label: 'Amount saved'  },
  { type: 'urges',    emoji: '💪', label: 'Urges beaten'  },
  { type: 'payments', emoji: '🏦', label: 'Debt payments' },
];
const DEFAULT_MILESTONE_ICON: Record<MilestoneType, string> = {
  days: '📅', savings: '💰', urges: '💪', payments: '🏦',
};
const MILESTONE_ICONS = ['🎯','🏆','⭐','🔥','💎','🌟','🏅','🎉','💪','🌱','🌊','🦋','🥇','👑','🚀','❤️','🌈','📅','💰','🏦','✨','🙏','💯','🎖️'];
function fmtMilestone(m: CustomMilestone, currency: string): string {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency + ' ';
  switch (m.type) {
    case 'days':     return `${m.target} clean days`;
    case 'savings':  return `${s}${m.target} saved`;
    case 'urges':    return `${m.target} urges beaten`;
    case 'payments': return `${m.target} payments made`;
  }
}

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c, themePref, setThemePref } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { isPremium: isPremiumFromRC, showPaywall, restorePurchases } = usePurchases();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editDate, setEditDate] = useState<Date | null>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { setAvatarUrl: setGlobalAvatarUrl, isAdmin } = useUser();

  const [editField, setEditField] = useState<FieldKey | null>(null);
  const [editModalSelections, setEditModalSelections] = useState<string[]>([]);
  const [savingField, setSavingField] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Fingerprint or face unlock on reopen');
  const [debtTargetDate, setDebtTargetDate] = useState<Date | null>(null);
  const [savingsTargetDate, setSavingsTargetDate] = useState<Date | null>(null);
  const [showDebtTargetModal, setShowDebtTargetModal] = useState(false);
  const [showSavingsTargetModal, setShowSavingsTargetModal] = useState(false);
  const [editGoalTargetDate, setEditGoalTargetDate] = useState(() => new Date(Date.now() + 90 * 86400000));
  const [savingGoalTarget, setSavingGoalTarget] = useState(false);
  const [notifStreakHour, setNotifStreakHour] = useState(20);
  const [notifCheckinHour, setNotifCheckinHour] = useState(9);
  const [quitTimestamp, setQuitTimestamp] = useState<string | null>(null);
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  const [exportLoading, setExportLoading] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const emailCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const linkCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showSpendingModal, setShowSpendingModal] = useState(false);

  const [totalManualSavings, setTotalManualSavings] = useState(0);

  // Savings goal (AsyncStorage)
  const [savingsGoal, setSavingsGoal] = useState<number | null>(null);
  const [savingsGoalFor, setSavingsGoalFor] = useState('');
  const [savingsGoalIcon, setSavingsGoalIcon] = useState('🎯');
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [goalForInput, setGoalForInput] = useState('');
  const [goalIconInput, setGoalIconInput] = useState('🎯');
  const [spendingCurrency, setSpendingCurrency] = useState('USD');
  const [spendingChip, setSpendingChip] = useState('');
  const [spendingCustom, setSpendingCustom] = useState('');
  const [savingSpending, setSavingSpending] = useState(false);

  const [trustedContactName, setTrustedContactName] = useState('');
  const [trustedContactPhone, setTrustedContactPhone] = useState('');
  const [trustedContactEmail, setTrustedContactEmail] = useState('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactNameInput, setContactNameInput] = useState('');
  const [contactPhoneInput, setContactPhoneInput] = useState('');
  const [contactEmailInput, setContactEmailInput] = useState('');

  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);
  const [confirmQuitDate, setConfirmQuitDate] = useState<Date | null>(null);
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [revokePartnerVisible, setRevokePartnerVisible] = useState(false);
  const [resetDataModalVisible, setResetDataModalVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pendingReset, setPendingReset] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [sendingPassReset, setSendingPassReset] = useState(false);
  const [passResetSent, setPassResetSent] = useState(false);
  const [showContactsPermModal, setShowContactsPermModal] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'general'>('general');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [androidKbOffset, setAndroidKbOffset] = useState(0);
  const [thankYouVisible, setThankYouVisible] = useState(false);
  const [restoringPurchases, setRestoringPurchases] = useState(false);
  const [isPasswordUser, setIsPasswordUser] = useState(true);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [streakShieldEnabled, setStreakShieldEnabled] = useState(false);
  const [customMilestone, setCustomMilestone] = useState<CustomMilestone | null>(null);
  const [showCustomMilestoneModal, setShowCustomMilestoneModal] = useState(false);
  const [customMilestoneInput, setCustomMilestoneInput] = useState('');
  const [customMilestoneType, setCustomMilestoneType] = useState<MilestoneType>('days');
  const [customMilestoneIcon, setCustomMilestoneIcon] = useState('📅');
  const [milestoneIconPickerOpen, setMilestoneIconPickerOpen] = useState(false);

  const [partnerToken, setPartnerToken] = useState<string | null>(null);
  const [partnerLinkId, setPartnerLinkId] = useState<string | null>(null);
  const [partnerExpiresAt, setPartnerExpiresAt] = useState<string | null>(null);
  const [partnerLinkLoading, setPartnerLinkLoading] = useState(false);
  const [shareSettings, setShareSettings] = useState({ mood: true, milestones: true, recovery: true });
  const [notifySettings, setNotifySettings] = useState({ urge: false, relapse: false, milestone: false });
  const partnerSettingInFlight = useRef<Set<string>>(new Set());

  const [recoveryDistractions, setRecoveryDistractions] = useState<string[]>([]);
  const [recoveryMantra, setRecoveryMantra] = useState('');
  const [checklistCount, setChecklistCount] = useState(0);
  const [showRecoveryPlanModal, setShowRecoveryPlanModal] = useState(false);
  const [planOptionsExpanded, setPlanOptionsExpanded] = useState(false);
  const [planDistractionsInput, setPlanDistractionsInput] = useState<string[]>([]);
  const [planMantraInput, setPlanMantraInput] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const identities = user.identities ?? [];
    setIsPasswordUser(identities.some(id => id.provider === 'email'));
    const [{ data }, { data: streakData }, { data: savingsRows }] = await Promise.all([
      supabase
        .from('users')
        .select('display_name, quit_timestamp, quit_date, motivation, trigger, goal, support_type, weekly_bet, currency, is_premium, avatar_url, notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching, notif_urge_prediction, notif_community, debt_target_date, savings_target_date')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('streaks').select('longest_streak, longest_streak_ms').eq('user_id', user.id).maybeSingle(),
      supabase.from('losses').select('amount').eq('user_id', user.id).eq('type', 'saving'),
    ]);
    const quitTs = data?.quit_timestamp ?? data?.quit_date;
    const streakDays = quitTs ? Math.max(0, Date.now() - parseQuitDate(quitTs).getTime()) / 86400000 : 0;
    const MILESTONE_DAYS = [0, 1/24, 3/24, 6/24, 12/24, 1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 365, 548, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650];
    const badgeCount = MILESTONE_DAYS.filter(d => streakDays >= d).length;
    setTotalManualSavings((savingsRows ?? []).reduce((s, r) => s + Number(r.amount), 0));
    const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
    let resolvedAvatar = data?.avatar_url ?? null;
    if (!resolvedAvatar && googleAvatar) {
      const { error: avatarErr } = await supabase.from('users').update({ avatar_url: googleAvatar }).eq('id', user.id);
      if (!avatarErr) resolvedAvatar = googleAvatar;
    }

    setProfile({
      displayName: data?.display_name ?? null,
      email: user.email ?? null,
      quitTimestamp: data?.quit_timestamp ?? data?.quit_date ?? null,
      motivation: data?.motivation ?? null,
      trigger: data?.trigger ?? null,
      goal: data?.goal ?? null,
      supportType: data?.support_type ?? null,
      weeklyBet: data?.weekly_bet ?? null,
      currency: data?.currency ?? 'USD',
      isPremium: data?.is_premium ?? false,
      avatarUrl: resolvedAvatar,
      longestStreak: streakData?.longest_streak ?? 0,
      longestStreakMs: streakData?.longest_streak_ms ?? 0,
      milestonesEarned: badgeCount ?? 0,
    });
    setQuitTimestamp(data?.quit_timestamp ?? data?.quit_date ?? null);
    if (data?.debt_target_date) setDebtTargetDate(new Date(data.debt_target_date));
    if (data?.savings_target_date) setSavingsTargetDate(new Date(data.savings_target_date));

    // Trusted contact and recovery plan in a separate query so schema-cache misses never break the profile fetch
    const { data: contactData } = await supabase
      .from('users')
      .select('trusted_contact_name, trusted_contact_phone, trusted_contact_email, recovery_distractions, recovery_mantra')
      .eq('id', user.id)
      .maybeSingle();
    if (contactData?.trusted_contact_name || contactData?.trusted_contact_phone) {
      setTrustedContactName(contactData.trusted_contact_name ?? '');
      setTrustedContactPhone(contactData.trusted_contact_phone ?? '');
    }
    setTrustedContactEmail(contactData?.trusted_contact_email ?? '');
    if (contactData?.recovery_distractions) {
      setRecoveryDistractions(contactData.recovery_distractions.split(',').filter(Boolean));
    }
    setRecoveryMantra(contactData?.recovery_mantra ?? '');
    setNotifPrefs({
      notif_milestone: data?.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
      notif_daily_streak: data?.notif_daily_streak ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
      notif_daily_checkin: data?.notif_daily_checkin ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
      notif_weekly_summary: data?.notif_weekly_summary ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
      notif_milestone_approaching: data?.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
      notif_urge_prediction: data?.notif_urge_prediction ?? DEFAULT_NOTIF_PREFS.notif_urge_prediction,
      notif_community: data?.notif_community ?? DEFAULT_NOTIF_PREFS.notif_community,
    });
    setGlobalAvatarUrl(resolvedAvatar);
  }, []);

  const loadPartnerLink = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('partner_links')
      .select('id, token, expires_at, share_mood, share_milestones, share_recovery, notify_urge, notify_relapse, notify_milestone')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setPartnerToken(data.token);
      setPartnerLinkId(data.id);
      setPartnerExpiresAt(data.expires_at ?? null);
      setShareSettings({ mood: data.share_mood ?? true, milestones: data.share_milestones ?? true, recovery: data.share_recovery ?? true });
      setNotifySettings({ urge: data.notify_urge ?? false, relapse: data.notify_relapse ?? false, milestone: data.notify_milestone ?? false });
    }
  }, []);

  const updateShareSetting = async (key: 'share_mood' | 'share_milestones' | 'share_recovery', value: boolean) => {
    if (partnerSettingInFlight.current.has(key)) return;
    const shortKey = key.replace('share_', '') as 'mood' | 'milestones' | 'recovery';
    setShareSettings(prev => ({ ...prev, [shortKey]: value }));
    if (!partnerLinkId) return;
    partnerSettingInFlight.current.add(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('partner_links').update({ [key]: value }).eq('id', partnerLinkId).eq('user_id', user.id);
      if (error) {
        setShareSettings(prev => ({ ...prev, [shortKey]: !value }));
        Alert.alert('Could not save setting', error.message);
      }
    } finally {
      partnerSettingInFlight.current.delete(key);
    }
  };

  const updateNotifySetting = async (key: 'notify_urge' | 'notify_relapse' | 'notify_milestone', value: boolean) => {
    if (partnerSettingInFlight.current.has(key)) return;
    const shortKey = key.replace('notify_', '') as 'urge' | 'relapse' | 'milestone';
    setNotifySettings(prev => ({ ...prev, [shortKey]: value }));
    if (!partnerLinkId) return;
    partnerSettingInFlight.current.add(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('partner_links').update({ [key]: value }).eq('id', partnerLinkId).eq('user_id', user.id);
      if (error) {
        setNotifySettings(prev => ({ ...prev, [shortKey]: !value }));
        Alert.alert('Could not save setting', error.message);
      }
    } finally {
      partnerSettingInFlight.current.delete(key);
    }
  };

  const generateAndShare = async () => {
    setPartnerLinkLoading(true);
    let token = partnerToken;
    try {
      if (!token) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('partner_links')
            .insert({
              user_id: user.id,
              share_mood: shareSettings.mood,
              share_milestones: shareSettings.milestones,
              share_recovery: shareSettings.recovery,
              notify_urge: notifySettings.urge,
              notify_relapse: notifySettings.relapse,
              notify_milestone: notifySettings.milestone,
            })
            .select('id, token, expires_at')
            .maybeSingle();
          if (error) {
            Alert.alert('Could not generate link', error.message);
          } else if (data) {
            // Delete any previous links only after the new one is confirmed
            await supabase.from('partner_links').delete().eq('user_id', user.id).neq('id', data.id);
            setPartnerToken(data.token);
            setPartnerLinkId(data.id);
            setPartnerExpiresAt(data.expires_at ?? null);
            token = data.token;
          }
        }
      }
    } finally {
      setPartnerLinkLoading(false);
    }
    if (token) {
      const url = `https://cornerday.app/partner.html?t=${token}`;
      await Share.share({ message: url, url }).catch(() => {});
    }
  };

  const revokePartnerLink = () => setRevokePartnerVisible(true);

  const executeRevokePartnerLink = async () => {
    setRevokePartnerVisible(false);
    setPartnerLinkLoading(true);
    try {
      if (partnerLinkId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase.from('partner_links').delete().eq('id', partnerLinkId).eq('user_id', user.id);
        if (error) { Alert.alert('Could not revoke link', error.message); return; }
        setPartnerToken(null);
        setPartnerLinkId(null);
        setPartnerExpiresAt(null);
        setShareSettings({ mood: true, milestones: true, recovery: true });
        setNotifySettings({ urge: false, relapse: false, milestone: false });
      }
    } finally {
      setPartnerLinkLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      AsyncStorage.getItem(BIOMETRIC_LOCK_KEY),
    ]).then(([hasHardware, isEnrolled, types, stored]) => {
      setBiometricAvailable(hasHardware && isEnrolled);
      setBiometricEnabled(stored === 'true');
      const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
      if (hasFace && !hasFingerprint) setBiometricLabel('Face unlock on reopen');
      else if (hasFingerprint && !hasFace) setBiometricLabel('Fingerprint unlock on reopen');
      else setBiometricLabel('Biometric unlock on reopen');
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setAndroidKbOffset(e.endCoordinates.height));
    const hide  = Keyboard.addListener('keyboardDidHide', () => setAndroidKbOffset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
    loadPartnerLink();
    Promise.all([
      AsyncStorage.getItem(SAVINGS_GOAL_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
      AsyncStorage.getItem(TRUSTED_CONTACT_KEY),
      AsyncStorage.getItem(NOTIF_STREAK_HOUR_KEY),
      AsyncStorage.getItem(NOTIF_CHECKIN_HOUR_KEY),
      AsyncStorage.getItem(HAPTICS_KEY),
      AsyncStorage.getItem(STREAK_SHIELD_KEY),
      AsyncStorage.getItem(CUSTOM_MILESTONE_KEY),
      AsyncStorage.getItem(CHECKLIST_KEY),
    ]).then(([rawGoal, rawFor, rawIcon, rawContact, rawStreakHour, rawCheckinHour, rawHaptics, rawShield, rawMilestone, rawChecklist]) => {
      if (rawGoal) { const n = Number(rawGoal); if (!isNaN(n)) setSavingsGoal(n); }
      if (rawFor) setSavingsGoalFor(rawFor);
      if (rawIcon) setSavingsGoalIcon(rawIcon);
      if (rawContact) {
        try {
          const contact = JSON.parse(rawContact);
          setTrustedContactName(contact.name ?? '');
          setTrustedContactPhone(contact.phone ?? '');
        } catch { /* corrupted storage — ignore */ }
      }
      if (rawStreakHour) { const n = Number(rawStreakHour); if (!isNaN(n)) setNotifStreakHour(n); }
      if (rawCheckinHour) { const n = Number(rawCheckinHour); if (!isNaN(n)) setNotifCheckinHour(n); }
      if (rawHaptics !== null) { const v = rawHaptics !== 'false'; setHapticsEnabled(v); setGlobalHaptics(v); }
      setStreakShieldEnabled(rawShield === 'true');
      if (rawMilestone) {
        try {
          const parsed = JSON.parse(rawMilestone) as CustomMilestone;
          if (parsed.type && parsed.target > 0) setCustomMilestone({ icon: DEFAULT_MILESTONE_ICON[parsed.type as MilestoneType] ?? '🎯', ...parsed });
        } catch {
          const n = Number(rawMilestone);
          if (!isNaN(n) && n > 0) setCustomMilestone({ type: 'days', target: n, icon: '📅' });
        }
      }
      try {
        const cl: Record<string, boolean> = rawChecklist ? JSON.parse(rawChecklist) : {};
        setChecklistCount(Object.values(cl).filter(Boolean).length);
      } catch { /* corrupted — leave at 0 */ }
    });
    return () => {
      if (emailCopyTimerRef.current) clearTimeout(emailCopyTimerRef.current);
      if (linkCopyTimerRef.current) clearTimeout(linkCopyTimerRef.current);
    };
  }, [fetchProfile, loadPartnerLink]);

  useEffect(() => {
    if (!isPremiumFromRC) { setRenewalDate(null); return; }
    Purchases.getCustomerInfo().then(info => {
      const entitlement = info.entitlements.active[ENTITLEMENT_ID];
      if (entitlement?.expirationDate) {
        const d = new Date(entitlement.expirationDate);
        setRenewalDate(d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }));
      }
    }).catch(() => {});
  }, [isPremiumFromRC]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(CHECKLIST_KEY).then(raw => {
      try {
        const cl: Record<string, boolean> = raw ? JSON.parse(raw) : {};
        setChecklistCount(Object.values(cl).filter(Boolean).length);
      } catch { /* corrupted — leave unchanged */ }
    });
  }, []));

  const savePlan = async () => {
    setSavingPlan(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const distractionsVal = planDistractionsInput.join(',') || null;
        const mantraVal = planMantraInput.trim() || null;
        const { error } = await supabase.from('users').update({
          recovery_distractions: distractionsVal,
          recovery_mantra: mantraVal,
        }).eq('id', user.id);
        if (error) { Alert.alert('Could not save', error.message); return; }
        setRecoveryDistractions(planDistractionsInput);
        setRecoveryMantra(planMantraInput.trim());
      }
      setShowRecoveryPlanModal(false);
    } finally {
      setSavingPlan(false);
    }
  };

  const clearPlan = async () => {
    setSavingPlan(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('users').update({ recovery_distractions: null, recovery_mantra: null }).eq('id', user.id);
        if (error) { Alert.alert('Could not clear plan', error.message); return; }
        setRecoveryDistractions([]);
        setRecoveryMantra('');
      }
      setShowRecoveryPlanModal(false);
    } finally {
      setSavingPlan(false);
    }
  };

  const saveGoalTargetDate = async (kind: 'debt' | 'savings', date: Date) => {
    setSavingGoalTarget(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const col = kind === 'debt' ? 'debt_target_date' : 'savings_target_date';
        const { error } = await supabase.from('users').update({ [col]: date.toISOString().split('T')[0] }).eq('id', user.id);
        if (error) { Alert.alert('Could not save date', error.message); return; }
        if (kind === 'debt') { setDebtTargetDate(date); setShowDebtTargetModal(false); }
        else { setSavingsTargetDate(date); setShowSavingsTargetModal(false); }
      }
    } finally {
      setSavingGoalTarget(false);
    }
  };

  const openGoalTargetPicker = (kind: 'debt' | 'savings') => {
    const current = kind === 'debt' ? debtTargetDate : savingsTargetDate;
    const initial = current ?? new Date(Date.now() + 90 * 86400000);
    setEditGoalTargetDate(initial);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_, date) => { if (date) saveGoalTargetDate(kind, date); },
      });
    } else {
      if (kind === 'debt') setShowDebtTargetModal(true);
      else setShowSavingsTargetModal(true);
    }
  };

  const openGoalModal = () => {
    setGoalInput(savingsGoal ? String(savingsGoal) : '');
    setGoalForInput(savingsGoalFor);
    setGoalIconInput(savingsGoalIcon);
    setShowGoalModal(true);
  };
  const closeGoalModal = () => {
    if (Platform.OS === 'android') setAndroidKbOffset(0);
    setShowGoalModal(false);
    setGoalInput(''); setGoalForInput(''); setGoalIconInput('🎯');
  };
  const logGoalEvent = async (type: string, amount: number | null, note: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && amount !== null) {
      await supabase.from('losses').insert({ user_id: user.id, type, amount, category: 'Goal', note });
    }
  };

  const saveGoal = async () => {
    const val = parseFloat(goalInput);
    if (goalInput && (isNaN(val) || !isFinite(val) || val <= 0 || val > 999_999_999)) {
      Alert.alert('Invalid amount', 'Please enter a valid amount between 0 and 999,999,999.');
      return;
    }
    if (!goalInput) {
      await AsyncStorage.multiRemove([SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY]);
      await logGoalEvent('goal_deleted', savingsGoal, savingsGoalFor || null);
      setSavingsGoal(null); setSavingsGoalFor(''); setSavingsGoalIcon('🎯');
    } else {
      const forVal = goalForInput.trim();
      const iconVal = goalIconInput || '🎯';
      await AsyncStorage.setItem(SAVINGS_GOAL_KEY, String(val));
      await AsyncStorage.setItem(SAVINGS_GOAL_ICON_KEY, iconVal);
      if (forVal) await AsyncStorage.setItem(SAVINGS_GOAL_FOR_KEY, forVal);
      else await AsyncStorage.removeItem(SAVINGS_GOAL_FOR_KEY);
      const eventType = savingsGoal ? 'goal_updated' : 'goal_set';
      await logGoalEvent(eventType, val, forVal || null);
      setSavingsGoal(val); setSavingsGoalFor(forVal); setSavingsGoalIcon(iconVal);
    }
    closeGoalModal();
  };

  const openContactModal = () => {
    setContactNameInput(trustedContactName);
    setContactPhoneInput(trustedContactPhone);
    setContactEmailInput(trustedContactEmail);
    setShowContactModal(true);
  };

  const pickFromContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setShowContactsPermModal(true);
      return;
    }
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return;
    const name = contact.name ?? '';
    const phone = contact.phoneNumbers?.[0]?.number ?? '';
    setContactNameInput(name);
    setContactPhoneInput(phone);
  };
  const saveContact = async () => {
    const name = contactNameInput.trim();
    const phone = contactPhoneInput.trim();
    const email = contactEmailInput.trim().toLowerCase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: dbErr } = await supabase.from('users').update({
        trusted_contact_name: name || null,
        trusted_contact_phone: phone || null,
        trusted_contact_email: email || null,
      }).eq('id', user.id);
      if (dbErr) { Alert.alert('Could not save contact', 'Please try again.'); return; }
    }
    if (!name && !phone) {
      await AsyncStorage.removeItem(TRUSTED_CONTACT_KEY);
      setTrustedContactName('');
      setTrustedContactPhone('');
    } else {
      await AsyncStorage.setItem(TRUSTED_CONTACT_KEY, JSON.stringify({ name, phone, email }));
      setTrustedContactName(name);
      setTrustedContactPhone(phone);
    }
    setTrustedContactEmail(email);
    setShowContactModal(false);
  };

  const openFieldModal = (field: FieldKey) => {
    const config = FIELD_CONFIG[field];
    const rawValue = field === 'motivation' ? profile?.motivation
      : field === 'trigger' ? profile?.trigger
      : field === 'goal' ? profile?.goal
      : profile?.supportType;
    if (config.multi) {
      setEditModalSelections(rawValue ? rawValue.split(',').filter(Boolean) : []);
    } else {
      setEditModalSelections(rawValue ? [rawValue] : []);
    }
    setEditField(field);
  };

  const saveFieldModal = async () => {
    if (!editField) return;
    const config = FIELD_CONFIG[editField];
    setSavingField(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const value = config.multi ? editModalSelections.join(',') : (editModalSelections[0] ?? '');
        const { error } = await supabase.from('users').update({ [config.dbField]: value }).eq('id', user.id);
        if (error) { Alert.alert('Could not save', error.message); return; }
        setProfile(prev => {
          if (!prev) return prev;
          if (editField === 'motivation') return { ...prev, motivation: value };
          if (editField === 'trigger') return { ...prev, trigger: value };
          if (editField === 'goal') return { ...prev, goal: value };
          return { ...prev, supportType: value };
        });
      }
      setEditField(null);
    } finally {
      setSavingField(false);
    }
  };

  const openSpendingModal = () => {
    setSpendingCurrency(profile?.currency ?? 'USD');
    const wb = profile?.weeklyBet ?? '';
    const isChip = CHIP_AMOUNTS.some(c => c.value === wb);
    setSpendingChip(isChip ? wb : '');
    setSpendingCustom(isChip || !wb ? '' : wb);
    setShowSpendingModal(true);
  };

  const saveSpending = async () => {
    const raw = spendingCustom.trim();
    if (raw) {
      const parsed = parseFloat(raw);
      if (isNaN(parsed) || parsed <= 0 || parsed > 999_999_999) {
        Alert.alert('Invalid amount', 'Please enter a valid amount between 0 and 999,999,999.');
        return;
      }
    }
    const value = raw || spendingChip || null;
    setSavingSpending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('users').update({ weekly_bet: value, currency: spendingCurrency }).eq('id', user.id);
        if (error) { Alert.alert('Could not save', error.message); return; }
        setProfile(prev => prev ? { ...prev, weeklyBet: value, currency: spendingCurrency } : prev);
      }
      setShowSpendingModal(false);
    } finally {
      setSavingSpending(false);
    }
  };

  const handleAvatarPress = () => {
    if (profile?.avatarUrl) {
      setAvatarMenuVisible(true);
    } else {
      pickAvatar();
    }
  };

  const pickAvatar = async () => {
    setImagePickerActive(true);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setTimeout(() => setImagePickerActive(false), 500);
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      exif: false,
    });
    if (result.canceled) { setTimeout(() => setImagePickerActive(false), 500); return; }

    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const uri = result.assets[0].uri;
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const path = `${user.id}-${Date.now()}.${ext}`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, { contentType: mimeType });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const oldUrl = profile?.avatarUrl;
      if (oldUrl) {
        const oldPath = oldUrl.split('/avatars/')[1]?.split('?')[0];
        if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
      }

      const { error: dbError } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (dbError) throw dbError;
      setProfile(prev => prev ? { ...prev, avatarUrl: publicUrl } : prev);
      setGlobalAvatarUrl(publicUrl);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.toLowerCase().includes('maximum allowed size') || msg.toLowerCase().includes('too large') || msg.toLowerCase().includes('exceeded')) {
        Alert.alert(
          'Photo too large',
          'This image is too big to upload. Please choose a smaller photo or crop it more tightly.',
          [
            { text: 'Try another photo', onPress: pickAvatar },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
      }
    } finally {
      setTimeout(() => setImagePickerActive(false), 500);
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const oldUrl = profile?.avatarUrl;
      if (oldUrl) {
        const oldPath = oldUrl.split('/avatars/')[1]?.split('?')[0];
        if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
      }
      await supabase.from('users').update({ avatar_url: null }).eq('id', user.id);
      setProfile(prev => prev ? { ...prev, avatarUrl: null } : prev);
      setGlobalAvatarUrl(null);
    } catch (err) {
      Alert.alert('Error', 'Could not remove photo. Please try again.');
    }
    setUploadingAvatar(false);
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('users').update({ display_name: trimmed }).eq('id', user.id);
        if (error) { Alert.alert('Could not save name', error.message); return; }
        setProfile(prev => prev ? { ...prev, displayName: trimmed } : prev);
      }
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const openEdit = () => {
    const parsed = profile?.quitTimestamp ? new Date(profile.quitTimestamp) : null;
    const current = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
    setEditDate(current);

    if (Platform.OS === 'ios') {
      setShowIOSModal(true);
      return;
    }

    // Android: imperative two-step date → time
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (_evt: any, rawDate?: Date) => {
        if (!rawDate) return;
        const selectedDate = new Date(rawDate.getTime());
        if (isNaN(selectedDate.getTime())) return;
        const now = new Date();
        const isToday = selectedDate.toDateString() === now.toDateString();
        const timePickerSeed = isToday ? now : selectedDate;
        setTimeout(() => DateTimePickerAndroid.open({
          value: timePickerSeed,
          mode: 'time',
          is24Hour: true,
          onChange: (_tevt: any, rawTime?: Date) => {
            if (!rawTime) return;
            const selectedTime = new Date(rawTime.getTime());
            if (isNaN(selectedTime.getTime())) return;
            const merged = new Date(selectedDate.getTime());
            merged.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            setConfirmQuitDate(merged > now ? now : merged);
            },
          }), 500);
      },
    });
  };

  const saveQuitDate = async (date: Date) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const now = new Date();
        const clamped = date > now ? now : date;
        const iso = clamped.toISOString();
        const dateOnly = iso.split('T')[0];
        const { error } = await supabase.rpc('reset_streak', {
          p_user_id: user.id,
          p_quit_date: dateOnly,
          p_quit_timestamp: iso,
        });
        if (error) { Alert.alert('Could not save date', error.message); return; }
        await AsyncStorage.multiRemove([MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY, CUSTOM_MILESTONE_CELEBRATED_KEY, URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY]);
        await supabase.from('losses').insert({
          user_id: user.id, type: 'quit_date_changed', amount: 0,
          category: 'Account', note: iso,
        });
        setProfile(prev => prev ? { ...prev, quitTimestamp: iso } : prev);
        setQuitTimestamp(iso);
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleAllNotifications(notifPrefs, iso, []);
          await scheduleOnboardingCheckin();
        }
      }
    } finally {
      setSaving(false);
    }
  };


  const resetJournal = async () => {
    setResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await Promise.all([
          supabase.from('urge_journal').delete().eq('user_id', user.id),
          supabase.from('mood_checkins').delete().eq('user_id', user.id),
          AsyncStorage.removeItem(CHECKLIST_KEY),
          AsyncStorage.removeItem(CHECKLIST_BADGE_SENT_KEY),
        ]);
      }
    } finally {
      setResetting(false);
    }
  };

  const resetMilestones = async () => {
    setResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('badges').delete().eq('user_id', user.id);
      await Promise.all([
        AsyncStorage.removeItem(MILESTONE_NOTIFS_KEY),
        AsyncStorage.removeItem(CHECKLIST_BADGE_SENT_KEY),
        AsyncStorage.removeItem(GOAL_SET_BADGE_SENT_KEY),
        AsyncStorage.removeItem(GOAL_REACHED_BADGE_SENT_KEY),
        AsyncStorage.removeItem(CHECKLIST_KEY),
        AsyncStorage.removeItem(CUSTOM_MILESTONE_KEY),
        AsyncStorage.removeItem(CUSTOM_MILESTONE_NOTIF_ID_KEY),
        AsyncStorage.removeItem(CUSTOM_MILESTONE_CELEBRATED_KEY),
        AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY),
        AsyncStorage.removeItem(URGE_PREDICTION_NOTIF_ID_KEY),
      ]);
      setCustomMilestone(null);
      setChecklistCount(0);
      await scheduleAllNotifications(notifPrefs, quitTimestamp, []);
      await scheduleOnboardingCheckin();
    } finally {
      setResetting(false);
    }
  };

  const resetLossTracker = async () => {
    setResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await Promise.all([
          supabase.from('losses').delete().eq('user_id', user.id),
          supabase.from('debts').delete().eq('user_id', user.id),
          supabase.from('debt_payments').delete().eq('user_id', user.id),
        ]);
      }
    } finally {
      setResetting(false);
    }
  };

  const resetGameScores = async () => {
    setResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('game_scores').delete().eq('user_id', user.id);
      await AsyncStorage.removeItem(GAME_BESTS_STORAGE_KEY);
    } finally {
      setResetting(false);
    }
  };

  const resetEverything = async () => {
    setResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const today = new Date().toISOString().split('T')[0];
        const nowIso = new Date().toISOString();
        const { error: rpcError } = await supabase.rpc('reset_everything', {
          p_user_id: user.id,
          p_quit_date: today,
          p_quit_timestamp: nowIso,
        });
        if (rpcError) { Alert.alert('Reset failed', rpcError.message); return; }
        await AsyncStorage.multiRemove([
          MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY,
          GOAL_REACHED_BADGE_SENT_KEY, CHECKLIST_KEY,
          CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY, CUSTOM_MILESTONE_CELEBRATED_KEY,
          URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY,
          SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY, GAME_BESTS_STORAGE_KEY,
          STREAK_SHIELD_KEY, SHIELD_UNDO_KEY,
        ]);
        // Seed journal with a fresh start entry
        await supabase.from('losses').insert({
          user_id: user.id, type: 'journey_started', amount: 0, note: null, created_at: nowIso,
        });
        setQuitTimestamp(nowIso);
        setCustomMilestone(null);
        setRecoveryDistractions([]);
        setRecoveryMantra('');
        setChecklistCount(0);
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleAllNotifications(notifPrefs, nowIso, []);
          await scheduleOnboardingCheckin();
          // Fire a confirmation notification in 5 seconds so the user knows scheduling works
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '🌱 Journey restarted',
              body: 'Your streak is reset. Milestone notifications are set — your 1-hour milestone is on its way.',
              data: { screen: '/(tabs)/' },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false } as any,
          });
        }
      }
      setSavingsGoal(null);
      setSavingsGoalFor('');
      setSavingsGoalIcon('🎯');
      setProfile(prev => prev ? { ...prev, weeklyBet: null } : prev);
    } finally {
      setResetting(false);
    }
  };

  const confirmReset = (title: string, body: string, onConfirm: () => void) => {
    setPendingReset({ title, body, onConfirm });
  };

  const confirmDeleteAccount = () => setDeleteAccountVisible(true);

  const executeDeleteAccount = async () => {
    setSigningOut(true);
    try {
      const { error: deleteErr } = await supabase.functions.invoke('delete-account');
      if (deleteErr) {
        Alert.alert('Could not delete account', 'Please try again or contact support.');
        return;
      }
      if (profile?.avatarUrl) {
        const oldPath = profile.avatarUrl.split('/avatars/')[1]?.split('?')[0];
        if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
      }
      await AsyncStorage.multiRemove([
        ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY,
        MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY,
        TRUSTED_CONTACT_KEY, MOTIVATION_CACHE_KEY, MOTIVATION_PHOTO_KEY,
        COMMUNITY_GUIDELINES_SEEN_KEY, NOTIF_STREAK_HOUR_KEY, NOTIF_CHECKIN_HOUR_KEY,
        STORE_REVIEW_ASKED_KEY, PROFILE_NUDGE_SHOWN_KEY,
        STREAK_SHIELD_KEY, SHIELD_UNDO_KEY,
        CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY, CUSTOM_MILESTONE_CELEBRATED_KEY,
        URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_IDS_KEY,
        CHECKLIST_KEY, SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY, GAME_BESTS_STORAGE_KEY,
      ]);
      try { await FileSystem.deleteAsync(FileSystem.documentDirectory + 'motivation_photo.jpg', { idempotent: true }); } catch (_e) {}
      try { await supabase.auth.signOut(); } catch (_e) {}
    } finally {
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => setSignOutVisible(true);

  // NOTE: PROFILE_NUDGE_SHOWN_KEY is intentionally NOT in executeSignOut —
  // it persists across sign-out so the nudge doesn't repeat for returning users.

  const executeSignOut = async () => {
    setSigningOut(true);
    try {
      await AsyncStorage.multiRemove([
        ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY,
        MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY,
        TRUSTED_CONTACT_KEY, MOTIVATION_CACHE_KEY, MOTIVATION_PHOTO_KEY,
        COMMUNITY_GUIDELINES_SEEN_KEY, NOTIF_STREAK_HOUR_KEY, NOTIF_CHECKIN_HOUR_KEY,
        STORE_REVIEW_ASKED_KEY,
        STREAK_SHIELD_KEY, SHIELD_UNDO_KEY,
        CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY, CUSTOM_MILESTONE_CELEBRATED_KEY,
        URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_IDS_KEY,
        CHECKLIST_KEY, SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY, GAME_BESTS_STORAGE_KEY,
      ]);
      try { await FileSystem.deleteAsync(FileSystem.documentDirectory + 'motivation_photo.jpg', { idempotent: true }); } catch (_e) {}
      try { await supabase.auth.signOut(); } catch (_e) {}
    } finally {
      setSigningOut(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, lossesRes, moodRes, streakRes, badgesRes] = await Promise.all([
        supabase.from('users').select('display_name, quit_timestamp, motivation, goal, trigger, support_type, weekly_bet, currency').eq('id', user.id).maybeSingle(),
        supabase.from('losses').select('type, amount, category, note, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('mood_checkins').select('mood, note, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('streaks').select('current_streak, longest_streak, streak_start_date').eq('user_id', user.id).maybeSingle(),
        supabase.from('badges').select('badge_type, earned_at').eq('user_id', user.id),
      ]);

      const fmt = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
      const moodWord = (m: number) => (['', 'Struggling', 'Low', 'Okay', 'Good', 'Great'] as const)[m] ?? '';
      const BADGE_LABELS: Record<string, string> = {
        '1_day': '1 Day', '1_week': '1 Week', '1_month': '1 Month',
        '60_days': '60 Days', '6_months': '6 Months', '1_year': '1 Year',
      };
      const sep = '─'.repeat(42);
      const p = profileRes.data as any;
      const st = streakRes.data as any;
      const losses = (lossesRes.data ?? []) as any[];
      const moods = (moodRes.data ?? []) as any[];
      const earned = (badgesRes.data ?? []) as any[];
      const sym = CURRENCIES.find(c => c.code === (p?.currency ?? 'USD'))?.symbol ?? '$';
      const totalLost = losses.filter(l => l.type === 'loss').reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
      const totalPaid = losses.filter(l => l.type === 'payment').reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
      const owed = Math.max(0, totalLost - totalPaid);

      const lines: string[] = [
        'CornerDay — Recovery Report',
        `Generated: ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
        `Account:   ${user.email ?? '—'}`,
        '',
        sep,
        'STREAK',
        sep,
        `Started:        ${p?.quit_timestamp ? fmt(p.quit_timestamp) : '—'}`,
        `Current streak: ${p?.quit_timestamp ? formatStreakDual(Math.max(0, Date.now() - new Date(p.quit_timestamp).getTime())) : '< 1m'}`,
        `Longest streak: ${(st?.longest_streak ?? 0) >= 1 ? formatStreakDual((st.longest_streak) * 86400000) : '< 1m'}`,
        '',
      ];

      if (earned.length > 0) {
        lines.push(sep, 'MILESTONES EARNED', sep);
        const sorted = [...earned].sort((a: any, z: any) => a.earned_at < z.earned_at ? -1 : 1);
        for (const b of sorted) {
          lines.push(`  ✓  ${(BADGE_LABELS[b.badge_type] ?? b.badge_type).padEnd(12)}  ${fmt(b.earned_at)}`);
        }
        lines.push('');
      }

      const trackedLosses = losses.filter(l => l.type === 'loss' || l.type === 'payment');
      if (trackedLosses.length > 0) {
        lines.push(sep, 'FINANCIAL TRACKER', sep);
        lines.push(`Total lost:      ${sym}${totalLost.toLocaleString()}`);
        lines.push(`Total paid back: ${sym}${totalPaid.toLocaleString()}`);
        lines.push(`Still owed:      ${sym}${owed.toLocaleString()}`);
        if (totalLost > 0) {
          lines.push(`Recovery:        ${Math.round((totalPaid / totalLost) * 100)}%`);
        }
        lines.push('', 'Transactions (oldest first):');
        for (const l of trackedLosses) {
          const sign = l.type === 'loss' ? '-' : '+';
          const note = l.note ? `  (${l.note})` : '';
          lines.push(`  ${fmt(l.created_at)}  ${sign}${sym}${Number(l.amount).toLocaleString()}  ${l.category ?? ''}${note}`);
        }
        lines.push('');
      }

      if (moods.length > 0) {
        lines.push(sep, 'MOOD CHECK-INS', sep);
        const avg = moods.reduce((s: number, m: any) => s + Number(m.mood ?? 0), 0) / moods.length;
        lines.push(`Total logged:  ${moods.length} check-ins`);
        lines.push(`Average mood:  ${avg.toFixed(1)} / 5`);
        lines.push('', 'Recent entries (last 20):');
        for (const m of moods.slice(-20)) {
          const note = m.note ? `  — ${m.note}` : '';
          lines.push(`  ${fmt(m.created_at)}  ${moodWord(m.mood)} (${m.mood}/5)${note}`);
        }
        lines.push('');
      }

      lines.push(sep);
      lines.push('"The day you turn it around starts today."');
      lines.push(sep);

      const filename = `cornerday-report-${new Date().toISOString().slice(0, 10)}.txt`;
      const path = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, lines.join('\n'), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'Save your CornerDay report' });
    } finally {
      setExportLoading(false);
    }
  };

  const handleChangePassword = () => { setPassResetSent(false); setShowPassModal(true); };

  const sendPasswordReset = async () => {
    const email = profile?.email;
    if (!email) return;
    setSendingPassReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'cornerday://reset-password',
      });
      if (error) {
        Alert.alert('Error', 'Could not send reset email. Please try again.');
      } else {
        setPassResetSent(true);
      }
    } finally {
      setSendingPassReset(false);
    }
  };

  const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (hapticsEnabled) Haptics.impactAsync(style).catch(() => {});
  };

  const handleHapticsToggle = async (value: boolean) => {
    setHapticsEnabled(value);
    setGlobalHaptics(value);
    await AsyncStorage.setItem(HAPTICS_KEY, String(value));
    if (value) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const saveCurrency = async (code: string) => {
    setShowCurrencyModal(false);
    if (code === profile?.currency) return;
    setProfile(prev => prev ? { ...prev, currency: code } : prev);
    haptic();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('users').update({ currency: code }).eq('id', user.id);
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      if (!biometricAvailable) {
        Alert.alert('Not available', 'Set up fingerprint or face unlock in your device settings first.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm to enable biometric lock',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!result.success) return;
      await AsyncStorage.setItem(BIOMETRIC_LOCK_KEY, 'true');
      setBiometricEnabled(true);
    } else {
      await AsyncStorage.removeItem(BIOMETRIC_LOCK_KEY);
      setBiometricEnabled(false);
    }
  };

  const handleShieldToggle = async (value: boolean) => {
    setStreakShieldEnabled(value);
    if (value) await AsyncStorage.setItem(STREAK_SHIELD_KEY, 'true');
    else await AsyncStorage.removeItem(STREAK_SHIELD_KEY);
  };

  const openCustomMilestoneModal = () => {
    const type = customMilestone?.type ?? 'days';
    setCustomMilestoneType(type);
    setCustomMilestoneIcon(customMilestone?.icon ?? DEFAULT_MILESTONE_ICON[type]);
    setCustomMilestoneInput(customMilestone ? String(customMilestone.target) : '');
    setMilestoneIconPickerOpen(false);
    setShowCustomMilestoneModal(true);
  };

  const saveCustomMilestone = async () => {
    const target = parseInt(customMilestoneInput.trim(), 10);
    const maxes: Record<MilestoneType, number> = { days: 3650, savings: 999999, urges: 9999, payments: 9999 };
    if (isNaN(target) || target <= 0 || target > maxes[customMilestoneType]) {
      Alert.alert('Invalid value', `Enter a number between 1 and ${maxes[customMilestoneType].toLocaleString()}.`);
      return;
    }
    const milestone: CustomMilestone = { type: customMilestoneType, target, icon: customMilestoneIcon };
    await AsyncStorage.setItem(CUSTOM_MILESTONE_KEY, JSON.stringify(milestone));
    setCustomMilestone(milestone);
    // Schedule push notification only for days type (others are event-driven)
    if (customMilestoneType === 'days' && quitTimestamp) {
      const targetTime = new Date(new Date(quitTimestamp).getTime() + target * 86400000);
      if (targetTime > new Date()) {
        const existingId = await AsyncStorage.getItem(CUSTOM_MILESTONE_NOTIF_ID_KEY);
        if (existingId) await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
        try {
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'granted' && notifPrefs.notif_milestone) {
            const id = await Notifications.scheduleNotificationAsync({
              content: {
                title: `🎯 ${target} Days Clean!`,
                body: `You hit your personal ${target}-day milestone. This is a huge achievement. Keep going! 🏆`,
                data: { type: 'custom_milestone' },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: targetTime },
            });
            await AsyncStorage.setItem(CUSTOM_MILESTONE_NOTIF_ID_KEY, id);
          }
        } catch { /* best-effort */ }
      }
    } else {
      // Cancel any existing days-type notification
      const existingId = await AsyncStorage.getItem(CUSTOM_MILESTONE_NOTIF_ID_KEY);
      if (existingId) { await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {}); await AsyncStorage.removeItem(CUSTOM_MILESTONE_NOTIF_ID_KEY); }
    }
    setShowCustomMilestoneModal(false);
  };

  const removeCustomMilestone = async () => {
    const existingId = await AsyncStorage.getItem(CUSTOM_MILESTONE_NOTIF_ID_KEY);
    if (existingId) await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
    await AsyncStorage.multiRemove([CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY]);
    setCustomMilestone(null);
    setShowCustomMilestoneModal(false);
  };

  const handleNotifToggle = async (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ [key]: value }).eq('id', user.id);
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleAllNotifications(updated, quitTimestamp, [], { streakHour: notifStreakHour, checkinHour: notifCheckinHour });
        await scheduleOnboardingCheckin();
      }
      if (key === 'notif_milestone' && !value) {
        const existingId = await AsyncStorage.getItem(CUSTOM_MILESTONE_NOTIF_ID_KEY);
        if (existingId) {
          await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
          await AsyncStorage.removeItem(CUSTOM_MILESTONE_NOTIF_ID_KEY);
        }
      }
    }
  };

  const handleNotifHour = async (type: 'streak' | 'checkin', hour: number) => {
    if (type === 'streak') {
      setNotifStreakHour(hour);
      await AsyncStorage.setItem(NOTIF_STREAK_HOUR_KEY, String(hour));
    } else {
      setNotifCheckinHour(hour);
      await AsyncStorage.setItem(NOTIF_CHECKIN_HOUR_KEY, String(hour));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const granted = await requestNotificationPermissions();
      const hours = type === 'streak'
        ? { streakHour: hour, checkinHour: notifCheckinHour }
        : { streakHour: notifStreakHour, checkinHour: hour };
      if (granted) {
        await scheduleAllNotifications(notifPrefs, quitTimestamp, [], hours);
        await scheduleOnboardingCheckin();
      }
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const initials = (profile?.displayName?.trim() || profile?.email?.trim() || '?')[0].toUpperCase();
  const quitFormatted = formatQuitDate(profile?.quitTimestamp ?? null);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const formatDual = (ms: number): string => {
    if (ms <= 0) return '< 1min';
    const totalMins = Math.floor(ms / 60000);
    const totalHrs  = Math.floor(ms / 3600000);
    const totalDays = Math.floor(ms / 86400000);
    const years  = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days   = (totalDays % 365) % 30;
    const hrs    = totalHrs % 24;
    const mins   = totalMins % 60;
    const parts: string[] = [];
    if (years  > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}mo`);
    if (days   > 0) parts.push(`${days}d`);
    if (hrs    > 0) parts.push(`${hrs}h`);
    if (mins   > 0) parts.push(`${mins}min`);
    return parts.slice(0, 2).join(' ') || '< 1min';
  };

  const streakDisplay = (() => {
    if (!profile?.quitTimestamp) return { value: '—' };
    const ms = Math.max(0, Date.now() - new Date(profile.quitTimestamp).getTime());
    return { value: formatDual(ms) };
  })();

  const longestStreakDisplay = (() => {
    const dbDays = profile?.longestStreak ?? 0;
    const dbMs   = profile?.longestStreakMs ?? 0;
    if (!profile?.quitTimestamp) {
      const ms = dbMs > 0 ? dbMs : dbDays * 86400000;
      return { value: ms > 0 ? formatDual(ms) : '—' };
    }
    const liveMs   = Math.max(0, Date.now() - new Date(profile.quitTimestamp).getTime());
    const liveDays = Math.floor(liveMs / 86400000);
    if (liveDays >= dbDays) return { value: formatDual(liveMs) };
    const bestMs = dbMs > 0 ? dbMs : dbDays * 86400000;
    return { value: bestMs > 0 ? formatDual(bestMs) : '—' };
  })();

  return (
    <View style={s.root}>
      <View style={[s.header, { backgroundColor: c.primary }]}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Account</Text>
          </View>
          <View style={s.heroProfile}>
            <Pressable onPress={handleAvatarPress} style={({ pressed }) => [s.heroAvatar, pressed && { opacity: 0.8 }]}>
              {profile?.avatarUrl
                ? <Image source={{ uri: profile.avatarUrl }} style={s.heroAvatarImg} />
                : <Text style={s.heroAvatarTxt}>{initials}</Text>}
              {uploadingAvatar && (
                <View style={s.avatarOverlay}>
                  <ActivityIndicator color={c.white} />
                </View>
              )}
              <View style={s.heroAvatarBadge}>
                <Text style={s.avatarEditBadgeTxt}>✎</Text>
              </View>
            </Pressable>
            <View style={s.heroInfo}>
              {editingName ? (
                <View style={s.heroNameEditRow}>
                  <TextInput
                    style={s.heroNameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder="Your name"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    autoFocus
                    maxLength={40}
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                  />
                  <Pressable onPress={() => setNameInput(generateUsername())} style={({ pressed }) => [s.heroShuffleBtn, pressed && { opacity: 0.6 }]} hitSlop={6}>
                    <Ionicons name="shuffle-outline" size={15} color="rgba(255,255,255,0.8)" />
                  </Pressable>
                  <Pressable onPress={saveName} disabled={savingName} style={({ pressed }) => [s.heroSaveBtn, pressed && { opacity: 0.7 }]}>
                    {savingName ? <ActivityIndicator size="small" color={c.white} /> : <Text style={s.heroSaveBtnTxt}>Save</Text>}
                  </Pressable>
                  <Pressable onPress={() => setEditingName(false)} hitSlop={8}>
                    <Text style={s.heroCancelTxt}>✕</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={s.heroNameRow}
                  onPress={() => { setNameInput(profile?.displayName ?? profile?.email?.split('@')[0] ?? ''); setEditingName(true); }}>
                  <Text style={s.heroName} numberOfLines={1}>{profile?.displayName ?? profile?.email?.split('@')[0] ?? 'Anonymous'}</Text>
                  <View style={s.heroEditChip}><Text style={s.heroEditChipTxt}>Edit</Text></View>
                </Pressable>
              )}
              <Pressable
                onPress={async () => {
                  if (!profile?.email) return;
                  await Clipboard.setStringAsync(profile.email);
                  setEmailCopied(true);
                  if (emailCopyTimerRef.current) clearTimeout(emailCopyTimerRef.current);
                  emailCopyTimerRef.current = setTimeout(() => setEmailCopied(false), 2000);
                }}
                style={s.heroEmailRow}>
                <Text style={s.heroEmail} numberOfLines={1}>{profile?.email}</Text>
                <Ionicons name={emailCopied ? 'checkmark' : 'copy-outline'} size={12} color="rgba(255,255,255,0.45)" />
              </Pressable>
              <View style={s.heroBadgeRow}>
                {isAdmin ? (
                  <Text style={s.heroBadge}>👑 Admin</Text>
                ) : isPremiumFromRC ? (
                  <>
                    <Text style={s.heroBadge}>✨ Premium</Text>
                    {renewalDate ? <Text style={s.heroRenewal}>· Renews {renewalDate}</Text> : null}
                  </>
                ) : (
                  <>
                    <Text style={s.heroBadgeFree}>Free plan</Text>
                    {restoringPurchases
                      ? <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={{ marginLeft: 8 }} />
                      : <Pressable onPress={async () => { setRestoringPurchases(true); try { await restorePurchases(); } finally { setRestoringPurchases(false); } }}>
                          <Text style={s.heroRestore}>· Restore</Text>
                        </Pressable>}
                  </>
                )}
              </View>
            </View>
            <View>
              {!isAdmin && (isPremiumFromRC ? (
                <Pressable
                  style={({ pressed }) => [s.heroActionBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions')}>
                  <Text style={s.heroActionBtnTxt}>Manage</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [s.heroActionBtn, s.heroUpgradeBtn, pressed && { opacity: 0.85 }]}
                  onPress={showPaywall}>
                  <Text style={s.heroUpgradeBtnTxt}>Upgrade</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>

        {/* Admin section */}
        {isAdmin && (
          <View style={s.menuCard}>
            <Text style={s.menuCardTitle}>Administration</Text>
            <Pressable
              style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/moderation')}>
              <View style={s.menuIconWrap}>
                <Ionicons name="shield-outline" size={17} color={c.primary} />
              </View>
              <Text style={s.menuRowLabel}>Admin Panel</Text>
              <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
            </Pressable>
          </View>
        )}

        {/* Stats */}
        <View style={s.statsCard}>
          <View style={s.statCol}>
            <Text style={s.statIcon}>🔥</Text>
            <Text style={s.statValue}>{streakDisplay.value}</Text>
            <Text style={s.statLabel}>Current streak</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCol}>
            <Text style={s.statIcon}>🏆</Text>
            <Text style={s.statValue}>{longestStreakDisplay.value}</Text>
            <Text style={s.statLabel}>Best streak</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCol}>
            <Text style={s.statIcon}>🌟</Text>
            <Text style={s.statValue}>{profile?.milestonesEarned ?? 0}</Text>
            <Text style={s.statLabel}>Milestones</Text>
          </View>
        </View>

        {/* Your journey */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>Your journey</Text>
          {quitFormatted && (
            <>
              <Pressable
                onPress={openEdit}
                disabled={saving}
                style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
                <View style={s.infoItemMain}>
                  <Text style={s.infoItemLabel}>Started</Text>
                  {saving
                    ? <ActivityIndicator size="small" color={c.primary} style={{ alignSelf: 'flex-start' }} />
                    : <Text style={s.infoItemValue}>{quitFormatted}</Text>}
                </View>
                <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
              </Pressable>
              <View style={s.infoDivider} />
            </>
          )}
          {(['motivation', 'trigger', 'goal', 'support'] as FieldKey[]).map((field, idx, arr) => {
            const config = FIELD_CONFIG[field];
            const raw = field === 'motivation' ? profile?.motivation
              : field === 'trigger' ? profile?.trigger
              : field === 'goal' ? profile?.goal
              : profile?.supportType;
            const display = getDisplayLabel(config.options, raw ?? null);
            return (
              <View key={field}>
                <Pressable
                  onPress={() => openFieldModal(field)}
                  style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
                  <View style={s.infoItemMain}>
                    <Text style={s.infoItemLabel}>{config.label}</Text>
                    <Text style={[s.infoItemValue, !display && s.infoValueEmpty]}>
                      {display ?? 'Not set'}
                    </Text>
                  </View>
                  <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
                </Pressable>
                {idx < arr.length - 1 && <View style={s.infoDivider} />}
              </View>
            );
          })}
        </View>

        {/* Goals & finances */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>Goals & finances</Text>
          <Pressable
            onPress={openSpendingModal}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Weekly spending</Text>
              <Text style={[s.infoItemValue, !profile?.weeklyBet && s.infoValueEmpty]}>
                {profile?.weeklyBet
                  ? `${CURRENCIES.find(c => c.code === profile.currency)?.symbol ?? ''}${profile.weeklyBet}/wk`
                  : 'Not set'}
              </Text>
            </View>
            <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
          </Pressable>
          <View style={s.infoDivider} />
          <Pressable
            onPress={openGoalModal}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Savings goal</Text>
              <Text style={[s.infoItemValue, !savingsGoal && s.infoValueEmpty]}>
                {savingsGoal
                  ? `${savingsGoalIcon} ${savingsGoalFor || 'Goal'} · ${CURRENCIES.find(c => c.code === profile?.currency)?.symbol ?? ''}${savingsGoal.toLocaleString()}`
                  : 'Not set'}
              </Text>
              {savingsGoal && totalManualSavings >= savingsGoal && (
                <Text style={s.goalReachedNote}>🎉 Goal reached!</Text>
              )}
            </View>
            <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
          </Pressable>
          <View style={s.infoDivider} />
          <Pressable
            onPress={() => openGoalTargetPicker('savings')}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Savings target date</Text>
              <Text style={[s.infoItemValue, !savingsTargetDate && s.infoValueEmpty]}>
                {savingsTargetDate
                  ? savingsTargetDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Not set'}
              </Text>
            </View>
            <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
          </Pressable>
          <View style={s.infoDivider} />
          <Pressable
            onPress={() => openGoalTargetPicker('debt')}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Debt payoff target date</Text>
              <Text style={[s.infoItemValue, !debtTargetDate && s.infoValueEmpty]}>
                {debtTargetDate
                  ? debtTargetDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Not set'}
              </Text>
            </View>
            <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
          </Pressable>
          <View style={s.infoDivider} />
          <Pressable
            onPress={openCustomMilestoneModal}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Custom milestone</Text>
              <Text style={[s.infoItemValue, !customMilestone && s.infoValueEmpty]}>
                {customMilestone ? `${customMilestone.icon} ${fmtMilestone(customMilestone, profile?.currency ?? 'USD')}` : 'Not set'}
              </Text>
            </View>
            <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
          </Pressable>
        </View>

        {/* Your plan */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>Your plan</Text>
          <Pressable
            onPress={openContactModal}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={[s.menuIconWrap, { marginRight: 0 }]}><Ionicons name="person-circle-outline" size={17} color={c.primary} /></View>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Trusted contact</Text>
              <Text style={[s.infoItemValue, !trustedContactName && s.infoValueEmpty]}>
                {trustedContactName
                  ? `${trustedContactName}${trustedContactPhone ? ` · ${trustedContactPhone}` : ''}${trustedContactEmail ? ` · ${trustedContactEmail}` : ''}`
                  : 'Not set'}
              </Text>
            </View>
            <View style={s.infoItemActions}>
              {trustedContactPhone ? (
                <Pressable
                  onPress={async e => {
                    e.stopPropagation?.();
                    const url = `tel:${trustedContactPhone}`;
                    const can = await Linking.canOpenURL(url).catch(() => false);
                    if (can) Linking.openURL(url);
                    else { await Clipboard.setStringAsync(trustedContactPhone); Alert.alert('Copied', 'Phone number copied to clipboard.'); }
                  }}
                  hitSlop={8}>
                  <Ionicons name="call-outline" size={16} color={c.primary} />
                </Pressable>
              ) : null}
              {(trustedContactName || trustedContactPhone) ? (
                <Pressable
                  hitSlop={8}
                  onPress={e => {
                    e.stopPropagation?.();
                    Alert.alert('Remove contact', 'Remove your trusted contact?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: async () => {
                        await AsyncStorage.removeItem(TRUSTED_CONTACT_KEY);
                        setTrustedContactName('');
                        setTrustedContactPhone('');
                        setTrustedContactEmail('');
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) await supabase.from('users').update({ trusted_contact_name: null, trusted_contact_phone: null, trusted_contact_email: null }).eq('id', user.id);
                      }},
                    ]);
                  }}>
                  <Ionicons name="trash-outline" size={15} color={c.error} />
                </Pressable>
              ) : null}
              <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
            </View>
          </Pressable>
          <View style={s.infoDivider} />
          <Pressable
            onPress={() => {
              setPlanDistractionsInput([...recoveryDistractions]);
              setPlanMantraInput(recoveryMantra);
              setPlanOptionsExpanded(false);
              setShowRecoveryPlanModal(true);
            }}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={[s.menuIconWrap, { marginRight: 0 }]}><Ionicons name="bulb-outline" size={17} color={c.primary} /></View>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Distraction plan</Text>
              {recoveryDistractions.length > 0 || recoveryMantra ? (
                <View style={{ gap: 1 }}>
                  {recoveryDistractions.length > 0 && (
                    <Text style={s.infoItemValue}>
                      {recoveryDistractions.map(k => PLAN_DISTRACTION_OPTIONS.find(o => o.key === k)?.emoji ?? '').join(' ')}
                      {' · '}{recoveryDistractions.length} distraction{recoveryDistractions.length !== 1 ? 's' : ''}
                    </Text>
                  )}
                  {recoveryMantra ? (
                    <Text style={[s.infoItemValue, { fontStyle: 'italic' }]} numberOfLines={1}>
                      "{recoveryMantra}"
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={[s.infoItemValue, s.infoValueEmpty]}>Not set</Text>
              )}
            </View>
            <Ionicons name="pencil-outline" size={15} color={c.textFaint} />
          </Pressable>
          <View style={s.infoDivider} />
          <View style={[s.infoItem, { paddingVertical: 12 }]}>
            <View style={[s.menuIconWrap, { marginRight: 0 }]}><Ionicons name="shield-outline" size={17} color={c.primary} /></View>
            <View style={s.infoItemMain}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.infoItemLabel}>Streak shield</Text>
                {!isPremiumFromRC && (
                  <View style={{ backgroundColor: c.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>PREMIUM</Text>
                  </View>
                )}
              </View>
              <Text style={[s.infoItemValue, { fontSize: 13, color: c.textBody, fontWeight: '400' }]}>
                24h window to undo a relapse
              </Text>
            </View>
            {isPremiumFromRC ? (
              <Switch
                value={streakShieldEnabled}
                onValueChange={handleShieldToggle}
                trackColor={{ false: c.borderMid, true: c.primaryLight }}
                thumbColor={streakShieldEnabled ? c.primary : c.textFaint}
              />
            ) : (
              <Pressable onPress={() => showPaywall()} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, color: c.primary, fontWeight: '600' }}>Upgrade</Text>
              </Pressable>
            )}
          </View>
          <View style={s.infoDivider} />
          <Pressable
            onPress={() => router.push('/(tabs)/urge/checklist')}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={[s.menuIconWrap, { marginRight: 0 }]}><Ionicons name="checkmark-circle-outline" size={17} color={c.primary} /></View>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Prevention checklist</Text>
              {checklistCount > 0 ? (
                <Text style={[s.infoItemValue, checklistCount >= CHECKLIST_TOTAL && { color: c.primary }]}>
                  {checklistCount >= CHECKLIST_TOTAL ? `✓ All ${CHECKLIST_TOTAL} steps done` : `${checklistCount} of ${CHECKLIST_TOTAL} steps done`}
                </Text>
              ) : (
                <Text style={[s.infoItemValue, s.infoValueEmpty]}>Not started</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
          </Pressable>
        </View>

        {/* Someone in your corner */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>Someone in your corner</Text>
          <Text style={s.partnerDesc}>
            Share a private link with one trusted person — they'll get a live view of your progress and can send you messages.
          </Text>
          {!isPremiumFromRC ? (
            <>
              <View style={s.partnerLockedRow}>
                <Ionicons name="lock-closed" size={13} color={c.textMuted} />
                <Text style={s.partnerLockedTxt}>Premium feature</Text>
              </View>
              <Pressable
                style={({ pressed }) => [s.partnerShareBtn, s.partnerLockedBtn, pressed && { opacity: 0.8 }]}
                onPress={showPaywall}>
                <Text style={s.partnerLockedBtnTxt}>Unlock with Premium</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* What you share — pill chips */}
              <View style={s.shareNotifyRow}>
                <Text style={s.shareCollapseLabel}>What you share</Text>
                <View style={s.shareNotifyChips}>
                  {([
                    { key: 'mood' as const,       label: 'Mood',       field: 'share_mood' as const },
                    { key: 'milestones' as const, label: 'Milestones', field: 'share_milestones' as const },
                    { key: 'recovery' as const,   label: 'Recovery',   field: 'share_recovery' as const },
                  ]).map(item => (
                    <Pressable
                      key={item.key}
                      style={[s.shareNotifyChip, shareSettings[item.key] && s.shareNotifyChipOn]}
                      onPress={() => updateShareSetting(item.field, !shareSettings[item.key])}>
                      <Text style={[s.shareNotifyChipTxt, shareSettings[item.key] && s.shareNotifyChipTxtOn]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text style={s.shareHint}>Your streak is always shown. Tap a chip to hide a section — changes apply instantly, no need to reshare.</Text>

              {/* Notify by email — pill chips */}
              <View style={s.shareNotifyRow}>
                <Text style={s.shareCollapseLabel}>Notify by email</Text>
                <View style={s.shareNotifyChips}>
                  {([
                    { key: 'urge' as const,      label: 'Urge',      field: 'notify_urge' as const },
                    { key: 'relapse' as const,   label: 'Relapse',   field: 'notify_relapse' as const },
                    { key: 'milestone' as const, label: 'Milestone', field: 'notify_milestone' as const },
                  ]).map(item => (
                    <Pressable
                      key={item.key}
                      style={[s.shareNotifyChip, notifySettings[item.key] && s.shareNotifyChipOn]}
                      onPress={() => updateNotifySetting(item.field, !notifySettings[item.key])}>
                      <Text style={[s.shareNotifyChipTxt, notifySettings[item.key] && s.shareNotifyChipTxtOn]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text style={s.shareHint}>Your supporter subscribes on the page using their email. You choose which events they're notified about.</Text>

              {/* Primary CTA — generates link on first press, just shares on subsequent */}
              <Pressable
                style={({ pressed }) => [s.partnerShareBtn, { marginTop: 14 }, pressed && { opacity: 0.85 }]}
                onPress={generateAndShare}
                disabled={partnerLinkLoading}>
                {partnerLinkLoading
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <>
                      <Ionicons name="share-outline" size={16} color={c.white} />
                      <Text style={s.partnerShareBtnTxt}>
                        {partnerToken ? 'Share link again' : 'Share with my supporter'}
                      </Text>
                    </>}
              </Pressable>
              {partnerToken && (
                <Pressable
                  style={s.partnerRevokeLink}
                  onPress={revokePartnerLink}
                  disabled={partnerLinkLoading}>
                  <Text style={s.partnerRevokeLinkTxt}>Revoke to cut off access completely</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Settings */}
        <View style={s.menuCard}>
          <Text style={s.menuCardTitle}>Settings</Text>
          <View style={s.menuRow}>
            <View style={s.menuIconWrap}>
              <Ionicons name="moon-outline" size={17} color={c.primary} />
            </View>
            <Text style={s.menuRowLabel}>Appearance</Text>
            <View style={s.themeSegment}>
              {(['system', 'light', 'dark'] as ThemePref[]).map(p => (
                <Pressable
                  key={p}
                  style={[s.themeSegBtn, themePref === p && s.themeSegBtnActive]}
                  onPress={() => setThemePref(p)}>
                  <Text style={[s.themeSegTxt, themePref === p && s.themeSegTxtActive]}>
                    {p === 'system' ? 'Auto' : p === 'light' ? 'Light' : 'Dark'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => setNotifModalVisible(true)}>
            <View style={s.menuIconWrap}>
              <Ionicons name="notifications-outline" size={17} color={c.primary} />
            </View>
            <Text style={s.menuRowLabel}>Notifications</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => setShowCurrencyModal(true)}>
            <View style={s.menuIconWrap}>
              <Ionicons name="cash-outline" size={17} color={c.primary} />
            </View>
            <Text style={s.menuRowLabel}>Currency</Text>
            <Text style={s.menuRowValue}>{profile?.currency ?? 'USD'}</Text>
          </Pressable>
          <View style={s.menuDivider} />
          <View style={[s.menuRow, { paddingVertical: 10 }]}>
            <View style={s.menuIconWrap}>
              <Ionicons name="phone-portrait-outline" size={17} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuRowLabel}>Haptics</Text>
              <Text style={s.notifDesc}>Vibration feedback for taps and interactions</Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={handleHapticsToggle}
              trackColor={{ false: c.borderMid, true: c.primaryLight }}
              thumbColor={hapticsEnabled ? c.primary : c.textFaint}
            />
          </View>
          <View style={s.menuDivider} />
          <View style={[s.menuRow, { paddingVertical: 10 }]}>
            <View style={s.menuIconWrap}>
              <Ionicons name="finger-print-outline" size={17} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuRowLabel}>Biometric lock</Text>
              <Text style={s.notifDesc}>
                {biometricAvailable ? biometricLabel : 'Set up biometrics on your device first'}
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              disabled={!biometricAvailable}
              trackColor={{ false: c.borderMid, true: c.primaryLight }}
              thumbColor={biometricEnabled ? c.primary : c.textFaint}
            />
          </View>
        </View>

        {/* About */}
        <View style={s.menuCard}>
          <Text style={s.menuCardTitle}>About</Text>
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => { setFeedbackMsg(''); setFeedbackType('general'); setFeedbackVisible(true); }}>
            <View style={s.menuIconWrap}>
              <Ionicons name="chatbubble-outline" size={17} color={c.primary} />
            </View>
            <Text style={s.menuRowLabel}>Send feedback</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => {
              const url = Platform.OS === 'ios'
                ? 'https://apps.apple.com/app/id6748937702'
                : 'market://details?id=com.cornerday.app';
              Linking.openURL(url);
            }}>
            <View style={s.menuIconWrap}>
              <Ionicons name="star-outline" size={17} color={c.primary} />
            </View>
            <Text style={s.menuRowLabel}>Rate CornerDay</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/terms')}>
            <View style={s.menuIconWrap}>
              <Ionicons name="document-text-outline" size={17} color={c.primary} />
            </View>
            <Text style={s.menuRowLabel}>Terms of Use</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/privacy-policy')}>
            <View style={s.menuIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={17} color={c.primary} />
            </View>
            <Text style={s.menuRowLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
        </View>

        {/* Account actions */}
        <View style={s.menuCard}>
          <Text style={s.menuCardTitle}>Account</Text>
          {isPasswordUser && (
            <>
              <Pressable
                style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
                onPress={handleChangePassword}>
                <View style={s.menuIconWrap}>
                  <Ionicons name="key-outline" size={17} color={c.primary} />
                </View>
                <Text style={s.menuRowLabel}>Change password</Text>
                <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
              </Pressable>
              <View style={s.menuDivider} />
            </>
          )}
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={handleExport}
            disabled={exportLoading}>
            <View style={s.menuIconWrap}>
              {exportLoading
                ? <ActivityIndicator size="small" color={c.primary} />
                : <Ionicons name="download-outline" size={17} color={c.primary} />}
            </View>
            <Text style={s.menuRowLabel}>Export my data</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={confirmSignOut}
            disabled={signingOut}>
            <View style={[s.menuIconWrap, { backgroundColor: c.bgElement }]}>
              <Ionicons name="log-out-outline" size={17} color={c.textMuted} />
            </View>
            {signingOut
              ? <ActivityIndicator color={c.textMuted} size="small" style={{ flex: 1 }} />
              : <Text style={[s.menuRowLabel, { color: c.textMuted }]}>Sign out</Text>}
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
        </View>

        {/* Danger zone */}
        <View style={s.dangerCard}>
          <Text style={s.menuCardTitle}>Danger zone</Text>
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => setResetDataModalVisible(true)}>
            <View style={[s.menuIconWrap, s.menuIconWrapRed]}>
              <Ionicons name="refresh-outline" size={17} color={c.error} />
            </View>
            <Text style={[s.menuRowLabel, { color: c.error }]}>Reset data</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={confirmDeleteAccount}
            disabled={signingOut}>
            <View style={[s.menuIconWrap, s.menuIconWrapRed]}>
              <Ionicons name="trash-outline" size={17} color={c.error} />
            </View>
            <Text style={[s.menuRowLabel, s.dangerRowLabel]}>Delete account</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
        </View>

        {/* Footer */}
        <View style={s.footerNote}>
          <Text style={s.footerVersion}>CornerDay v{appVersion}</Text>
          <Text style={s.footerTagline}>Every day you hold on is a victory.</Text>
        </View>
      </ScrollView>

      {/* Savings goal modal */}
      <Modal visible={showGoalModal} transparent animationType="fade" onRequestClose={closeGoalModal}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[s.confirmOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={closeGoalModal}>
          <Pressable style={s.editCenterSheet} onPress={() => {}}>
            <Text style={s.editFieldTitle}>Savings goal</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[s.spendingCustomLabel, { marginBottom: 8 }]}>Icon</Text>
              <View style={s.goalIconGrid}>
                {GOAL_ICONS.map(icon => (
                  <Pressable
                    key={icon}
                    style={[s.goalIconChip, goalIconInput === icon && s.goalIconChipActive]}
                    onPress={() => setGoalIconInput(icon)}>
                    <Text style={s.goalIconChipEmoji}>{icon}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.spendingCustomLabel}>What are you saving for? <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional)</Text></Text>
              <TextInput
                style={s.spendingInput}
                placeholder="e.g. Holiday, New car, Emergency fund"
                placeholderTextColor={c.textFaint}
                value={goalForInput}
                onChangeText={setGoalForInput}
                maxLength={40}
              />
              <Text style={s.spendingCustomLabel}>Target amount</Text>
              <View style={s.spendingInputRow}>
                <Text style={s.spendingSymbol}>{CURRENCIES.find(c => c.code === profile?.currency)?.symbol ?? '$'}</Text>
                <TextInput
                  style={s.spendingInput}
                  placeholder="e.g. 5000"
                  placeholderTextColor={c.textFaint}
                  keyboardType="decimal-pad"
                  value={goalInput}
                  onChangeText={setGoalInput}
                />
              </View>
              {savingsGoal && (
                <Pressable
                  onPress={async () => {
                    await AsyncStorage.multiRemove([SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY]);
                    await logGoalEvent('goal_deleted', savingsGoal, savingsGoalFor || null);
                    setSavingsGoal(null); setSavingsGoalFor(''); setSavingsGoalIcon('🎯');
                    closeGoalModal();
                  }}
                  style={{ alignSelf: 'center', marginTop: 12 }}>
                  <Text style={{ color: c.error, fontSize: 13 }}>Remove goal</Text>
                </Pressable>
              )}
            </ScrollView>
            <View style={[s.modalActions, { marginTop: 16 }]}>
              <Pressable style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={closeGoalModal}>
                <Text style={s.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]} onPress={saveGoal}>
                <Text style={s.modalBtnSaveTxt}>Save goal</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Trusted contact modal */}
      <Modal visible={showContactModal} transparent animationType="fade">
        <Pressable style={s.confirmOverlay} onPress={() => setShowContactModal(false)}>
          <Pressable style={s.editCenterSheet} onPress={() => {}}>
            <Text style={s.editFieldTitle}>Trusted contact</Text>
            <Pressable
              style={({ pressed }) => [s.contactPickerBtn, pressed && { opacity: 0.8 }]}
              onPress={pickFromContacts}>
              <Ionicons name="person-add-outline" size={16} color={c.primary} />
              <Text style={s.contactPickerBtnTxt}>Choose from contacts</Text>
            </Pressable>
            <Text style={[s.spendingCustomLabel, { marginBottom: 8, marginTop: 16 }]}>Their name</Text>
            <TextInput
              style={[s.spendingInput, s.contactModalInput, { marginBottom: 16 }]}
              value={contactNameInput}
              onChangeText={setContactNameInput}
              placeholder="e.g. Mum, John"
              placeholderTextColor={c.textFaint}
              autoCapitalize="words"
            />
            <Text style={[s.spendingCustomLabel, { marginBottom: 8 }]}>Phone number</Text>
            <TextInput
              style={[s.spendingInput, s.contactModalInput, { marginBottom: 16 }]}
              value={contactPhoneInput}
              onChangeText={setContactPhoneInput}
              placeholder="+1 555 000 0000"
              placeholderTextColor={c.textFaint}
              keyboardType="phone-pad"
              autoComplete="off"
              textContentType="none"
            />
            <Text style={[s.spendingCustomLabel, { marginBottom: 8 }]}>Email address</Text>
            <TextInput
              style={[s.spendingInput, s.contactModalInput, { marginBottom: 24 }]}
              value={contactEmailInput}
              onChangeText={setContactEmailInput}
              placeholder="their@email.com"
              placeholderTextColor={c.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
            />
            {trustedContactName || trustedContactPhone ? (
              <Pressable
                style={{ alignSelf: 'center', marginBottom: 16 }}
                onPress={async () => {
                  await AsyncStorage.removeItem(TRUSTED_CONTACT_KEY);
                  setTrustedContactName('');
                  setTrustedContactPhone('');
                  setTrustedContactEmail('');
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) await supabase.from('users').update({ trusted_contact_name: null, trusted_contact_phone: null, trusted_contact_email: null }).eq('id', user.id);
                  setShowContactModal(false);
                }}>
                <Text style={{ color: c.error, fontSize: 13 }}>Remove contact</Text>
              </Pressable>
            ) : null}
            <View style={s.modalActions}>
              <Pressable
                style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                onPress={() => setShowContactModal(false)}>
                <Text style={s.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                onPress={saveContact}>
                <Text style={s.modalBtnSaveTxt}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Weekly spending modal */}
      <Modal visible={showSpendingModal} transparent animationType="fade">
        <Pressable style={s.confirmOverlay} onPress={() => setShowSpendingModal(false)}>
          <Pressable style={s.editCenterSheet} onPress={() => {}}>
            <Text style={s.editFieldTitle}>Weekly spending</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
              {CURRENCIES.map(c => (
                <Pressable
                  key={c.code}
                  style={[s.currencyChip, spendingCurrency === c.code && s.currencyChipSelected]}
                  onPress={() => setSpendingCurrency(c.code)}>
                  <Text style={[s.currencyChipTxt, spendingCurrency === c.code && s.currencyChipTxtSelected]}>
                    {c.code}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={s.spendingChips}>
              {CHIP_AMOUNTS.map(chip => {
                const sym = CURRENCIES.find(c => c.code === spendingCurrency)?.symbol ?? '';
                const isSelected = spendingChip === chip.value;
                return (
                  <Pressable
                    key={chip.value}
                    style={[s.spendingChip, isSelected && s.spendingChipSelected]}
                    onPress={() => { setSpendingChip(prev => prev === chip.value ? '' : chip.value); setSpendingCustom(''); }}>
                    <Text style={[s.spendingChipTxt, isSelected && s.spendingChipTxtSelected]}>
                      {chip.label(sym)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.spendingCustomLabel}>Or enter your exact amount:</Text>
            <View style={s.spendingInputRow}>
              <Text style={s.spendingSymbol}>{CURRENCIES.find(c => c.code === spendingCurrency)?.symbol ?? ''}</Text>
              <TextInput
                style={s.spendingInput}
                value={spendingCustom}
                onChangeText={t => { setSpendingCustom(t); if (t.trim()) setSpendingChip(''); }}
                placeholder="0"
                placeholderTextColor={c.textFaint}
                keyboardType="numeric"
              />
              <Text style={s.spendingPerWk}>/week</Text>
            </View>

            <View style={[s.modalActions, { marginTop: 16 }]}>
              <Pressable
                style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                onPress={() => setShowSpendingModal(false)}>
                <Text style={s.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                onPress={saveSpending}
                disabled={savingSpending}>
                {savingSpending
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.modalBtnSaveTxt}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit profile field modal */}
      <Modal visible={!!editField} transparent animationType="fade">
        <Pressable style={s.confirmOverlay} onPress={() => setEditField(null)}>
          <Pressable style={s.editCenterSheet} onPress={() => {}}>
            <Text style={s.editFieldTitle}>
              {editField ? FIELD_CONFIG[editField].title : ''}
            </Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {editField && FIELD_CONFIG[editField].options.map(opt => {
                const isSelected = editModalSelections.includes(opt.value);
                const isMulti = FIELD_CONFIG[editField].multi;
                return (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [s.editFieldOption, isSelected && s.editFieldOptionSelected, pressed && { opacity: 0.7 }]}
                    onPress={() => {
                      if (isMulti) {
                        setEditModalSelections(prev =>
                          prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                        );
                      } else {
                        setEditModalSelections([opt.value]);
                      }
                    }}>
                    <Text style={s.editFieldEmoji}>{opt.emoji}</Text>
                    <Text style={[s.editFieldLabel, isSelected && s.editFieldLabelSelected]}>{opt.label}</Text>
                    {isMulti ? (
                      <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                        {isSelected && <Text style={s.checkmark}>✓</Text>}
                      </View>
                    ) : (
                      <View style={[s.radio, isSelected && s.radioSelected]}>
                        {isSelected && <View style={s.radioDot} />}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={s.modalActions}>
              <Pressable
                style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                onPress={() => setEditField(null)}>
                <Text style={s.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                onPress={saveFieldModal}
                disabled={savingField}>
                {savingField
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.modalBtnSaveTxt}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Currency picker modal */}
      <Modal visible={showCurrencyModal} transparent animationType="fade" onRequestClose={() => setShowCurrencyModal(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setShowCurrencyModal(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <Text style={s.confirmTitle}>Currency</Text>
            <Text style={[s.confirmBody, { marginBottom: 20 }]}>Choose how money is displayed throughout the app.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {CURRENCIES.map(cur => (
                <Pressable
                  key={cur.code}
                  style={[s.currencyChip, profile?.currency === cur.code && s.currencyChipSelected]}
                  onPress={() => saveCurrency(cur.code)}>
                  <Text style={[s.currencyChipTxt, profile?.currency === cur.code && s.currencyChipTxtSelected]}>
                    {cur.symbol} {cur.code}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change password modal */}
      <Modal visible={showPassModal} transparent animationType="fade" onRequestClose={() => setShowPassModal(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setShowPassModal(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            {passResetSent ? (
              <>
                <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>📧</Text>
                <Text style={[s.confirmTitle, { marginBottom: 8 }]}>Check your email</Text>
                <Text style={[s.confirmBody, { textAlign: 'center', marginBottom: 4 }]}>
                  We sent a password reset link to
                </Text>
                <Text style={[s.confirmBody, { textAlign: 'center', fontWeight: '700', color: c.primary, marginBottom: 24 }]}>
                  {profile?.email}
                </Text>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { alignSelf: 'stretch', flex: undefined }, pressed && { opacity: 0.85 }]}
                  onPress={() => setShowPassModal(false)}>
                  <Text style={s.modalBtnSaveTxt}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={s.confirmIconRow}>
                  <View style={[s.confirmIconCircle, { backgroundColor: c.bgTeal, borderColor: c.borderTeal }]}>
                    <Ionicons name="key-outline" size={26} color={c.primary} />
                  </View>
                </View>
                <Text style={s.confirmTitle}>Change password</Text>
                <Text style={[s.confirmBody, { textAlign: 'center', marginBottom: 4 }]}>
                  We'll send a reset link to
                </Text>
                <Text style={[s.confirmBody, { textAlign: 'center', fontWeight: '600', color: c.primary, marginBottom: 20 }]}>
                  {profile?.email}
                </Text>
                <View style={s.confirmActions}>
                  <Pressable
                    style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                    onPress={() => setShowPassModal(false)}>
                    <Text style={s.modalBtnCancel}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                    onPress={sendPasswordReset}
                    disabled={sendingPassReset}>
                    {sendingPassReset
                      ? <ActivityIndicator size="small" color={c.white} />
                      : <Text style={s.modalBtnSaveTxt}>Send reset link</Text>}
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Contacts permission modal */}
      <Modal visible={showContactsPermModal} transparent animationType="fade" onRequestClose={() => setShowContactsPermModal(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setShowContactsPermModal(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={[s.confirmIconCircle, { backgroundColor: c.bgTeal, borderColor: c.borderTeal }]}>
                <Ionicons name="people-outline" size={26} color={c.primary} />
              </View>
            </View>
            <Text style={s.confirmTitle}>Contacts access needed</Text>
            <Text style={[s.confirmBody, { textAlign: 'center', marginBottom: 16 }]}>
              To pick a trusted contact from your phone, CornerDay needs access to your contacts.
            </Text>
            <View style={s.permStepBox}>
              <View style={s.permStep}>
                <View style={s.permStepNum}><Text style={s.permStepNumTxt}>1</Text></View>
                <Text style={s.permStepTxt}>Open <Text style={s.permStepBold}>Settings</Text> on your phone</Text>
              </View>
              <View style={s.permStep}>
                <View style={s.permStepNum}><Text style={s.permStepNumTxt}>2</Text></View>
                <Text style={s.permStepTxt}>Find <Text style={s.permStepBold}>CornerDay</Text> in the app list</Text>
              </View>
              <View style={s.permStep}>
                <View style={s.permStepNum}><Text style={s.permStepNumTxt}>3</Text></View>
                <Text style={s.permStepTxt}>Tap <Text style={s.permStepBold}>Permissions → Contacts</Text> and set to <Text style={s.permStepBold}>Allow</Text></Text>
              </View>
            </View>
            <View style={[s.confirmActions, { marginTop: 20 }]}>
              <Pressable
                style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                onPress={() => setShowContactsPermModal(false)}>
                <Text style={s.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                onPress={() => { setShowContactsPermModal(false); Linking.openSettings(); }}>
                <Text style={s.modalBtnSaveTxt}>Open Settings</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notification settings modal */}
      <Modal visible={notifModalVisible} transparent animationType="fade" onRequestClose={() => setNotifModalVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setNotifModalVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <Text style={s.confirmTitle}>Notifications</Text>
            {([
              { key: 'notif_milestone',             label: 'Milestone reached',     desc: 'Alert when you hit a streak milestone' },
              { key: 'notif_daily_streak',          label: 'Daily streak reminder', desc: 'Evening nudge to keep your streak going' },
              { key: 'notif_daily_checkin',         label: 'Daily check-in',        desc: 'Morning prompt to log your mood' },
              { key: 'notif_weekly_summary',        label: 'Weekly summary',        desc: 'Monday morning overview of your progress' },
              { key: 'notif_milestone_approaching', label: 'Milestone approaching', desc: '24 hours before your next milestone' },
              { key: 'notif_community',             label: 'Community activity',    desc: 'Comments on your posts and new posts from people you follow' },
            ] as { key: keyof NotifPrefs; label: string; desc: string }[]).map(({ key, label, desc }) => (
              <View key={key}>
                <View style={s.notifRow}>
                  <View style={s.notifText}>
                    <Text style={s.notifLabel}>{label}</Text>
                    <Text style={s.notifDesc}>{desc}</Text>
                  </View>
                  <Switch
                    value={notifPrefs[key]}
                    onValueChange={v => handleNotifToggle(key, v)}
                    trackColor={{ false: c.borderMid, true: c.primaryLight }}
                    thumbColor={notifPrefs[key] ? c.primary : c.textFaint}
                  />
                </View>
                {key === 'notif_daily_streak' && notifPrefs.notif_daily_streak && (
                  <View style={s.notifTimeRow}>
                    {[{ h: 18, label: '6pm' }, { h: 19, label: '7pm' }, { h: 20, label: '8pm' }, { h: 21, label: '9pm' }].map(opt => (
                      <Pressable
                        key={opt.h}
                        style={[s.notifTimeChip, notifStreakHour === opt.h && s.notifTimeChipActive]}
                        onPress={() => handleNotifHour('streak', opt.h)}>
                        <Text style={[s.notifTimeChipTxt, notifStreakHour === opt.h && s.notifTimeChipTxtActive]}>{opt.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {key === 'notif_daily_checkin' && notifPrefs.notif_daily_checkin && (
                  <View style={s.notifTimeRow}>
                    {[{ h: 7, label: '7am' }, { h: 8, label: '8am' }, { h: 9, label: '9am' }, { h: 10, label: '10am' }].map(opt => (
                      <Pressable
                        key={opt.h}
                        style={[s.notifTimeChip, notifCheckinHour === opt.h && s.notifTimeChipActive]}
                        onPress={() => handleNotifHour('checkin', opt.h)}>
                        <Text style={[s.notifTimeChipTxt, notifCheckinHour === opt.h && s.notifTimeChipTxtActive]}>{opt.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {/* Urge prediction — premium only */}
            <View style={s.notifRow}>
              <View style={s.notifText}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.notifLabel}>Urge prediction</Text>
                  <View style={{ backgroundColor: c.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 10, color: c.white, fontWeight: '700' }}>PREMIUM</Text>
                  </View>
                </View>
                <Text style={s.notifDesc}>Daily heads-up before your riskiest window based on your urge patterns</Text>
              </View>
              {isPremiumFromRC ? (
                <Switch
                  value={notifPrefs.notif_urge_prediction}
                  onValueChange={v => handleNotifToggle('notif_urge_prediction', v)}
                  trackColor={{ false: c.borderMid, true: c.primaryLight }}
                  thumbColor={notifPrefs.notif_urge_prediction ? c.primary : c.textFaint}
                />
              ) : (
                <Pressable onPress={() => { setNotifModalVisible(false); showPaywall(); }} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: c.primary, fontWeight: '600' }}>Upgrade</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={[s.confirmSave, { marginTop: 20, flex: 0 }]} onPress={() => setNotifModalVisible(false)}>
              <Text style={s.confirmSaveTxt}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Avatar action menu */}
      <Modal visible={avatarMenuVisible} transparent animationType="fade" onRequestClose={() => setAvatarMenuVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setAvatarMenuVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            
            <Text style={s.confirmTitle}>Profile photo</Text>
            <View style={[s.confirmActions, { flexDirection: 'column', gap: 10 }]}>
              <Pressable style={[s.confirmCancel, { flex: 0 }]} onPress={() => { setAvatarMenuVisible(false); pickAvatar(); }}>
                <Text style={[s.confirmCancelTxt, { color: c.primary }]}>Change photo</Text>
              </Pressable>
              <Pressable style={[s.confirmDelete, { flex: 0 }]} onPress={() => { setAvatarMenuVisible(false); removeAvatar(); }}>
                <Text style={s.confirmDeleteTxt}>Remove photo</Text>
              </Pressable>
              <Pressable style={[s.confirmCancel, { flex: 0 }]} onPress={() => setAvatarMenuVisible(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Confirm quit date change */}
      <Modal visible={!!confirmQuitDate} transparent animationType="fade" onRequestClose={() => setConfirmQuitDate(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setConfirmQuitDate(null)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            
            <View style={s.confirmIconRow}>
              <View style={[s.confirmIconCircle, { backgroundColor: c.bgTeal, borderColor: c.borderTeal }]}>
                <Ionicons name="calendar-outline" size={26} color={c.primary} />
              </View>
            </View>
            <Text style={s.confirmTitle}>Update start date?</Text>
            {confirmQuitDate && (
              <Text style={s.confirmBody}>
                Set to <Text style={s.confirmBold}>{formatQuitDate(confirmQuitDate.toISOString())}</Text>?{'\n\n'}This will reset your current streak counter.
              </Text>
            )}
            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setConfirmQuitDate(null)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.confirmSave, saving && { opacity: 0.6 }]}
                onPress={() => { if (confirmQuitDate) { saveQuitDate(confirmQuitDate); } setConfirmQuitDate(null); }}
                disabled={saving}>
                <Text style={s.confirmSaveTxt}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Revoke partner link */}
      <Modal visible={revokePartnerVisible} transparent animationType="fade" onRequestClose={() => setRevokePartnerVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setRevokePartnerVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={s.confirmIconCircle}>
                <Ionicons name="link-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.confirmTitle}>Revoke link?</Text>
            <Text style={s.confirmBody}>
              Your partner will lose access to your progress and won't be able to send you messages.
            </Text>
            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setRevokePartnerVisible(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={s.confirmDelete} onPress={executeRevokePartnerLink}>
                <Text style={s.confirmDeleteTxt}>Revoke</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Custom milestone modal */}
      <Modal visible={showCustomMilestoneModal} transparent animationType="fade" onRequestClose={() => setShowCustomMilestoneModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[s.confirmOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={() => setShowCustomMilestoneModal(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <Text style={s.confirmTitle}>Custom milestone</Text>

            {/* Type picker */}
            <View style={s.milestoneTypeGrid}>
              {MILESTONE_TYPES.map(mt => {
                const selected = customMilestoneType === mt.type;
                return (
                  <Pressable
                    key={mt.type}
                    style={[s.milestoneTypeBtn, selected && s.milestoneTypeBtnSelected]}
                    onPress={() => { setCustomMilestoneType(mt.type); setCustomMilestoneIcon(DEFAULT_MILESTONE_ICON[mt.type]); setCustomMilestoneInput(''); setMilestoneIconPickerOpen(false); }}>
                    <Text style={s.milestoneTypeEmoji}>{mt.emoji}</Text>
                    <Text style={[s.milestoneTypeLabel, selected && s.milestoneTypeLabelSelected]}>{mt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Input row + inline icon trigger */}
            <View style={s.milestoneInputRow}>
              <Pressable
                style={[s.milestoneIconTrigger, milestoneIconPickerOpen && s.milestoneIconTriggerOpen]}
                onPress={() => setMilestoneIconPickerOpen(v => !v)}>
                <Text style={{ fontSize: 20 }}>{customMilestoneIcon}</Text>
                <Text style={s.milestoneIconChevron}>{milestoneIconPickerOpen ? '▴' : '▾'}</Text>
              </Pressable>
              <TextInput
                style={s.milestoneInput}
                placeholder={customMilestoneType === 'days' ? '100' : customMilestoneType === 'savings' ? '500' : '50'}
                placeholderTextColor={c.textFaint}
                keyboardType="number-pad"
                value={customMilestoneInput}
                onChangeText={setCustomMilestoneInput}
                maxLength={6}
              />
              <Text style={s.milestoneInputUnit}>
                {customMilestoneType === 'days'     ? 'days clean' :
                 customMilestoneType === 'savings'  ? (profile?.currency ?? 'USD') + ' saved' :
                 customMilestoneType === 'urges'    ? 'urges beaten' :
                                                      'payments made'}
              </Text>
            </View>

            {/* Expandable icon strip */}
            {milestoneIconPickerOpen && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.milestoneIconScroll} contentContainerStyle={s.milestoneIconScrollContent}>
                {MILESTONE_ICONS.map(icon => (
                  <Pressable
                    key={icon}
                    style={[s.milestoneIconBtn, customMilestoneIcon === icon && s.milestoneIconBtnSelected]}
                    onPress={() => { setCustomMilestoneIcon(icon); setMilestoneIconPickerOpen(false); }}>
                    <Text style={s.milestoneIconEmoji}>{icon}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setShowCustomMilestoneModal(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              {customMilestone && (
                <Pressable style={[s.confirmCancel, { borderColor: c.error }]} onPress={removeCustomMilestone}>
                  <Text style={[s.confirmCancelTxt, { color: c.error }]}>Remove</Text>
                </Pressable>
              )}
              <Pressable style={[s.confirmDelete, { backgroundColor: c.primary, borderColor: c.primary }]} onPress={saveCustomMilestone}>
                <Text style={[s.confirmDeleteTxt, { color: '#fff' }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirm sign out */}
      <Modal visible={signOutVisible} transparent animationType="fade" onRequestClose={() => setSignOutVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setSignOutVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            
            <View style={s.confirmIconRow}>
              <View style={[s.confirmIconCircle, { backgroundColor: c.bgElement, borderColor: c.borderLight }]}>
                <Ionicons name="log-out-outline" size={26} color={c.textBody} />
              </View>
            </View>
            <Text style={s.confirmTitle}>Sign out?</Text>
            <Text style={s.confirmBody}>Are you sure you want to sign out?</Text>
            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setSignOutVisible(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.confirmDelete, signingOut && { opacity: 0.6 }]}
                onPress={() => { setSignOutVisible(false); executeSignOut(); }}
                disabled={signingOut}>
                <Text style={s.confirmDeleteTxt}>Sign out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Confirm delete account */}
      <Modal visible={deleteAccountVisible} transparent animationType="fade" onRequestClose={() => setDeleteAccountVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setDeleteAccountVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            
            <View style={s.confirmIconRow}>
              <View style={s.confirmIconCircle}>
                <Ionicons name="trash-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.confirmTitle}>Delete account?</Text>
            <Text style={s.confirmBody}>
              This will permanently delete your account and all your data — streaks, losses, badges, mood history, and journal entries.{'\n\n'}This cannot be undone.
            </Text>
            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setDeleteAccountVisible(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.confirmDelete, signingOut && { opacity: 0.6 }]}
                onPress={() => { setDeleteAccountVisible(false); executeDeleteAccount(); }}
                disabled={signingOut}>
                {signingOut
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.confirmDeleteTxt}>Delete permanently</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Feedback modal */}
      <Modal visible={feedbackVisible} transparent animationType="fade" onRequestClose={() => { setAndroidKbOffset(0); setFeedbackVisible(false); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[s.confirmOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={() => { setAndroidKbOffset(0); setFeedbackVisible(false); }}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <Text style={s.confirmTitle}>Feedback &amp; Feature Request</Text>

            <View style={s.feedbackTypeRow}>
              {([
                { key: 'general', label: '💬 General' },
                { key: 'feature', label: '💡 Feature' },
                { key: 'bug',     label: '🐛 Bug' },
              ] as { key: 'general' | 'feature' | 'bug'; label: string }[]).map(t => (
                <Pressable
                  key={t.key}
                  style={[s.feedbackTypeChip, feedbackType === t.key && s.feedbackTypeChipActive]}
                  onPress={() => setFeedbackType(t.key)}>
                  <Text style={[s.feedbackTypeChipTxt, feedbackType === t.key && s.feedbackTypeChipTxtActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={s.feedbackInput}
              placeholder="Write your message here…"
              placeholderTextColor={c.textFaint}
              value={feedbackMsg}
              onChangeText={setFeedbackMsg}
              multiline
              numberOfLines={5}
              maxLength={1000}
              textAlignVertical="top"
            />

            <View style={s.confirmActions}>
              <Pressable
                style={s.confirmCancel}
                onPress={() => { setAndroidKbOffset(0); setFeedbackVisible(false); }}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.confirmSave, (!feedbackMsg.trim() || sendingFeedback) && { opacity: 0.4 }]}
                disabled={!feedbackMsg.trim() || sendingFeedback}
                onPress={async () => {
                  setSendingFeedback(true);
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    const payload = {
                      user_id: user?.id ?? null,
                      type: feedbackType,
                      message: feedbackMsg.trim(),
                      app_version: Constants.expoConfig?.version ?? null,
                    };
                    const { error } = await supabase.from('feedback').insert(payload);
                    if (error) throw error;
                    setFeedbackVisible(false);
                    setFeedbackMsg('');
                    setFeedbackType('general');
                    setThankYouVisible(true);
                    // Fire-and-forget — pass data directly so no SELECT permission needed
                    supabase.functions.invoke('notify-feedback', {
                      body: { ...payload, user_email: user?.email ?? null },
                    }).catch(() => {});
                  } catch {
                    Alert.alert('Error', 'Could not send feedback. Please try again.');
                  } finally {
                    setSendingFeedback(false);
                  }
                }}>
                {sendingFeedback
                  ? <ActivityIndicator size="small" color={c.white} />
                  : <Text style={s.confirmSaveTxt}>Send</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Feedback thank-you modal */}
      <Modal visible={thankYouVisible} transparent animationType="fade" onRequestClose={() => setThankYouVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setThankYouVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={[s.confirmIconCircle, { backgroundColor: c.bgTeal, borderColor: c.borderTeal }]}>
                <Text style={{ fontSize: 26 }}>💚</Text>
              </View>
            </View>
            <Text style={s.confirmTitle}>Thank you!</Text>
            <Text style={[s.confirmBody, { marginBottom: 24 }]}>
              Your feedback has been received. We read every submission and will look into it.
            </Text>
            <Pressable
              style={({ pressed }) => [s.thankYouDoneBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setThankYouVisible(false)}>
              <Text style={s.thankYouDoneBtnTxt}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reset data modal */}
      <Modal visible={resetDataModalVisible} transparent animationType="fade" onRequestClose={() => setResetDataModalVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setResetDataModalVisible(false)}>
          <Pressable style={s.resetSheet} onPress={() => {}}>
            <Text style={s.resetSheetTitle}>Reset data</Text>
            <Text style={s.resetSheetSub}>Choose what to clear. This cannot be undone.</Text>

            {[
              {
                icon: 'journal-outline' as const,
                label: 'Journal',
                desc: 'Urge entries and mood check-ins',
                onPress: () => confirmReset(
                  'Reset journal?',
                  'All urge journal entries and mood check-ins will be permanently deleted.',
                  resetJournal,
                ),
              },
              {
                icon: 'ribbon-outline' as const,
                label: 'Milestones & badges',
                desc: 'Earned badges and prevention checklist',
                onPress: () => confirmReset(
                  'Reset milestones & badges?',
                  'All earned badges and your prevention checklist progress will be cleared.',
                  resetMilestones,
                ),
              },
              {
                icon: 'wallet-outline' as const,
                label: 'Loss & debt tracker',
                desc: 'All loss, payment and debt records',
                onPress: () => confirmReset(
                  'Reset loss & debt tracker?',
                  'All losses, payments and debt records will be permanently deleted.',
                  resetLossTracker,
                ),
              },
              {
                icon: 'game-controller-outline' as const,
                label: 'Game scores',
                desc: 'Personal bests and all game history',
                onPress: () => confirmReset(
                  'Reset game scores?',
                  'Your personal bests and all game score history will be permanently deleted.',
                  resetGameScores,
                ),
              },
            ].map(({ icon, label, desc, onPress }, i, arr) => (
              <View key={label}>
                <Pressable
                  style={({ pressed }) => [s.resetRow, pressed && { opacity: 0.7 }]}
                  onPress={() => { setResetDataModalVisible(false); onPress(); }}
                  disabled={resetting}>
                  <Ionicons name={icon} size={20} color={c.error} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.resetRowLabel}>{label}</Text>
                    <Text style={s.resetRowDesc}>{desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.borderMid} />
                </Pressable>
                {i < arr.length - 1 && <View style={s.resetDivider} />}
              </View>
            ))}

            <View style={s.resetNuclearSep} />
            <Pressable
              style={({ pressed }) => [s.resetNuclearRow, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setResetDataModalVisible(false);
                confirmReset(
                  'Reset everything?',
                  'This will clear your streak, all badges, mood history, journal, losses, debts, weekly spending, custom milestone, distraction plan and streak shield. Your account and settings are kept.',
                  resetEverything,
                );
              }}
              disabled={resetting}>
              <Ionicons name="nuclear-outline" size={20} color={c.error} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.resetNuclearLabel}>Reset everything</Text>
                <Text style={s.resetRowDesc}>Streak, badges, mood, journal, losses, debts & journey data</Text>
              </View>
            </Pressable>

            <Pressable style={({ pressed }) => [s.resetCancelBtn, pressed && { opacity: 0.7 }]} onPress={() => setResetDataModalVisible(false)}>
              <Text style={s.resetCancelTxt}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reset confirmation modal */}
      <Modal visible={!!pendingReset} transparent animationType="fade" onRequestClose={() => setPendingReset(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setPendingReset(null)}>
          <Pressable style={s.resetConfirmSheet} onPress={() => {}}>
            <View style={s.resetConfirmIconWrap}>
              <Ionicons name="warning-outline" size={28} color={c.error} />
            </View>
            <Text style={s.resetConfirmTitle}>{pendingReset?.title}</Text>
            <Text style={s.resetConfirmBody}>{pendingReset?.body}</Text>
            <View style={s.resetConfirmActions}>
              <Pressable
                style={({ pressed }) => [s.resetConfirmCancel, pressed && { opacity: 0.7 }]}
                onPress={() => setPendingReset(null)}>
                <Text style={s.resetConfirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.resetConfirmBtn, pressed && { opacity: 0.85 }]}
                onPress={() => { pendingReset?.onConfirm(); setPendingReset(null); }}>
                <Text style={s.resetConfirmBtnTxt}>Reset</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Recovery plan modal */}
      <Modal visible={showRecoveryPlanModal} transparent animationType="fade" onRequestClose={() => setShowRecoveryPlanModal(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setShowRecoveryPlanModal(false)}>
          <Pressable style={[s.editCenterSheet, { maxHeight: '92%' }]} onPress={() => {}}>
            <Text style={s.editFieldTitle}>My distraction plan</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={[s.spendingCustomLabel, { marginBottom: 8 }]}>
                Personal mantra <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional)</Text>
              </Text>
              <TextInput
                style={s.planMantraInput}
                placeholder="e.g. I am stronger than this urge"
                placeholderTextColor={c.textFaint}
                value={planMantraInput}
                onChangeText={setPlanMantraInput}
                multiline
                maxLength={120}
                textAlignVertical="top"
              />
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, marginBottom: 20 }}>
                {planMantraInput.length}/120
              </Text>
              <Pressable
                style={({ pressed }) => [s.planDropdownBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setPlanOptionsExpanded(v => !v)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.planDropdownLabel}>Activities when urge hits</Text>
                  {planDistractionsInput.length > 0 ? (
                    <Text style={s.planDropdownValue}>
                      {planDistractionsInput.map(k => PLAN_DISTRACTION_OPTIONS.find(o => o.key === k)?.emoji).join('  ')}
                      {'  ·  '}{planDistractionsInput.length}/5 selected
                    </Text>
                  ) : (
                    <Text style={s.planDropdownPlaceholder}>None — tap to choose (up to 5)</Text>
                  )}
                </View>
                <Ionicons name={planOptionsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textMuted} />
              </Pressable>
              {planOptionsExpanded && (
                <View style={[s.planOptionGrid, { marginTop: 8 }]}>
                  {PLAN_DISTRACTION_OPTIONS.map(opt => {
                    const selected = planDistractionsInput.includes(opt.key);
                    return (
                      <Pressable
                        key={opt.key}
                        style={({ pressed }) => [s.planOption, selected && s.planOptionSelected, pressed && { opacity: 0.75 }]}
                        onPress={() => {
                          if (selected) {
                            setPlanDistractionsInput(prev => prev.filter(k => k !== opt.key));
                          } else if (planDistractionsInput.length < 5) {
                            setPlanDistractionsInput(prev => [...prev, opt.key]);
                          }
                        }}>
                        <Text style={s.planOptionEmoji}>{opt.emoji}</Text>
                        <Text style={[s.planOptionLabel, selected && s.planOptionLabelSelected]} numberOfLines={2}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <View style={[s.modalActions, { marginTop: 16 }]}>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                  onPress={() => setShowRecoveryPlanModal(false)}>
                  <Text style={s.modalBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                  onPress={savePlan}
                  disabled={savingPlan}>
                  {savingPlan
                    ? <ActivityIndicator color={c.white} size="small" />
                    : <Text style={s.modalBtnSaveTxt}>Save plan</Text>}
                </Pressable>
              </View>
              {(recoveryDistractions.length > 0 || !!recoveryMantra) && (
                <Pressable
                  style={{ alignSelf: 'center', marginTop: 28 }}
                  onPress={clearPlan}
                  disabled={savingPlan}>
                  <Text style={{ color: c.error, fontSize: 13 }}>Remove distraction plan</Text>
                </Pressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* iOS debt target date picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={showDebtTargetModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Debt payoff target date</Text>
              <DateTimePicker
                value={editGoalTargetDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_e, d) => d && setEditGoalTargetDate(d)}
                style={{ height: 200 }}
              />
              <View style={s.modalActions}>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setShowDebtTargetModal(false)}>
                  <Text style={s.modalBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, s.modalBtnSave, pressed && { opacity: 0.85 }]}
                  onPress={() => saveGoalTargetDate('debt', editGoalTargetDate)}
                  disabled={savingGoalTarget}>
                  {savingGoalTarget
                    ? <ActivityIndicator size="small" color={c.white} />
                    : <Text style={s.modalBtnSaveTxt}>Save</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* iOS savings target date picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={showSavingsTargetModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Savings goal target date</Text>
              <DateTimePicker
                value={editGoalTargetDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_e, d) => d && setEditGoalTargetDate(d)}
                style={{ height: 200 }}
              />
              <View style={s.modalActions}>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setShowSavingsTargetModal(false)}>
                  <Text style={s.modalBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, s.modalBtnSave, pressed && { opacity: 0.85 }]}
                  onPress={() => saveGoalTargetDate('savings', editGoalTargetDate)}
                  disabled={savingGoalTarget}>
                  {savingGoalTarget
                    ? <ActivityIndicator size="small" color={c.white} />
                    : <Text style={s.modalBtnSaveTxt}>Save</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* iOS date/time picker modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showIOSModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Set start date & time</Text>
              </View>
              {editDate && (
                <DateTimePicker
                  value={editDate}
                  mode="datetime"
                  display="spinner"
                  onValueChange={(_evt, d) => d && setEditDate(new Date(d.getTime()))}
                  maximumDate={new Date()}
                  style={{ height: 200 }}
                />
              )}
              <View style={s.modalActions}>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setShowIOSModal(false)}>
                  <Text style={s.modalBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, s.modalBtnSave, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    setShowIOSModal(false);
                    if (!editDate) return;
                    setConfirmQuitDate(new Date(editDate.getTime()));
                  }}>
                  <Text style={s.modalBtnSaveTxt}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 24 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.white },

  // Hero profile (merged into header)
  heroProfile: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  heroAvatar: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
  },
  heroAvatarImg: { width: 62, height: 62, borderRadius: 31 },
  heroAvatarTxt: { fontSize: 26, fontWeight: '700', color: c.white },
  heroAvatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
  },
  heroInfo: { flex: 1, gap: 3 },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroName: { fontSize: 17, fontWeight: '700', color: c.white, flexShrink: 1 },
  heroEditChip: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroEditChipTxt: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  heroNameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  heroNameInput: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    fontSize: 14, color: c.white, minWidth: 110,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroShuffleBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroSaveBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroSaveBtnTxt: { color: c.white, fontWeight: '700', fontSize: 12 },
  heroCancelTxt: { fontSize: 16, color: 'rgba(255,255,255,0.6)', paddingHorizontal: 4 },
  heroEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroEmail: { fontSize: 12, color: 'rgba(255,255,255,0.6)', flexShrink: 1 },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  heroBadge: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  heroBadgeFree: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  heroRenewal: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  heroRestore: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  heroActionBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  heroUpgradeBtn: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' },
  heroActionBtnTxt: { fontSize: 13, fontWeight: '700', color: c.white },
  heroUpgradeBtnTxt: { fontSize: 13, fontWeight: '700', color: c.primary },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  profileCard: {
    backgroundColor: c.bgCard, borderRadius: 14, padding: 20,
    alignItems: 'center', gap: 6, overflow: 'hidden',
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  avatarOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: c.white,
  },
  avatarEditBadgeTxt: { fontSize: 11, color: c.white },
  avatarTxt: { fontSize: 32, fontWeight: '700', color: c.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayName: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  nameEditHint: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.bgTeal },
  nameEditHintTxt: { fontSize: 12, color: c.primary, fontWeight: '700' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameInput: {
    borderWidth: 1, borderColor: c.borderMid, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: c.textPrimary, minWidth: 120,
  },
  nameShuffleBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center' },
  nameSaveBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.primary },
  nameSaveTxt: { color: c.white, fontWeight: '700', fontSize: 12 },
  nameCancelBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  nameCancelTxt: { color: c.textFaint, fontSize: 12 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  email: { fontSize: 13, color: c.textMuted },
  premiumBadge: {
    backgroundColor: c.bgTeal, paddingVertical: 4, paddingHorizontal: 12,
    borderRadius: 12, marginTop: 4,
  },
  premiumBadgeTxt: { fontSize: 13, color: c.primary, fontWeight: '600' },

  profileSubRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', borderTopWidth: 1, borderTopColor: c.borderSubtle,
    marginTop: 8, paddingTop: 14,
  },
  profileSubLeft: { gap: 2 },
  profileSubBadge: { fontSize: 14, fontWeight: '700', color: c.primary },
  profileAdminBadge: { fontSize: 14, fontWeight: '700', color: ADMIN_BADGE_COLOR },
  profileSubMeta: { fontSize: 12, color: c.textFaint },
  profileSubFree: { fontSize: 14, fontWeight: '600', color: c.textBody },
  profileSubRestore: { fontSize: 12, color: c.primary },
  profileSubBtn: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: c.primary,
  },
  profileSubBtnTxt: { fontSize: 13, fontWeight: '700', color: c.primary },
  profileUpgradeBtn: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: c.primary,
  },
  profileUpgradeBtnTxt: { fontSize: 13, fontWeight: '700', color: c.white },

  infoCard: { backgroundColor: c.bgCard, borderRadius: 16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  infoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  infoItemMain: { flex: 1, gap: 2 },
  infoItemLabel: { fontSize: 12, color: c.textFaint, fontWeight: '500' },
  infoItemValue: { fontSize: 15, color: c.textPrimary, fontWeight: '600' },
  infoItemActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoDivider: { height: 1, backgroundColor: c.borderSubtle, marginLeft: 0 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 14, color: c.textMuted },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  infoValue: { fontSize: 14, color: c.textPrimary, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  goalReachedNote: { fontSize: 12, color: c.success, fontWeight: '600', marginTop: 2 },
  editBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.bgTeal },
  editBtnTxt: { fontSize: 12, color: c.primary, fontWeight: '700' },

  card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
  subStatus: { fontSize: 15, color: c.textBody },
  upgradeBtn: {
    backgroundColor: c.primary, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  upgradeBtnTxt: { color: c.white, fontWeight: '700', fontSize: 15 },

  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  settingsRowTxt: { flex: 1, fontSize: 14, color: c.textPrimary, fontWeight: '500' },

  aboutCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  aboutTitle: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
  aboutVersion: { fontSize: 13, color: c.textFaint },
  aboutNote: { fontSize: 13, color: c.textBody, lineHeight: 19 },
  aboutDivider: { height: 1, backgroundColor: c.borderSubtle },
  aboutBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  aboutBtnTxt: { fontSize: 14, color: c.primary, fontWeight: '600' },

  statsCard: {
    backgroundColor: c.bgCard, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  statCol: { flex: 1, alignItems: 'center', gap: 2 },
  statIcon: { fontSize: 20, marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: '800', color: c.primary },
  statLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
  statDivider: { width: 1, height: 52, backgroundColor: c.borderSubtle, marginHorizontal: 8 },

  exportBtn: {
    backgroundColor: c.bgCard, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.borderTeal,
  },
  exportTxt: { fontSize: 15, color: c.primary, fontWeight: '600' },

  versionTxt: { fontSize: 12, color: c.textDisabled, textAlign: 'center', paddingVertical: 8 },

  infoValueEmpty: { color: c.textFaint, fontStyle: 'italic', fontWeight: '400' },

  feedbackTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  feedbackTypeChip: { flex: 1, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: c.borderTeal, backgroundColor: c.bgInputMid, alignItems: 'center' },
  feedbackTypeChipActive: { borderColor: c.primary, backgroundColor: c.bgTeal },
  feedbackTypeChipTxt: { fontSize: 13, fontWeight: '600', color: c.textBody },
  feedbackTypeChipTxtActive: { color: c.primary },
  feedbackInput: {
    borderWidth: 1.5, borderColor: c.borderLight, borderRadius: 12,
    padding: 14, fontSize: 14, color: c.textPrimary, minHeight: 120, marginBottom: 16,
  },

  notifSettingsBtn: {
    backgroundColor: c.bgCard, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.borderTeal,
  },
  notifSettingsTxt: { fontSize: 15, color: c.primary, fontWeight: '600' },

  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  notifTimeRow: { flexDirection: 'row', gap: 6, paddingBottom: 10, paddingTop: 4 },
  notifTimeChip: { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: c.bgElement },
  notifTimeChipActive: { backgroundColor: c.primary },
  notifTimeChipTxt: { fontSize: 13, fontWeight: '600', color: c.textBody },
  notifTimeChipTxtActive: { color: c.white },
  notifText: { flex: 1, paddingRight: 12 },
  notifLabel: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  notifDesc: { fontSize: 12, color: c.textMuted, marginTop: 2 },

  // Spending modal
  currencyChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: c.borderTeal, backgroundColor: c.bgInputMid },
  currencyChipSelected: { borderColor: c.primary, backgroundColor: c.bgTeal },
  currencyChipTxt: { fontSize: 13, fontWeight: '600', color: c.textBody },
  currencyChipTxtSelected: { color: c.primary },
  spendingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  spendingChip: { width: '30.5%', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: c.borderTeal, backgroundColor: c.bgInputMid, alignItems: 'center' },
  spendingChipSelected: { borderColor: c.primary, backgroundColor: c.bgTeal },
  spendingChipTxt: { fontSize: 14, fontWeight: '600', color: c.textBody },
  spendingChipTxtSelected: { color: c.primary },
  spendingCustomLabel: { fontSize: 13, color: c.textBody, marginBottom: 10 },
  contactModalInput: {
    flex: 0, borderWidth: 1.5, borderColor: c.borderMid, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.bgInput,
  },
  contactPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: c.primary, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'stretch', justifyContent: 'center',
    backgroundColor: c.bgTealDeep,
  },
  contactPickerBtnTxt: { fontSize: 14, fontWeight: '600', color: c.primary },
  permStepBox: { gap: 10, backgroundColor: c.bgInputMid, borderRadius: 14, padding: 14 },
  permStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  permStepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  permStepNumTxt: { fontSize: 12, fontWeight: '700', color: c.white },
  permStepTxt: { flex: 1, fontSize: 13, color: c.textBody, lineHeight: 20 },
  permStepBold: { fontWeight: '700', color: c.textPrimary },
  goalIconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  goalIconChip: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bgElement, borderWidth: 1.5, borderColor: 'transparent' },
  goalIconChipActive: { borderColor: c.primary, backgroundColor: c.bgTeal },
  goalIconChipEmoji: { fontSize: 22 },
  spendingInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.borderMid, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.bgInput },
  spendingSymbol: { fontSize: 16, color: c.textBody, marginRight: 6 },
  spendingInput: { flex: 1, fontSize: 15, color: c.textPrimary },
  spendingPerWk: { fontSize: 13, color: c.textMuted, marginLeft: 6 },

  // Edit field modal
  editFieldSheet: {
    backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  editCenterSheet: {
    backgroundColor: c.bgCard, borderRadius: 20,
    padding: 20, paddingBottom: 24, width: '100%', maxHeight: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 24,
  },
  editFieldTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 16 },
  editFieldOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  editFieldOptionSelected: { backgroundColor: c.bgTealDeep },
  editFieldEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  editFieldLabel: { flex: 1, fontSize: 15, color: c.textSecondary, fontWeight: '500' },
  editFieldLabelSelected: { color: c.primary, fontWeight: '600' },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: c.textDisabled,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: c.primary, borderColor: c.primary },
  checkmark: { fontSize: 13, color: c.white, fontWeight: '700' },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: c.textDisabled,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: c.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary },

  // iOS modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.overlay },
  modalSheet: { backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: c.bgElement },
  modalBtnCancel: { fontSize: 15, color: c.textBody, fontWeight: '600' },
  modalBtnSave: { backgroundColor: c.primary },
  modalBtnSaveTxt: { fontSize: 15, color: c.white, fontWeight: '700' },
  thankYouDoneBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', alignSelf: 'stretch' },
  thankYouDoneBtnTxt: { fontSize: 15, color: c.white, fontWeight: '700' },

  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay, padding: 24 },
  confirmSheet: {
    backgroundColor: c.bgCard, borderRadius: 22, padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  confirmIconRow: { alignItems: 'center', marginBottom: 12 },
  confirmIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: c.bgError, borderWidth: 1.5, borderColor: c.borderError,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 21, marginBottom: 4 },
  milestoneTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, marginBottom: 10 },
  milestoneTypeBtn: {
    width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: c.bgElement, borderWidth: 1.5, borderColor: 'transparent',
  },
  milestoneTypeBtnSelected: { borderColor: c.primary, backgroundColor: c.bgTeal },
  milestoneTypeEmoji: { fontSize: 17 },
  milestoneTypeLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  milestoneTypeLabelSelected: { color: c.primary },
  milestoneInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  milestoneIconTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1.5, borderColor: c.borderLight, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 10, backgroundColor: c.bgElement,
  },
  milestoneIconTriggerOpen: { borderColor: c.primary, backgroundColor: c.bgTeal },
  milestoneIconChevron: { fontSize: 9, color: c.textFaint, marginTop: 1 },
  milestoneInput: {
    flex: 1, borderWidth: 1.5, borderColor: c.borderLight, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12, fontSize: 20, fontWeight: '700',
    color: c.textPrimary, textAlign: 'center', backgroundColor: c.bgElement,
  },
  milestoneInputUnit: { fontSize: 13, fontWeight: '600', color: c.textMuted, flexShrink: 1 },
  milestoneIconScroll: { marginTop: 8, marginHorizontal: -4 },
  milestoneIconScrollContent: { paddingHorizontal: 4, gap: 5, paddingVertical: 2 },
  milestoneIconBtn: { width: 36, height: 36, borderRadius: 9, backgroundColor: c.bgElement, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  milestoneIconBtnSelected: { borderColor: c.primary, backgroundColor: c.bgTeal },
  milestoneIconEmoji: { fontSize: 18 },
  confirmBold: { fontWeight: '700', color: c.textSecondary },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.bgElement },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  confirmDelete: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.error },
  confirmDeleteTxt: { color: c.white, fontWeight: '700', fontSize: 15 },
  confirmSave: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.primary },
  confirmSaveTxt: { color: c.white, fontWeight: '700', fontSize: 15 },

  settingsDivider: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 4 },

  resetSheet: { backgroundColor: c.bgCard, borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 },
  resetSheetTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  resetSheetSub: { fontSize: 13, color: c.textMuted, marginBottom: 20 },
  resetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  resetRowLabel: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
  resetRowDesc: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  resetDivider: { height: 1, backgroundColor: c.borderSubtle },
  resetNuclearSep: { height: 1, backgroundColor: c.bgErrorMid, marginVertical: 8 },
  resetNuclearRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  resetNuclearLabel: { fontSize: 15, fontWeight: '700', color: c.error },
  resetCancelBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: c.bgElement, alignItems: 'center' },
  resetCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },

  resetConfirmSheet: { backgroundColor: c.bgCard, borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' },
  resetConfirmIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.bgErrorMid, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  resetConfirmTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  resetConfirmBody: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  resetConfirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
  resetConfirmCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.bgElement, alignItems: 'center' },
  resetConfirmCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  resetConfirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.error, alignItems: 'center' },
  resetConfirmBtnTxt: { fontSize: 15, fontWeight: '700', color: c.white },

  // Premium subscription card
  premiumCard: {
    borderRadius: 16, padding: 18,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  premiumCardInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  premiumCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  premiumIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  premiumCardTitle: { fontSize: 16, fontWeight: '700', color: c.white },
  premiumCardSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  manageSub: {
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  manageSubTxt: { fontSize: 13, fontWeight: '700', color: c.white },

  // Settings / support menu cards
  menuCard: { backgroundColor: c.bgCard, borderRadius: 14, overflow: 'hidden' },
  menuCardTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
  menuIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  menuIconWrapRed: { backgroundColor: c.bgErrorMid },
  menuRowLabel: { flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
  menuRowValue: { fontSize: 14, color: c.textMuted, fontWeight: '500', marginRight: 4 },
  menuDivider: { height: 1, backgroundColor: c.borderSubtle, marginHorizontal: 16 },

  // Theme segment control (appearance row)
  themeSegment: { flexDirection: 'row', backgroundColor: c.bgElement, borderRadius: 8, padding: 2 },
  themeSegBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
  themeSegBtnActive: { backgroundColor: c.bgCard, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  themeSegTxt: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  themeSegTxtActive: { color: c.textPrimary },

  // Restore purchases link
  restoreLink: { alignItems: 'center', paddingTop: 10 },
  restoreLinkTxt: { fontSize: 13, color: c.primary },

  // Footer note
  footerNote: { alignItems: 'center', paddingVertical: 6, gap: 4 },
  footerVersion: { fontSize: 12, color: c.textDisabled },
  footerTagline: { fontSize: 12, color: c.textFaint, fontStyle: 'italic', textAlign: 'center' },

  // Call button next to trusted contact
  callBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center',
  },

  // Danger zone card (sign out + delete account)
  dangerCard: { backgroundColor: c.bgCard, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.bgErrorMid },
  dangerRowLabel: { color: c.error },

  // Someone in your corner
  partnerDesc: { fontSize: 13, color: c.textBody, lineHeight: 19, marginBottom: 14 },
  partnerLinkUrl: { fontSize: 12, color: c.textMuted, flex: 1 },
  partnerHint: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginTop: 6 },
  partnerShareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13 },
  partnerShareBtnTxt: { fontSize: 15, fontWeight: '700', color: c.white },
  partnerUrlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: c.bgElement, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  partnerRevokeLink: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  partnerRevokeLinkTxt: { fontSize: 12, color: c.error },
  partnerLockedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  partnerLockedTxt: { fontSize: 12, color: c.textMuted },
  partnerLockedBtn: { backgroundColor: c.bgElement },
  partnerLockedBtnTxt: { fontSize: 14, fontWeight: '600', color: c.primary },
  shareSettingsBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: c.bgElement, paddingTop: 12, gap: 2 },
  shareSettingsTitle: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  shareSettingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  shareSettingLabel: { fontSize: 14, color: c.textBody },
  shareAlwaysTxt: { fontSize: 12, color: c.textFaint },
  shareCollapseLabel: { fontSize: 13, fontWeight: '600', color: c.textBody },
  shareNotifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.bgElement },
  shareNotifyChips: { flexDirection: 'row', gap: 5 },
  shareNotifyChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: c.bgElement },
  shareNotifyChipOn: { backgroundColor: c.primary },
  shareNotifyChipTxt: { fontSize: 12, fontWeight: '500', color: c.textMuted },
  shareNotifyChipTxtOn: { color: c.white },
  shareHint: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginTop: 5, marginBottom: 2 },

  // Recovery plan card
  planSummary: { gap: 10, marginBottom: 14 },
  planChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  planChip: {
    width: '48.5%',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.bgTealDeep, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: c.primaryLight,
  },
  planChipEmoji: { fontSize: 16 },
  planChipLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: c.primary, lineHeight: 18 },
  planMantraBox: {
    backgroundColor: c.bgTealDeep, borderRadius: 12, padding: 14,
    borderLeftWidth: 3, borderLeftColor: c.primary,
  },
  planMantraLabel: { fontSize: 11, fontWeight: '700', color: c.primary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  planMantraText: { fontSize: 14, color: c.textBody, fontStyle: 'italic', lineHeight: 20 },
  planEditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12,
  },
  planEditBtnTxt: { fontSize: 14, fontWeight: '600', color: c.white },

  // Recovery plan modal
  planOptionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  planOption: {
    width: '48.5%',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: c.bgInputMid, borderRadius: 14,
    borderWidth: 1.5, borderColor: c.borderTeal,
  },
  planOptionSelected: { backgroundColor: c.bgTeal, borderColor: c.primary },
  planOptionEmoji: { fontSize: 16 },
  planOptionLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: c.textBody, lineHeight: 18 },
  planOptionLabelSelected: { color: c.primary },
  planMantraInput: {
    borderWidth: 1.5, borderColor: c.borderLight, borderRadius: 10,
    padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 64,
  },
  planDropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: c.borderLight, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, backgroundColor: c.bgInputMid,
  },
  planDropdownLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 3 },
  planDropdownValue: { fontSize: 13, color: c.primary, fontWeight: '500' },
  planDropdownPlaceholder: { fontSize: 13, color: c.textFaint, fontStyle: 'italic' },
});
