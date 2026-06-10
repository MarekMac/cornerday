import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY, MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY, CHECKLIST_KEY, SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY, GOAL_ICONS, TRUSTED_CONTACT_KEY, MOTIVATION_PHOTO_KEY } from '@/constants/storage-keys';
import { GAME_BESTS_STORAGE_KEY } from '@/lib/useGameBests';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user';
import { generateUsername } from '@/lib/usernameGenerator';
import * as Notifications from 'expo-notifications';
import {
  DEFAULT_NOTIF_PREFS,
  NotifPrefs,
  requestNotificationPermissions,
  scheduleAllNotifications,
} from '@/lib/notifications';
import { usePurchases } from '@/context/purchases';
import Purchases from 'react-native-purchases';
import { ENTITLEMENT_ID } from '@/constants/revenuecat';

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

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [quitTimestamp, setQuitTimestamp] = useState<string | null>(null);
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  const [exportLoading, setExportLoading] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const emailCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactNameInput, setContactNameInput] = useState('');
  const [contactPhoneInput, setContactPhoneInput] = useState('');

  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);
  const [confirmQuitDate, setConfirmQuitDate] = useState<Date | null>(null);
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [resetDataModalVisible, setResetDataModalVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pendingReset, setPendingReset] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [sendingPassReset, setSendingPassReset] = useState(false);
  const [showContactsPermModal, setShowContactsPermModal] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'general'>('general');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [thankYouVisible, setThankYouVisible] = useState(false);
  const [restoringPurchases, setRestoringPurchases] = useState(false);
  const [isPasswordUser, setIsPasswordUser] = useState(true);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const identities = user.identities ?? [];
    setIsPasswordUser(identities.some(id => id.provider === 'email'));
    const [{ data }, { data: streakData }, { data: savingsRows }] = await Promise.all([
      supabase
        .from('users')
        .select('display_name, quit_timestamp, quit_date, motivation, trigger, goal, support_type, weekly_bet, currency, is_premium, avatar_url, notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching')
        .eq('id', user.id)
        .single(),
      supabase.from('streaks').select('longest_streak').eq('user_id', user.id).single(),
      supabase.from('losses').select('amount').eq('user_id', user.id).eq('type', 'saving'),
    ]);
    const quitTs = data?.quit_timestamp ?? data?.quit_date;
    const streakDays = quitTs ? Math.max(0, Date.now() - new Date(quitTs).getTime()) / 86400000 : 0;
    const MILESTONE_DAYS = [0, 1/24, 3/24, 6/24, 12/24, 1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 365, 548, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650];
    const badgeCount = MILESTONE_DAYS.filter(d => streakDays >= d).length;
    setTotalManualSavings((savingsRows ?? []).reduce((s, r) => s + Number(r.amount), 0));
    const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
    let resolvedAvatar = data?.avatar_url ?? null;
    if (!resolvedAvatar && googleAvatar) {
      resolvedAvatar = googleAvatar;
      await supabase.from('users').update({ avatar_url: googleAvatar }).eq('id', user.id);
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
      milestonesEarned: badgeCount ?? 0,
    });
    setQuitTimestamp(data?.quit_timestamp ?? data?.quit_date ?? null);

    // Trusted contact lives in its own query so a schema-cache miss never breaks the profile fetch
    const { data: contactData } = await supabase
      .from('users')
      .select('trusted_contact_name, trusted_contact_phone')
      .eq('id', user.id)
      .single();
    if (contactData?.trusted_contact_name || contactData?.trusted_contact_phone) {
      setTrustedContactName(contactData.trusted_contact_name ?? '');
      setTrustedContactPhone(contactData.trusted_contact_phone ?? '');
    }
    setNotifPrefs({
      notif_milestone: data?.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
      notif_daily_streak: data?.notif_daily_streak ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
      notif_daily_checkin: data?.notif_daily_checkin ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
      notif_weekly_summary: data?.notif_weekly_summary ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
      notif_milestone_approaching: data?.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
    });
    setGlobalAvatarUrl(resolvedAvatar);
    return () => { if (emailCopyTimerRef.current) clearTimeout(emailCopyTimerRef.current); };
  }, []);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
    Promise.all([
      AsyncStorage.getItem(SAVINGS_GOAL_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
      AsyncStorage.getItem(TRUSTED_CONTACT_KEY),
    ]).then(([rawGoal, rawFor, rawIcon, rawContact]) => {
      if (rawGoal) setSavingsGoal(Number(rawGoal));
      if (rawFor) setSavingsGoalFor(rawFor);
      if (rawIcon) setSavingsGoalIcon(rawIcon);
      if (rawContact) {
        const c = JSON.parse(rawContact);
        setTrustedContactName(c.name ?? '');
        setTrustedContactPhone(c.phone ?? '');
      }
    });
  }, [fetchProfile]);

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

  const openGoalModal = () => {
    setGoalInput(savingsGoal ? String(savingsGoal) : '');
    setGoalForInput(savingsGoalFor);
    setGoalIconInput(savingsGoalIcon);
    setShowGoalModal(true);
  };
  const closeGoalModal = () => {
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
    if (goalInput && (isNaN(val) || val <= 0)) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
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
    if (!name && !phone) {
      await AsyncStorage.removeItem(TRUSTED_CONTACT_KEY);
      setTrustedContactName('');
      setTrustedContactPhone('');
    } else {
      await AsyncStorage.setItem(TRUSTED_CONTACT_KEY, JSON.stringify({ name, phone }));
      setTrustedContactName(name);
      setTrustedContactPhone(phone);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({
        trusted_contact_name: name || null,
        trusted_contact_phone: phone || null,
      }).eq('id', user.id);
    }
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const value = config.multi ? editModalSelections.join(',') : (editModalSelections[0] ?? '');
      await supabase.from('users').update({ [config.dbField]: value }).eq('id', user.id);
      setProfile(prev => {
        if (!prev) return prev;
        if (editField === 'motivation') return { ...prev, motivation: value };
        if (editField === 'trigger') return { ...prev, trigger: value };
        if (editField === 'goal') return { ...prev, goal: value };
        return { ...prev, supportType: value };
      });
    }
    setSavingField(false);
    setEditField(null);
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
    const value = spendingCustom.trim() ? spendingCustom.trim() : spendingChip || null;
    setSavingSpending(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ weekly_bet: value, currency: spendingCurrency }).eq('id', user.id);
      setProfile(prev => prev ? { ...prev, weeklyBet: value, currency: spendingCurrency } : prev);
    }
    setSavingSpending(false);
    setShowSpendingModal(false);
  };

  const handleAvatarPress = () => {
    if (profile?.avatarUrl) {
      setAvatarMenuVisible(true);
    } else {
      pickAvatar();
    }
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
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
    if (result.canceled) return;

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

      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id);
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
    }
    setUploadingAvatar(false);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ display_name: trimmed }).eq('id', user.id);
      setProfile(prev => prev ? { ...prev, displayName: trimmed } : prev);
    }
    setSavingName(false);
    setEditingName(false);
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
      onValueChange: (_evt: any, rawDate?: Date) => {
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
          onValueChange: (_tevt: any, rawTime?: Date) => {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const now = new Date();
      const clamped = date > now ? now : date;
      const iso = clamped.toISOString();
      const dateOnly = iso.split('T')[0];
      await supabase.from('users').update({
        quit_timestamp: iso,
        quit_date: dateOnly,
      }).eq('id', user.id);
      await Promise.all([
        supabase.from('streaks').update({ streak_start_date: dateOnly, current_streak: 0 }).eq('user_id', user.id),
        supabase.from('badges').delete().eq('user_id', user.id),
        AsyncStorage.removeItem(MILESTONE_NOTIFS_KEY),
      ]);
      await supabase.from('losses').insert({
        user_id: user.id, type: 'quit_date_changed', amount: 0,
        category: 'Account', note: iso,
      });
      setProfile(prev => prev ? { ...prev, quitTimestamp: iso } : prev);
    }
    setSaving(false);
  };


  const resetJournal = async () => {
    setResetting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await Promise.all([
        supabase.from('urge_journal').delete().eq('user_id', user.id),
        supabase.from('mood_checkins').delete().eq('user_id', user.id),
      ]);
    }
    setResetting(false);
  };

  const resetMilestones = async () => {
    setResetting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('badges').delete().eq('user_id', user.id);
    await Promise.all([
      AsyncStorage.removeItem(MILESTONE_NOTIFS_KEY),
      AsyncStorage.removeItem(CHECKLIST_BADGE_SENT_KEY),
      AsyncStorage.removeItem(GOAL_SET_BADGE_SENT_KEY),
      AsyncStorage.removeItem(GOAL_REACHED_BADGE_SENT_KEY),
      AsyncStorage.removeItem(CHECKLIST_KEY),
    ]);
    await scheduleAllNotifications(notifPrefs, quitTimestamp, []);
    setResetting(false);
  };

  const resetLossTracker = async () => {
    setResetting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await Promise.all([
        supabase.from('losses').delete().eq('user_id', user.id),
        supabase.from('debts').delete().eq('user_id', user.id),
        supabase.from('debt_payments').delete().eq('user_id', user.id),
      ]);
    }
    setResetting(false);
  };

  const resetGameScores = async () => {
    setResetting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('game_scores').delete().eq('user_id', user.id);
    await AsyncStorage.removeItem(GAME_BESTS_STORAGE_KEY);
    setResetting(false);
  };

  const resetEverything = async () => {
    setResetting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const nowIso = new Date().toISOString();
      await Promise.all([
        supabase.from('mood_checkins').delete().eq('user_id', user.id),
        supabase.from('urge_journal').delete().eq('user_id', user.id),
        supabase.from('badges').delete().eq('user_id', user.id),
        supabase.from('losses').delete().eq('user_id', user.id),
        supabase.from('debts').delete().eq('user_id', user.id),
        supabase.from('debt_payments').delete().eq('user_id', user.id),
        supabase.from('game_scores').delete().eq('user_id', user.id),
        supabase.from('users').update({ quit_date: today, quit_timestamp: nowIso }).eq('id', user.id),
        supabase.from('streaks').update({ current_streak: 0, longest_streak: 0, streak_start_date: today }).eq('user_id', user.id),
        AsyncStorage.removeItem(MILESTONE_NOTIFS_KEY),
        AsyncStorage.removeItem(CHECKLIST_BADGE_SENT_KEY),
        AsyncStorage.removeItem(GOAL_SET_BADGE_SENT_KEY),
        AsyncStorage.removeItem(GOAL_REACHED_BADGE_SENT_KEY),
        AsyncStorage.removeItem(CHECKLIST_KEY),
        AsyncStorage.removeItem(SAVINGS_GOAL_KEY),
        AsyncStorage.removeItem(SAVINGS_GOAL_FOR_KEY),
        AsyncStorage.removeItem(SAVINGS_GOAL_ICON_KEY),
        AsyncStorage.removeItem(GAME_BESTS_STORAGE_KEY),
      ]);
      // Seed journal with a fresh start entry
      await supabase.from('losses').insert({
        user_id: user.id, type: 'journey_started', amount: 0, note: null, created_at: nowIso,
      });
      setQuitTimestamp(nowIso);
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleAllNotifications(notifPrefs, nowIso, []);
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
    setResetting(false);
  };

  const confirmReset = (title: string, body: string, onConfirm: () => void) => {
    setPendingReset({ title, body, onConfirm });
  };

  const confirmDeleteAccount = () => setDeleteAccountVisible(true);

  const executeDeleteAccount = async () => {
    setSigningOut(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await Promise.all([
          supabase.from('losses').delete().eq('user_id', user.id),
          supabase.from('streaks').delete().eq('user_id', user.id),
          supabase.from('badges').delete().eq('user_id', user.id),
          supabase.from('mood_checkins').delete().eq('user_id', user.id),
          supabase.from('urge_journal').delete().eq('user_id', user.id),
          supabase.from('debt_payments').delete().eq('user_id', user.id),
          supabase.from('debts').delete().eq('user_id', user.id),
        ]);
        if (profile?.avatarUrl) {
          const oldPath = profile.avatarUrl.split('/avatars/')[1]?.split('?')[0];
          if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
        }
        await supabase.from('users').delete().eq('id', user.id);
        try { await supabase.functions.invoke('delete-account'); } catch {}
        await AsyncStorage.multiRemove([
          ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY,
          MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY, CHECKLIST_KEY,
          SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY,
          TRUSTED_CONTACT_KEY, MOTIVATION_PHOTO_KEY,
        ]);
      }
    } finally {
      await supabase.auth.signOut();
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => setSignOutVisible(true);

  const executeSignOut = async () => {
    setSigningOut(true);
    await AsyncStorage.multiRemove([
      ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY,
      MILESTONE_NOTIFS_KEY, CHECKLIST_BADGE_SENT_KEY, GOAL_SET_BADGE_SENT_KEY, GOAL_REACHED_BADGE_SENT_KEY, CHECKLIST_KEY,
      SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY,
      TRUSTED_CONTACT_KEY, MOTIVATION_PHOTO_KEY,
    ]);
    await supabase.auth.signOut();
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, lossesRes, moodRes, streakRes, badgesRes] = await Promise.all([
        supabase.from('users').select('display_name, quit_timestamp, motivation, goal, trigger, support_type, weekly_bet, currency').eq('id', user.id).single(),
        supabase.from('losses').select('type, amount, category, note, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('mood_checkins').select('mood, note, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('streaks').select('current_streak, longest_streak, streak_start_date').eq('user_id', user.id).single(),
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
        `Current streak: ${st?.current_streak ?? 0} days`,
        `Longest streak: ${st?.longest_streak ?? 0} days`,
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

  const handleChangePassword = () => setShowPassModal(true);

  const sendPasswordReset = async () => {
    const email = profile?.email;
    if (!email) return;
    setSendingPassReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setSendingPassReset(false);
    setShowPassModal(false);
    if (error) {
      Alert.alert('Error', 'Could not send reset email. Please try again.');
    } else {
      Alert.alert('Check your inbox', `A password reset link has been sent to ${email}.`);
    }
  };

  const handleNotifToggle = async (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ [key]: value }).eq('id', user.id);
      const granted = await requestNotificationPermissions();
      if (granted) await scheduleAllNotifications(updated, quitTimestamp);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0F6E6E" />
      </View>
    );
  }

  const initials = (profile?.displayName ?? profile?.email ?? '?')[0].toUpperCase();
  const quitFormatted = formatQuitDate(profile?.quitTimestamp ?? null);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const streakDisplay = (() => {
    if (!profile?.quitTimestamp) return { value: '0', unit: 'days' };
    const ms = Math.max(0, Date.now() - new Date(profile.quitTimestamp).getTime());
    const days = Math.floor(ms / 86400000);
    if (days >= 1) return { value: String(days), unit: 'days' };
    const hours = Math.floor(ms / 3600000);
    if (hours >= 1) return { value: String(hours), unit: hours === 1 ? 'hour' : 'hours' };
    const mins = Math.floor(ms / 60000);
    return { value: String(Math.max(1, mins)), unit: mins <= 1 ? 'min' : 'mins' };
  })();

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Account</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>

        {/* Profile card */}
        <View style={s.profileCard}>
          <Pressable onPress={handleAvatarPress} style={({ pressed }) => [s.avatar, pressed && { opacity: 0.8 }]}>
            {profile?.avatarUrl
              ? <Image source={{ uri: profile.avatarUrl }} style={s.avatarImg} />
              : <Text style={s.avatarTxt}>{initials}</Text>}
            {uploadingAvatar && (
              <View style={s.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <View style={s.avatarEditBadge}>
              <Text style={s.avatarEditBadgeTxt}>✎</Text>
            </View>
          </Pressable>
          {editingName ? (
            <View style={s.nameEditRow}>
              <TextInput
                style={s.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your name"
                placeholderTextColor="#aaa"
                autoFocus
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <Pressable onPress={() => setNameInput(generateUsername())} style={({ pressed }) => [s.nameShuffleBtn, pressed && { opacity: 0.6 }]} hitSlop={6}>
                <Ionicons name="shuffle-outline" size={16} color="#0F6E6E" />
              </Pressable>
              <Pressable onPress={saveName} disabled={savingName} style={({ pressed }) => [s.nameSaveBtn, pressed && { opacity: 0.7 }]}>
                {savingName
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.nameSaveTxt}>Save</Text>}
              </Pressable>
              <Pressable onPress={() => setEditingName(false)} style={({ pressed }) => [s.nameCancelBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.nameCancelTxt}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={s.nameRow}
              onPress={() => { setNameInput(profile?.displayName ?? profile?.email?.split('@')[0] ?? ''); setEditingName(true); }}>
              <Text style={s.displayName}>{profile?.displayName ?? profile?.email?.split('@')[0] ?? 'Anonymous'}</Text>
              <View style={s.nameEditHint}><Text style={s.nameEditHintTxt}>Edit</Text></View>
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
            style={s.emailRow}>
            <Text style={s.email}>{profile?.email}</Text>
            <Ionicons
              name={emailCopied ? 'checkmark' : 'copy-outline'}
              size={13}
              color={emailCopied ? '#0F6E6E' : '#bbb'}
            />
          </Pressable>
          <View style={s.profileSubRow}>
            {isAdmin ? (
              <View style={s.profileSubLeft}>
                <Text style={s.profileAdminBadge}>👑 Admin</Text>
              </View>
            ) : isPremiumFromRC ? (
              <>
                <View style={s.profileSubLeft}>
                  <Text style={s.profileSubBadge}>✨ Premium</Text>
                  {renewalDate ? <Text style={s.profileSubMeta}>Renews {renewalDate}</Text> : null}
                </View>
                <Pressable
                  style={({ pressed }) => [s.profileSubBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions')}>
                  <Text style={s.profileSubBtnTxt}>Manage</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={s.profileSubLeft}>
                  <Text style={s.profileSubFree}>Free plan</Text>
                  {restoringPurchases
                    ? <ActivityIndicator size="small" color="#0F6E6E" style={{ marginTop: 2 }} />
                    : <Pressable onPress={async () => { setRestoringPurchases(true); await restorePurchases(); setRestoringPurchases(false); }}>
                        <Text style={s.profileSubRestore}>Already purchased? Restore</Text>
                      </Pressable>}
                </View>
                <Pressable
                  style={({ pressed }) => [s.profileUpgradeBtn, pressed && { opacity: 0.85 }]}
                  onPress={showPaywall}>
                  <Text style={s.profileUpgradeBtnTxt}>Upgrade</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsCard}>
          <View style={s.statCol}>
            <Text style={s.statValue}>{streakDisplay.value}</Text>
            <Text style={s.statLabel}>Current streak</Text>
            <Text style={s.statUnit}>{streakDisplay.unit}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCol}>
            <Text style={s.statValue}>{profile?.longestStreak ?? 0}</Text>
            <Text style={s.statLabel}>Longest streak</Text>
            <Text style={s.statUnit}>days</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCol}>
            <Text style={s.statValue}>{profile?.milestonesEarned ?? 0}</Text>
            <Text style={s.statLabel}>Milestones</Text>
            <Text style={s.statUnit}>earned</Text>
          </View>
        </View>

        {/* Your recovery */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>Your recovery</Text>
          {quitFormatted && (
            <>
              <Pressable
                onPress={openEdit}
                disabled={saving}
                style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
                <View style={s.infoItemMain}>
                  <Text style={s.infoItemLabel}>Started</Text>
                  {saving
                    ? <ActivityIndicator size="small" color="#0F6E6E" style={{ alignSelf: 'flex-start' }} />
                    : <Text style={s.infoItemValue}>{quitFormatted}</Text>}
                </View>
                <Ionicons name="pencil-outline" size={15} color="#aaa" />
              </Pressable>
              <View style={s.infoDivider} />
            </>
          )}
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
            <Ionicons name="pencil-outline" size={15} color="#aaa" />
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
            <Ionicons name="pencil-outline" size={15} color="#aaa" />
          </Pressable>
          <View style={s.infoDivider} />
          <Pressable
            onPress={openContactModal}
            style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
            <View style={s.infoItemMain}>
              <Text style={s.infoItemLabel}>Trusted contact</Text>
              <Text style={[s.infoItemValue, !trustedContactName && s.infoValueEmpty]}>
                {trustedContactName
                  ? `${trustedContactName}${trustedContactPhone ? ` · ${trustedContactPhone}` : ''}`
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
                  <Ionicons name="call-outline" size={16} color="#0F6E6E" />
                </Pressable>
              ) : null}
              <Ionicons name="pencil-outline" size={15} color="#aaa" />
            </View>
          </Pressable>
        </View>

        {/* Recovery profile */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>Recovery profile</Text>
          {(['motivation', 'trigger', 'goal', 'support'] as FieldKey[]).map((field, idx) => {
            const config = FIELD_CONFIG[field];
            const raw = field === 'motivation' ? profile?.motivation
              : field === 'trigger' ? profile?.trigger
              : field === 'goal' ? profile?.goal
              : profile?.supportType;
            const display = getDisplayLabel(config.options, raw ?? null);
            return (
              <View key={field}>
                {idx > 0 && <View style={s.infoDivider} />}
                <Pressable
                  onPress={() => openFieldModal(field)}
                  style={({ pressed }) => [s.infoItem, pressed && { opacity: 0.7 }]}>
                  <View style={s.infoItemMain}>
                    <Text style={s.infoItemLabel}>{config.label}</Text>
                    <Text style={[s.infoItemValue, !display && s.infoValueEmpty]}>
                      {display ?? 'Not set'}
                    </Text>
                  </View>
                  <Ionicons name="pencil-outline" size={15} color="#aaa" />
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Admin section */}
        {isAdmin && (
          <View style={s.menuCard}>
            <Text style={s.menuCardTitle}>Administration</Text>
            <Pressable
              style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/moderation')}>
              <View style={s.menuIconWrap}>
                <Ionicons name="shield-outline" size={17} color="#0F6E6E" />
              </View>
              <Text style={s.menuRowLabel}>Admin Panel</Text>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </Pressable>
          </View>
        )}

        {/* Settings */}
        <View style={s.menuCard}>
          <Text style={s.menuCardTitle}>Settings</Text>
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => setNotifModalVisible(true)}>
            <View style={s.menuIconWrap}>
              <Ionicons name="notifications-outline" size={17} color="#0F6E6E" />
            </View>
            <Text style={s.menuRowLabel}>Notifications</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
          {isPasswordUser && (
            <>
              <View style={s.menuDivider} />
              <Pressable
                style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
                onPress={handleChangePassword}>
                <View style={s.menuIconWrap}>
                  <Ionicons name="key-outline" size={17} color="#0F6E6E" />
                </View>
                <Text style={s.menuRowLabel}>Change password</Text>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </Pressable>
            </>
          )}
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/(tabs)/urge/checklist')}>
            <View style={s.menuIconWrap}>
              <Ionicons name="checkmark-done-outline" size={17} color="#0F6E6E" />
            </View>
            <Text style={s.menuRowLabel}>Prevention checklist</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => setResetDataModalVisible(true)}>
            <View style={[s.menuIconWrap, s.menuIconWrapRed]}>
              <Ionicons name="refresh-outline" size={17} color="#c0392b" />
            </View>
            <Text style={[s.menuRowLabel, { color: '#c0392b' }]}>Reset data</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
        </View>

        {/* Support & about */}
        <View style={s.menuCard}>
          <Text style={s.menuCardTitle}>Support & about</Text>
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={handleExport}
            disabled={exportLoading}>
            <View style={s.menuIconWrap}>
              {exportLoading
                ? <ActivityIndicator size="small" color="#0F6E6E" />
                : <Ionicons name="download-outline" size={17} color="#0F6E6E" />}
            </View>
            <Text style={s.menuRowLabel}>Export my data</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => { setFeedbackMsg(''); setFeedbackType('general'); setFeedbackVisible(true); }}>
            <View style={s.menuIconWrap}>
              <Ionicons name="chatbubble-outline" size={17} color="#0F6E6E" />
            </View>
            <Text style={s.menuRowLabel}>Send feedback</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
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
              <Ionicons name="star-outline" size={17} color="#0F6E6E" />
            </View>
            <Text style={s.menuRowLabel}>Rate CornerDay</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/terms')}>
            <View style={s.menuIconWrap}>
              <Ionicons name="document-text-outline" size={17} color="#0F6E6E" />
            </View>
            <Text style={s.menuRowLabel}>Terms of Use</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/privacy-policy')}>
            <View style={s.menuIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={17} color="#0F6E6E" />
            </View>
            <Text style={s.menuRowLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
        </View>

        {/* Footer */}
        <View style={s.footerNote}>
          <Text style={s.footerVersion}>CornerDay v{appVersion}</Text>
          <Text style={s.footerTagline}>Every day you hold on is a victory.</Text>
        </View>

        {/* Danger zone */}
        <View style={s.dangerCard}>
          <Text style={s.menuCardTitle}>Account</Text>
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={confirmSignOut}
            disabled={signingOut}>
            <View style={[s.menuIconWrap, s.menuIconWrapRed]}>
              <Ionicons name="log-out-outline" size={17} color="#c0392b" />
            </View>
            {signingOut
              ? <ActivityIndicator color="#c0392b" size="small" style={{ flex: 1 }} />
              : <Text style={[s.menuRowLabel, s.dangerRowLabel]}>Sign out</Text>}
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.7 }]}
            onPress={confirmDeleteAccount}
            disabled={signingOut}>
            <View style={[s.menuIconWrap, s.menuIconWrapRed]}>
              <Ionicons name="trash-outline" size={17} color="#c0392b" />
            </View>
            <Text style={[s.menuRowLabel, s.dangerRowLabel]}>Delete account</Text>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Savings goal modal */}
      <Modal visible={showGoalModal} transparent animationType="fade" onRequestClose={closeGoalModal}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={s.confirmOverlay} onPress={closeGoalModal}>
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
              <Text style={s.spendingCustomLabel}>What are you saving for? <Text style={{ fontWeight: '400', color: '#aaa' }}>(optional)</Text></Text>
              <TextInput
                style={s.spendingInput}
                placeholder="e.g. Holiday, New car, Emergency fund"
                placeholderTextColor="#bbb"
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
                  placeholderTextColor="#bbb"
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
                  <Text style={{ color: '#c0392b', fontSize: 13 }}>Remove goal</Text>
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
              <Ionicons name="person-add-outline" size={16} color="#0F6E6E" />
              <Text style={s.contactPickerBtnTxt}>Choose from contacts</Text>
            </Pressable>
            <Text style={[s.spendingCustomLabel, { marginBottom: 8, marginTop: 16 }]}>Their name</Text>
            <TextInput
              style={[s.spendingInput, { flex: 0, marginBottom: 16 }]}
              value={contactNameInput}
              onChangeText={setContactNameInput}
              placeholder="e.g. Mum, John"
              placeholderTextColor="#bbb"
              autoCapitalize="words"
            />
            <Text style={[s.spendingCustomLabel, { marginBottom: 8 }]}>Phone number</Text>
            <TextInput
              style={[s.spendingInput, { flex: 0, marginBottom: 24 }]}
              value={contactPhoneInput}
              onChangeText={setContactPhoneInput}
              placeholder="+1 555 000 0000"
              placeholderTextColor="#bbb"
              keyboardType="phone-pad"
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
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) await supabase.from('users').update({ trusted_contact_name: null, trusted_contact_phone: null }).eq('id', user.id);
                  setShowContactModal(false);
                }}>
                <Text style={{ color: '#c0392b', fontSize: 13 }}>Remove contact</Text>
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
                placeholderTextColor="#bbb"
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
                  ? <ActivityIndicator color="#fff" size="small" />
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
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalBtnSaveTxt}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change password modal */}
      <Modal visible={showPassModal} transparent animationType="fade" onRequestClose={() => setShowPassModal(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setShowPassModal(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={[s.confirmIconCircle, { backgroundColor: '#f0fafa', borderColor: '#c0e8e8' }]}>
                <Ionicons name="key-outline" size={26} color="#0F6E6E" />
              </View>
            </View>
            <Text style={s.confirmTitle}>Change password</Text>
            <Text style={[s.confirmBody, { textAlign: 'center', marginBottom: 4 }]}>
              We'll send a reset link to
            </Text>
            <Text style={[s.confirmBody, { textAlign: 'center', fontWeight: '600', color: '#0F6E6E', marginBottom: 20 }]}>
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
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.modalBtnSaveTxt}>Send reset link</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Contacts permission modal */}
      <Modal visible={showContactsPermModal} transparent animationType="fade" onRequestClose={() => setShowContactsPermModal(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setShowContactsPermModal(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={[s.confirmIconCircle, { backgroundColor: '#f0fafa', borderColor: '#c0e8e8' }]}>
                <Ionicons name="people-outline" size={26} color="#0F6E6E" />
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
            ] as { key: keyof NotifPrefs; label: string; desc: string }[]).map(({ key, label, desc }) => (
              <View key={key} style={s.notifRow}>
                <View style={s.notifText}>
                  <Text style={s.notifLabel}>{label}</Text>
                  <Text style={s.notifDesc}>{desc}</Text>
                </View>
                <Switch
                  value={notifPrefs[key]}
                  onValueChange={v => handleNotifToggle(key, v)}
                  trackColor={{ false: '#e0e0e0', true: '#a8d8d0' }}
                  thumbColor={notifPrefs[key] ? '#0F6E6E' : '#bbb'}
                />
              </View>
            ))}
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
                <Text style={[s.confirmCancelTxt, { color: '#0F6E6E' }]}>Change photo</Text>
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
              <View style={[s.confirmIconCircle, { backgroundColor: '#f0fafa', borderColor: '#c0e8e8' }]}>
                <Ionicons name="calendar-outline" size={26} color="#0F6E6E" />
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

      {/* Confirm sign out */}
      <Modal visible={signOutVisible} transparent animationType="fade" onRequestClose={() => setSignOutVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setSignOutVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            
            <View style={s.confirmIconRow}>
              <View style={[s.confirmIconCircle, { backgroundColor: '#f5f5f5', borderColor: '#e0e0e0' }]}>
                <Ionicons name="log-out-outline" size={26} color="#666" />
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
                <Ionicons name="trash-outline" size={26} color="#c0392b" />
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
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmDeleteTxt}>Delete permanently</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Feedback modal */}
      <Modal visible={feedbackVisible} transparent animationType="fade" onRequestClose={() => setFeedbackVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={s.confirmOverlay} onPress={() => setFeedbackVisible(false)}>
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
              placeholderTextColor="#bbb"
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
                onPress={() => setFeedbackVisible(false)}>
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
                  ? <ActivityIndicator size="small" color="#fff" />
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
              <View style={[s.confirmIconCircle, { backgroundColor: '#e6f7f7', borderColor: '#a8d8d0' }]}>
                <Text style={{ fontSize: 26 }}>💚</Text>
              </View>
            </View>
            <Text style={s.confirmTitle}>Thank you!</Text>
            <Text style={[s.confirmBody, { marginBottom: 24 }]}>
              Your feedback has been received. We read every submission and will look into it.
            </Text>
            <Pressable
              style={({ pressed }) => [s.modalBtn, s.modalBtnSave, pressed && { opacity: 0.85 }]}
              onPress={() => setThankYouVisible(false)}>
              <Text style={s.modalBtnSaveTxt}>Done</Text>
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
                  <Ionicons name={icon} size={20} color="#c0392b" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.resetRowLabel}>{label}</Text>
                    <Text style={s.resetRowDesc}>{desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#ddd" />
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
                  'This will clear your streak, all badges, mood history, journal, losses and debts. Your account and settings are kept.',
                  resetEverything,
                );
              }}
              disabled={resetting}>
              <Ionicons name="nuclear-outline" size={20} color="#c0392b" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.resetNuclearLabel}>Reset everything</Text>
                <Text style={s.resetRowDesc}>Streak, badges, mood, journal, losses & debts</Text>
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
              <Ionicons name="warning-outline" size={28} color="#c0392b" />
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 16 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  profileCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    alignItems: 'center', gap: 6, overflow: 'hidden',
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#e6f7f7', alignItems: 'center', justifyContent: 'center',
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
    backgroundColor: '#0F6E6E', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarEditBadgeTxt: { fontSize: 11, color: '#fff' },
  avatarTxt: { fontSize: 32, fontWeight: '700', color: '#0F6E6E' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayName: { fontSize: 18, fontWeight: '700', color: '#111' },
  nameEditHint: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#e6f7f7' },
  nameEditHintTxt: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#111', minWidth: 120,
  },
  nameShuffleBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e6f7f7', alignItems: 'center', justifyContent: 'center' },
  nameSaveBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#0F6E6E' },
  nameSaveTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  nameCancelBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  nameCancelTxt: { color: '#aaa', fontSize: 12 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  email: { fontSize: 13, color: '#888' },
  premiumBadge: {
    backgroundColor: '#e6f7f7', paddingVertical: 4, paddingHorizontal: 12,
    borderRadius: 12, marginTop: 4,
  },
  premiumBadgeTxt: { fontSize: 13, color: '#0F6E6E', fontWeight: '600' },

  profileSubRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', borderTopWidth: 1, borderTopColor: '#f0f0f0',
    marginTop: 8, paddingTop: 14,
  },
  profileSubLeft: { gap: 2 },
  profileSubBadge: { fontSize: 14, fontWeight: '700', color: '#0F6E6E' },
  profileAdminBadge: { fontSize: 14, fontWeight: '700', color: '#7c5700' },
  profileSubMeta: { fontSize: 12, color: '#aaa' },
  profileSubFree: { fontSize: 14, fontWeight: '600', color: '#555' },
  profileSubRestore: { fontSize: 12, color: '#0F6E6E' },
  profileSubBtn: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#0F6E6E',
  },
  profileSubBtnTxt: { fontSize: 13, fontWeight: '700', color: '#0F6E6E' },
  profileUpgradeBtn: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#0F6E6E',
  },
  profileUpgradeBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  infoCard: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  infoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  infoItemMain: { flex: 1, gap: 2 },
  infoItemLabel: { fontSize: 12, color: '#aaa', fontWeight: '500' },
  infoItemValue: { fontSize: 15, color: '#111', fontWeight: '600' },
  infoItemActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoDivider: { height: 1, backgroundColor: '#f2f2f2', marginLeft: 0 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 14, color: '#888' },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  infoValue: { fontSize: 14, color: '#111', fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  goalReachedNote: { fontSize: 12, color: '#0a7a4e', fontWeight: '600', marginTop: 2 },
  editBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#e6f7f7' },
  editBtnTxt: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  subStatus: { fontSize: 15, color: '#555' },
  upgradeBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  upgradeBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  settingsRowTxt: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },

  aboutCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  aboutTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  aboutVersion: { fontSize: 13, color: '#aaa' },
  aboutNote: { fontSize: 13, color: '#666', lineHeight: 19 },
  aboutDivider: { height: 1, backgroundColor: '#f0f0f0' },
  aboutBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  aboutBtnTxt: { fontSize: 14, color: '#0F6E6E', fontWeight: '600' },

  statsCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  statCol: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#0F6E6E' },
  statLabel: { fontSize: 12, color: '#888', fontWeight: '600' },
  statUnit: { fontSize: 11, color: '#bbb' },
  statDivider: { width: 1, height: 48, backgroundColor: '#f0f0f0', marginHorizontal: 8 },

  exportBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#a8d8d0',
  },
  exportTxt: { fontSize: 15, color: '#0F6E6E', fontWeight: '600' },

  versionTxt: { fontSize: 12, color: '#ccc', textAlign: 'center', paddingVertical: 8 },

  infoValueEmpty: { color: '#bbb', fontStyle: 'italic', fontWeight: '400' },

  feedbackTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  feedbackTypeChip: { flex: 1, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: '#d0e8e8', backgroundColor: '#f8fdfd', alignItems: 'center' },
  feedbackTypeChipActive: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  feedbackTypeChipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  feedbackTypeChipTxtActive: { color: '#0F6E6E' },
  feedbackInput: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#111', minHeight: 120, marginBottom: 16,
  },

  notifSettingsBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#a8d8d0',
  },
  notifSettingsTxt: { fontSize: 15, color: '#0F6E6E', fontWeight: '600' },

  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  notifText: { flex: 1, paddingRight: 12 },
  notifLabel: { fontSize: 14, fontWeight: '600', color: '#222' },
  notifDesc: { fontSize: 12, color: '#999', marginTop: 2 },

  // Spending modal
  currencyChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#d0e8e8', backgroundColor: '#f8fdfd' },
  currencyChipSelected: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  currencyChipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  currencyChipTxtSelected: { color: '#0F6E6E' },
  spendingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  spendingChip: { width: '30.5%', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#d0e8e8', backgroundColor: '#f8fdfd', alignItems: 'center' },
  spendingChipSelected: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  spendingChipTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
  spendingChipTxtSelected: { color: '#0F6E6E' },
  spendingCustomLabel: { fontSize: 13, color: '#666', marginBottom: 10 },
  contactPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#0F6E6E', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'stretch', justifyContent: 'center',
    backgroundColor: '#f0fafa',
  },
  contactPickerBtnTxt: { fontSize: 14, fontWeight: '600', color: '#0F6E6E' },
  permStepBox: { gap: 10, backgroundColor: '#f8fafa', borderRadius: 14, padding: 14 },
  permStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  permStepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#0F6E6E', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  permStepNumTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
  permStepTxt: { flex: 1, fontSize: 13, color: '#555', lineHeight: 20 },
  permStepBold: { fontWeight: '700', color: '#222' },
  goalIconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  goalIconChip: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: 'transparent' },
  goalIconChipActive: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  goalIconChipEmoji: { fontSize: 22 },
  spendingInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fafafa' },
  spendingSymbol: { fontSize: 16, color: '#555', marginRight: 6 },
  spendingInput: { flex: 1, fontSize: 15, color: '#111' },
  spendingPerWk: { fontSize: 13, color: '#999', marginLeft: 6 },

  // Edit field modal
  editFieldSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  editCenterSheet: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 20, paddingBottom: 24, width: '100%', maxHeight: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 24,
  },
  editFieldTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 16 },
  editFieldOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  editFieldOptionSelected: { backgroundColor: '#f0fafa' },
  editFieldEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  editFieldLabel: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },
  editFieldLabelSelected: { color: '#0F6E6E', fontWeight: '600' },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#0F6E6E', borderColor: '#0F6E6E' },
  checkmark: { fontSize: 13, color: '#fff', fontWeight: '700' },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: '#0F6E6E' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0F6E6E' },

  // iOS modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f0f0f0' },
  modalBtnCancel: { fontSize: 15, color: '#555', fontWeight: '600' },
  modalBtnSave: { backgroundColor: '#0F6E6E' },
  modalBtnSaveTxt: { fontSize: 15, color: '#fff', fontWeight: '700' },

  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  confirmSheet: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  confirmIconRow: { alignItems: 'center', marginBottom: 12 },
  confirmIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#ffcdd2',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 21, marginBottom: 4 },
  confirmBold: { fontWeight: '700', color: '#333' },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f5f5f5' },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: '#666' },
  confirmDelete: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#c0392b' },
  confirmDeleteTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  confirmSave: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0F6E6E' },
  confirmSaveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  settingsDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 4 },

  resetSheet: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 },
  resetSheetTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 4 },
  resetSheetSub: { fontSize: 13, color: '#999', marginBottom: 20 },
  resetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  resetRowLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  resetRowDesc: { fontSize: 12, color: '#999', marginTop: 1 },
  resetDivider: { height: 1, backgroundColor: '#f5f5f5' },
  resetNuclearSep: { height: 1, backgroundColor: '#fde8e8', marginVertical: 8 },
  resetNuclearRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  resetNuclearLabel: { fontSize: 15, fontWeight: '700', color: '#c0392b' },
  resetCancelBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  resetCancelTxt: { fontSize: 15, fontWeight: '600', color: '#666' },

  resetConfirmSheet: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' },
  resetConfirmIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fde8e8', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  resetConfirmTitle: { fontSize: 17, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
  resetConfirmBody: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  resetConfirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
  resetConfirmCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  resetConfirmCancelTxt: { fontSize: 15, fontWeight: '600', color: '#555' },
  resetConfirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#c0392b', alignItems: 'center' },
  resetConfirmBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Premium subscription card
  premiumCard: {
    borderRadius: 16, padding: 18,
    shadowColor: '#0F6E6E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  premiumCardInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  premiumCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  premiumIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  premiumCardTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  premiumCardSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  manageSub: {
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  manageSubTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Settings / support menu cards
  menuCard: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden' },
  menuCardTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  menuIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#e6f7f7', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  menuIconWrapRed: { backgroundColor: '#fde8e8' },
  menuRowLabel: { flex: 1, fontSize: 15, color: '#111', fontWeight: '500' },
  menuDivider: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 62 },

  // Restore purchases link
  restoreLink: { alignItems: 'center', paddingTop: 10 },
  restoreLinkTxt: { fontSize: 13, color: '#0F6E6E' },

  // Footer note
  footerNote: { alignItems: 'center', paddingVertical: 6, gap: 4 },
  footerVersion: { fontSize: 12, color: '#ccc' },
  footerTagline: { fontSize: 12, color: '#bbb', fontStyle: 'italic', textAlign: 'center' },

  // Call button next to trusted contact
  callBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#e6f7f7', alignItems: 'center', justifyContent: 'center',
  },

  // Danger zone card (sign out + delete account)
  dangerCard: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#fde8e8' },
  dangerRowLabel: { color: '#c0392b' },
});
