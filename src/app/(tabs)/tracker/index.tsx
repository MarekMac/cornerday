import AsyncStorage from '@react-native-async-storage/async-storage';
import { maybeRequestReview } from '@/lib/review';
import { parseQuitDate } from '@/lib/parseQuitDate';
import { haptic, hapticMedium } from '@/lib/haptics';
import { showInterstitialIfReady } from '@/lib/ads';
import { usePurchases } from '@/context/purchases';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { Swipeable } from 'react-native-gesture-handler';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY, GOAL_ICONS } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';
import { SkeletonBox } from '@/components/skeleton';

type MainTab = 'debts' | 'saving' | 'session';

// Deliberate purple brand color for the session tab — no theme token since it's category-specific.
const SESSION_COLOR = '#7b5ea7';
const SESSION_CHIP_BG = 'rgba(123, 94, 167, 0.12)';

interface Debt {
  id: string;
  name: string;
  total_amount: number;
  category: string;
  created_at: string;
  target_date: string | null;
}

interface DebtPayment {
  debt_id: string;
  amount: number;
}

interface SavingEntry {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

interface SessionEntry {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  created_at: string;
}

const SESSION_CATEGORIES = [
  { key: 'sports_betting', label: 'Sports betting', emoji: '⚽' },
  { key: 'casino',         label: 'Casino',         emoji: '🎰' },
  { key: 'poker',          label: 'Poker',          emoji: '🃏' },
  { key: 'online_slots',   label: 'Online slots',   emoji: '🎮' },
  { key: 'other',          label: 'Other',          emoji: '🎲' },
];

const DEBT_CATEGORIES = [
  { key: 'bank',   label: 'Bank',        emoji: '🏦' },
  { key: 'credit', label: 'Credit card', emoji: '💳' },
  { key: 'friend', label: 'Friend',      emoji: '👤' },
  { key: 'family', label: 'Family',      emoji: '👨‍👩‍👧' },
  { key: 'other',  label: 'Other',       emoji: '💰' },
];

function categoryEmoji(cat: string) {
  return DEBT_CATEGORIES.find(c => c.key === cat)?.emoji ?? '💰';
}

function sessionEmoji(cat: string) {
  return SESSION_CATEGORIES.find(c => c.key === cat)?.emoji ?? '🎲';
}

function sessionLabel(cat: string) {
  return SESSION_CATEGORIES.find(c => c.key === cat)?.label ?? cat;
}

function fmt(amount: number, currency = 'USD') {
  const syms: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$',
  };
  const s = syms[currency] ?? currency;
  const rounded = Math.round(amount * 100) / 100;
  return `${s}${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}


function debtProgressColor(pct: number, c: import('@/constants/theme').AppColors): string {
  if (pct >= 1) return c.success;
  if (pct >= 0.7) return c.primary;
  if (pct >= 0.4) return c.warn;
  return c.error;
}


function streakDays(quitTimestamp: string | null) {
  if (!quitTimestamp) return 0;
  const ms = Date.now() - parseQuitDate(quitTimestamp).getTime();
  return ms < 0 ? 0 : Math.floor(ms / 86400000);
}

export default function TrackerIndex() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<MainTab>('debts');
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [savings, setSavings] = useState<SavingEntry[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [weeklyBet, setWeeklyBet] = useState<string | null>(null);
  const [quitTs, setQuitTs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [androidKbOffset, setAndroidKbOffset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setAndroidKbOffset(e.endCoordinates.height));
    const hide  = Keyboard.addListener('keyboardDidHide', () => setAndroidKbOffset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Context menus
  const [menuDebt, setMenuDebt] = useState<Debt | null>(null);
  const [menuSaving, setMenuSaving] = useState<SavingEntry | null>(null);

  // Delete confirmations
  const [deleteDebtTarget, setDeleteDebtTarget] = useState<Debt | null>(null);
  const [deleteSavingTarget, setDeleteSavingTarget] = useState<SavingEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debt modal (add + edit)
  const [debtModalVisible, setDebtModalVisible] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [debtName, setDebtName] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtCategory, setDebtCategory] = useState('other');
  const [savingDebt, setSavingDebt] = useState(false);

  // Saving modal (add + edit)
  const [savingModalVisible, setSavingModalVisible] = useState(false);
  const [editingSaving, setEditingSaving] = useState<SavingEntry | null>(null);
  const [savingAmount, setSavingAmount] = useState('');
  const [savingNote, setSavingNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { isPremium } = usePurchases();

  // Quick pay modal
  const [quickPayDebt, setQuickPayDebt] = useState<Debt | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayNote, setQuickPayNote] = useState('');
  const [submittingQuickPay, setSubmittingQuickPay] = useState(false);

  // Session log
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionEntry | null>(null);
  const [sessionAmount, setSessionAmount] = useState('');
  const [sessionCategory, setSessionCategory] = useState('sports_betting');
  const [sessionNote, setSessionNote] = useState('');
  const [submittingSession, setSubmittingSession] = useState(false);
  const [menuSession, setMenuSession] = useState<SessionEntry | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<SessionEntry | null>(null);
  const [sessionDate, setSessionDate] = useState<Date>(() => new Date());
  const [showSessionDateModal, setShowSessionDateModal] = useState(false);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);

  // Savings goal
  const [savingsGoal, setSavingsGoal] = useState<number | null>(null);
  const [savingsGoalFor, setSavingsGoalFor] = useState<string>('');
  const [savingsGoalIcon, setSavingsGoalIcon] = useState<string>('🎯');
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [goalForInput, setGoalForInput] = useState('');
  const [goalIconInput, setGoalIconInput] = useState<string>('🎯');

  // Target dates
  const [debtTargetDate, setDebtTargetDate] = useState<Date | null>(null);
  const [savingsTargetDate, setSavingsTargetDate] = useState<Date | null>(null);
  const [goalTargetDateInput, setGoalTargetDateInput] = useState<Date | null>(null);
  const [showDebtTargetModal, setShowDebtTargetModal] = useState(false);
  const [showSavingsTargetModal, setShowSavingsTargetModal] = useState(false);
  const [editTargetDate, setEditTargetDate] = useState(() => new Date(Date.now() + 90 * 86400000));
  const [savingTargetDate, setSavingTargetDate] = useState(false);
  type DebtSort = 'default' | 'progress' | 'due';
  const [debtSort, setDebtSort] = useState<DebtSort>('default');
  const [savingGoalBusy, setSavingGoalBusy] = useState(false);

  // Swipe refs — one per debt card
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());
  // Prevent useFocusEffect from duplicating the initial useEffect fetch
  const initialFetchDone = useRef(false);
  const fetchingRef = useRef(false);
  // Prevent Modal's onRequestClose firing while a native Android picker is open
  const nativePickerOpen = useRef(false);
  // Snapshot of debt target date when modal opens — restored on Cancel
  const debtTargetDateBeforeEdit = useRef<Date | null>(null);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [debtsRes, paymentsRes, savingsRes, sessionsRes, profileRes, rawGoal, rawFor, rawIcon] = await Promise.all([
        supabase.from('debts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('debt_payments').select('debt_id, amount').eq('user_id', user.id),
        supabase.from('losses').select('id, amount, note, created_at').eq('user_id', user.id).eq('type', 'saving').order('created_at', { ascending: false }),
        supabase.from('losses').select('id, amount, category, note, created_at').eq('user_id', user.id).eq('type', 'session').order('created_at', { ascending: false }),
        supabase.from('users').select('currency, weekly_bet, quit_timestamp, quit_date, debt_target_date, savings_target_date').eq('id', user.id).maybeSingle(),
        AsyncStorage.getItem(SAVINGS_GOAL_KEY),
        AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
        AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
      ]);

      setDebts((debtsRes.data ?? []) as Debt[]);
      setPayments((paymentsRes.data ?? []) as DebtPayment[]);
      setSavings((savingsRes.data ?? []) as SavingEntry[]);
      setSessions((sessionsRes.data ?? []) as SessionEntry[]);
      if (profileRes.data) {
        setCurrency(profileRes.data.currency ?? 'USD');
        setWeeklyBet(profileRes.data.weekly_bet ?? null);
        setQuitTs(profileRes.data.quit_timestamp ?? profileRes.data.quit_date ?? null);
        setDebtTargetDate(profileRes.data.debt_target_date ? new Date(profileRes.data.debt_target_date + 'T12:00:00') : null);
        setSavingsTargetDate(profileRes.data.savings_target_date ? new Date(profileRes.data.savings_target_date + 'T12:00:00') : null);
      }
      const _rawGoalN = rawGoal ? Number(rawGoal) : null;
      setSavingsGoal(_rawGoalN !== null && !isNaN(_rawGoalN) ? _rawGoalN : null);
      setSavingsGoalFor(rawFor ?? '');
      setSavingsGoalIcon(rawIcon ?? '🎯');
    } catch (e) {
      console.warn('fetchAll error:', e);
      setLoadError(true);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll().finally(() => { initialFetchDone.current = true; fetchingRef.current = false; }); }, [fetchAll]);
  useFocusEffect(useCallback(() => { if (initialFetchDone.current) fetchAll(); }, [fetchAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      fetchingRef.current = false;
      setRefreshing(false);
    }
  }, [fetchAll]);

  const paidByDebt: Record<string, number> = {};
  payments.forEach(p => { paidByDebt[p.debt_id] = (paidByDebt[p.debt_id] ?? 0) + Number(p.amount); });

  const totalDebt = debts.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalPaid = Object.values(paidByDebt).reduce((s, v) => s + v, 0);
  const stillOwed = Math.max(0, totalDebt - totalPaid);
  const recoveryPct = totalDebt > 0 ? Math.min(1, totalPaid / totalDebt) : 0;

  const days = streakDays(quitTs);
  const streakMs = quitTs ? Math.max(0, nowMs - parseQuitDate(quitTs).getTime()) : 0;
  const autoSaved = weeklyBet ? (streakMs / 86400000) * (Number(weeklyBet) / 7) : 0;
  const totalManualSavings = savings.reduce((s, e) => s + Number(e.amount), 0);

  // ── Debt actions ──────────────────────────────────────────────

  const openAddDebt = () => {
    setEditingDebt(null);
    setDebtName(''); setDebtAmount(''); setDebtCategory('other');
    debtTargetDateBeforeEdit.current = null;
    setDebtTargetDate(null);
    setDebtModalVisible(true);
  };

  const openEditDebt = (debt: Debt) => {
    setEditingDebt(debt);
    setDebtName(debt.name);
    setDebtAmount(String(debt.total_amount));
    setDebtCategory(debt.category);
    const perDebtDate = debt.target_date ? new Date(debt.target_date + 'T12:00:00') : null;
    debtTargetDateBeforeEdit.current = perDebtDate;
    setDebtTargetDate(perDebtDate);
    setDebtModalVisible(true);
  };

  const closeDebtModal = () => {
    if (Platform.OS === 'android') setAndroidKbOffset(0);
    Keyboard.dismiss();
    setDebtModalVisible(false);
    setEditingDebt(null);
    setDebtName(''); setDebtAmount(''); setDebtCategory('other');
    setDebtTargetDate(debtTargetDateBeforeEdit.current);
  };

  const saveDebt = async () => {
    const amount = parseFloat(debtAmount);
    if (!debtName.trim() || isNaN(amount) || !isFinite(amount) || amount <= 0 || amount > 999_999_999) {
      Alert.alert('Missing info', 'Please enter a name and a valid amount.');
      return;
    }
    if (editingDebt) {
      const paid = paidByDebt[editingDebt.id] ?? 0;
      if (amount < paid) {
        Alert.alert('Invalid amount', `You've already paid ${fmt(paid, currency)} towards this debt.`);
        return;
      }
    }
    setSavingDebt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const targetDateStr = debtTargetDate ? debtTargetDate.toISOString().split('T')[0] : null;
        if (editingDebt) {
          await supabase.from('debts').update({
            name: debtName.trim(), total_amount: amount, category: debtCategory,
            target_date: targetDateStr,
          }).eq('id', editingDebt.id).eq('user_id', user.id);
          await supabase.from('losses').insert({
            user_id: user.id, type: 'debt_edited', amount, category: 'Debt', note: debtName.trim(),
          });
        } else {
          await supabase.from('debts').insert({
            user_id: user.id, name: debtName.trim(),
            total_amount: amount, category: debtCategory, target_date: targetDateStr,
          });
        }
        hapticMedium();
        closeDebtModal();
        await fetchAll();
      }
    } finally {
      setSavingDebt(false);
    }
  };

  const handleDebtMenu = (debt: Debt) => setMenuDebt(debt);

  const confirmDeleteDebt = (debt: Debt) => setDeleteDebtTarget(debt);

  const executeDeleteDebt = async () => {
    if (!deleteDebtTarget) return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Delete the debt row first — if there is a FK cascade, payments are cleaned up automatically.
        const { error: debtDelErr } = await supabase.from('debts').delete().eq('id', deleteDebtTarget.id).eq('user_id', user.id);
        if (debtDelErr) {
          Alert.alert('Could not delete debt', debtDelErr.message);
          return;
        }
        // Delete orphaned payments in case there is no FK cascade.
        const { error: paymentsDelErr } = await supabase.from('debt_payments').delete().eq('debt_id', deleteDebtTarget.id).eq('user_id', user.id);
        if (paymentsDelErr) {
          Alert.alert('Debt deleted but payments may remain', paymentsDelErr.message);
        }
        await supabase.from('losses').insert({
          user_id: user.id, type: 'debt_deleted', amount: deleteDebtTarget.total_amount,
          category: 'Debt', note: deleteDebtTarget.name,
        });
      }
      haptic();
      setDeleteDebtTarget(null);
      await fetchAll();
    } finally {
      setDeleting(false);
    }
  };

  // ── Saving actions ────────────────────────────────────────────

  const openAddSaving = () => {
    setEditingSaving(null);
    setSavingAmount(''); setSavingNote('');
    setSavingModalVisible(true);
  };

  const openEditSaving = (entry: SavingEntry) => {
    setEditingSaving(entry);
    setSavingAmount(String(entry.amount));
    setSavingNote(entry.note ?? '');
    setSavingModalVisible(true);
  };

  const closeSavingModal = () => {
    if (Platform.OS === 'android') setAndroidKbOffset(0);
    Keyboard.dismiss();
    setSavingModalVisible(false);
    setEditingSaving(null);
    setSavingAmount(''); setSavingNote('');
  };

  const saveSaving = async () => {
    const amount = parseFloat(savingAmount.trim());
    if (!savingAmount.trim() || isNaN(amount) || !isFinite(amount) || amount <= 0 || amount > 999_999_999) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (editingSaving) {
          await supabase.from('losses').update({
            amount, note: savingNote.trim() || null,
          }).eq('id', editingSaving.id).eq('user_id', user.id);
          await supabase.from('losses').insert({
            user_id: user.id, type: 'saving_edited', amount,
            category: 'Saving', note: savingNote.trim() || null,
          });
        } else {
          await supabase.from('losses').insert({
            user_id: user.id, type: 'saving', amount,
            category: 'Saving', note: savingNote.trim() || null,
          });
        }
        hapticMedium();
        closeSavingModal();
        await fetchAll();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavingMenu = (entry: SavingEntry) => setMenuSaving(entry);

  const confirmDeleteSaving = (entry: SavingEntry) => setDeleteSavingTarget(entry);

  const executeDeleteSaving = async () => {
    if (!deleteSavingTarget) return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: delErr } = await supabase.from('losses').delete().eq('id', deleteSavingTarget.id).eq('user_id', user.id);
        if (delErr) {
          Alert.alert('Could not delete saving', delErr.message);
        } else {
          await supabase.from('losses').insert({
            user_id: user.id, type: 'saving_deleted', amount: deleteSavingTarget.amount,
            category: 'Saving', note: deleteSavingTarget.note,
          });
          haptic();
          await fetchAll();
        }
      }
      setDeleteSavingTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Session actions ───────────────────────────────────────────

  const openAddSession = () => {
    setEditingSession(null);
    setSessionAmount(''); setSessionCategory('sports_betting'); setSessionNote('');
    setSessionDate(new Date());
    setSessionModalVisible(true);
  };

  const openEditSession = (entry: SessionEntry) => {
    setEditingSession(entry);
    setSessionAmount(String(entry.amount));
    setSessionCategory(entry.category);
    setSessionNote(entry.note ?? '');
    setSessionDate(new Date(entry.created_at));
    setSessionModalVisible(true);
  };

  const closeSessionModal = () => {
    if (Platform.OS === 'android') setAndroidKbOffset(0);
    Keyboard.dismiss();
    setSessionModalVisible(false);
    setEditingSession(null);
    setSessionAmount(''); setSessionCategory('sports_betting'); setSessionNote('');
    setSessionDate(new Date());
  };

  const saveSession = async () => {
    const amount = parseFloat(sessionAmount.trim());
    if (!sessionAmount.trim() || isNaN(amount) || !isFinite(amount) || amount <= 0 || amount > 999_999_999) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setSubmittingSession(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Use local noon to keep the date stable across all timezones when stored as UTC
        const sessionDateIso = new Date(
          sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate(), 12, 0, 0,
        ).toISOString();
        if (editingSession) {
          const { error: updateErr } = await supabase.from('losses').update({
            amount, category: sessionCategory, note: sessionNote.trim() || null,
            created_at: sessionDateIso,
          }).eq('id', editingSession.id).eq('user_id', user.id);
          if (updateErr) { Alert.alert('Could not save session', updateErr.message); return; }
          await supabase.from('losses').insert({
            user_id: user.id, type: 'session_edited', amount,
            category: sessionCategory, note: sessionNote.trim() || null,
          });
        } else {
          await supabase.from('losses').insert({
            user_id: user.id, type: 'session', amount,
            category: sessionCategory, note: sessionNote.trim() || null,
            created_at: sessionDateIso,
          });
          showInterstitialIfReady(isPremium, 0.1);
        }
        hapticMedium();
        closeSessionModal();
        await fetchAll();
      }
    } finally {
      setSubmittingSession(false);
    }
  };

  const confirmDeleteSession = (entry: SessionEntry) => setDeleteSessionTarget(entry);

  const executeDeleteSession = async () => {
    if (!deleteSessionTarget) return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: delErr } = await supabase.from('losses').delete().eq('id', deleteSessionTarget.id).eq('user_id', user.id);
        if (delErr) {
          Alert.alert('Could not delete session', delErr.message);
        } else {
          haptic();
          await fetchAll();
        }
      }
      setDeleteSessionTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const shareGoal = async () => {
    if (!savingsGoal) return;
    const goalDesc = savingsGoalFor ? `towards ${savingsGoalFor}` : 'and hit my savings goal';
    await Share.share({
      message: `I just saved ${fmt(totalManualSavings, currency)} ${goalDesc}! ${savingsGoalIcon}\n\n#CornerDay #Recovery`,
      title: 'Savings Goal Reached',
    });
  };

  // Savings goal
  const openGoalModal = () => {
    setGoalInput(savingsGoal ? String(savingsGoal) : '');
    setGoalForInput(savingsGoalFor);
    setGoalIconInput(savingsGoalIcon);
    setGoalTargetDateInput(savingsTargetDate);
    setGoalModalVisible(true);
  };
  const closeGoalModal = () => {
    if (Platform.OS === 'android') setAndroidKbOffset(0);
    Keyboard.dismiss();
    setGoalModalVisible(false);
    setGoalInput('');
    setGoalForInput('');
    setGoalIconInput('🎯');
    setGoalTargetDateInput(null);
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
      Alert.alert('Invalid amount', 'Please enter a valid goal amount.');
      return;
    }
    setSavingGoalBusy(true);
    try {
      try {
        if (!goalInput) {
          await AsyncStorage.multiRemove([SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY]);
          await logGoalEvent('goal_deleted', savingsGoal, savingsGoalFor || null);
          setSavingsGoal(null);
          setSavingsGoalFor('');
          setSavingsGoalIcon('🎯');
        } else {
          const forVal = goalForInput.trim();
          const iconVal = goalIconInput || '🎯';
          await AsyncStorage.setItem(SAVINGS_GOAL_KEY, String(val));
          await AsyncStorage.setItem(SAVINGS_GOAL_ICON_KEY, iconVal);
          if (forVal) await AsyncStorage.setItem(SAVINGS_GOAL_FOR_KEY, forVal);
          else await AsyncStorage.removeItem(SAVINGS_GOAL_FOR_KEY);
          const eventType = savingsGoal ? 'goal_updated' : 'goal_set';
          await logGoalEvent(eventType, val, forVal || null);
          setSavingsGoal(val);
          setSavingsGoalFor(forVal);
          setSavingsGoalIcon(iconVal);
        }
      } catch (storageErr) {
        Alert.alert('Save failed', 'Could not save goal. Please try again.');
        return;
      }
      // Persist savings target date to DB
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: dateErr } = await supabase.from('users').update({
          savings_target_date: goalTargetDateInput ? goalTargetDateInput.toISOString().split('T')[0] : null,
        }).eq('id', user.id);
        if (dateErr) {
          Alert.alert('Could not save target date', dateErr.message);
          return;
        }
        setSavingsTargetDate(goalTargetDateInput);
      }
      haptic();
      closeGoalModal();
    } finally {
      setSavingGoalBusy(false);
    }
  };

  const saveDebtTargetDate = async (date: Date) => {
    setSavingTargetDate(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('users').update({ debt_target_date: date.toISOString().split('T')[0] }).eq('id', user.id);
        if (error) { Alert.alert('Could not save target date', error.message); return; }
        setDebtTargetDate(date);
      }
      setShowDebtTargetModal(false);
    } finally {
      setSavingTargetDate(false);
    }
  };

  const openDebtTargetPicker = () => {
    const seed = debtTargetDate ?? new Date(Date.now() + 90 * 86400000);
    setEditTargetDate(seed);
    if (Platform.OS === 'ios') {
      setShowDebtTargetModal(true);
    } else {
      nativePickerOpen.current = true;
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_evt: any, d?: Date) => { nativePickerOpen.current = false; if (d) saveDebtTargetDate(d); },
      });
    }
  };

  const openSavingsTargetPicker = () => {
    const seed = goalTargetDateInput ?? new Date(Date.now() + 90 * 86400000);
    setEditTargetDate(seed);
    if (Platform.OS === 'ios') {
      setShowSavingsTargetModal(true);
    } else {
      nativePickerOpen.current = true;
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_evt: any, d?: Date) => { nativePickerOpen.current = false; if (d) { setGoalTargetDateInput(d); } },
      });
    }
  };

  // Quick pay actions
  const openQuickPay = (debt: Debt) => {
    swipeRefs.current.forEach(ref => ref?.close());
    setQuickPayDebt(debt);
    setQuickPayAmount('');
    setQuickPayNote('');
  };

  const closeQuickPay = () => {
    if (Platform.OS === 'android') setAndroidKbOffset(0);
    Keyboard.dismiss();
    setQuickPayDebt(null);
    setQuickPayAmount('');
    setQuickPayNote('');
  };

  const saveQuickPay = async () => {
    if (!quickPayDebt) return;
    const val = parseFloat(quickPayAmount);
    if (!quickPayAmount || isNaN(val) || !isFinite(val) || val <= 0 || val > 999_999_999) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    const paid = paidByDebt[quickPayDebt.id] ?? 0;
    const remaining = Math.max(0, Number(quickPayDebt.total_amount) - paid);
    if (Math.round(val * 100) > Math.round(remaining * 100)) {
      Alert.alert('Too much', `You only owe ${fmt(remaining, currency)} on this debt.`);
      return;
    }
    const isPayingOff = Math.round(val * 100) === Math.round(remaining * 100);
    setSubmittingQuickPay(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: payError } = await supabase.from('debt_payments').insert({
          user_id: user.id, debt_id: quickPayDebt.id,
          amount: val, note: quickPayNote.trim() || null,
        });
        if (payError) {
          Alert.alert('Could not save payment', payError.message);
          return;
        }
        showInterstitialIfReady(isPremium);
        if (isPayingOff) {
          const { status: notifStatus } = await Notifications.getPermissionsAsync();
          if (notifStatus === 'granted') {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: '🎉 Debt paid off!',
                body: `You've fully paid off "${quickPayDebt.name}". That's a huge step — well done.`,
                data: { screen: '/(tabs)/tracker' },
              },
              trigger: null,
            });
          }
          const { error: journalErr } = await supabase.from('losses').insert({
            user_id: user.id, type: 'debt_paid_off', amount: Number(quickPayDebt.total_amount),
            category: 'Debt', note: quickPayDebt.name,
          });
          if (journalErr) console.warn('[saveQuickPay] journal insert failed:', journalErr.message);
          maybeRequestReview('debt_paid');
        }
        hapticMedium();
        closeQuickPay();
        await fetchAll();
      }
    } finally {
      setSubmittingQuickPay(false);
    }
  };

  const sortedDebts = useMemo(() => [...debts].sort((a, b) => {
    const paidA = paidByDebt[a.id] ?? 0;
    const paidB = paidByDebt[b.id] ?? 0;
    const totalA = Number(a.total_amount) || 0;
    const totalB = Number(b.total_amount) || 0;
    const remA = Math.max(0, totalA - paidA);
    const remB = Math.max(0, totalB - paidB);
    const doneA = remA === 0 && paidA > 0;
    const doneB = remB === 0 && paidB > 0;
    if (doneA !== doneB) return doneA ? 1 : -1;
    if (debtSort === 'default') return remB - remA;
    if (debtSort === 'progress') {
      const pctA = totalA > 0 ? paidA / totalA : 0;
      const pctB = totalB > 0 ? paidB / totalB : 0;
      return pctB - pctA;
    }
    if (debtSort === 'due') {
      const dueA = a.target_date ? new Date(a.target_date).getTime() : Infinity;
      const dueB = b.target_date ? new Date(b.target_date).getTime() : Infinity;
      return dueA - dueB;
    }
    return 0;
  }), [debts, paidByDebt, debtSort]);

  const firstUnpaidDebtId = sortedDebts.find(d => {
    const paid = paidByDebt[d.id] ?? 0;
    return Math.max(0, Number(d.total_amount) - paid) > 0;
  })?.id;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SkeletonBox height={140} radius={0} />
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonBox height={90} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SkeletonBox height={50} />
            <SkeletonBox height={50} />
            <SkeletonBox height={50} />
          </View>
          <SkeletonBox height={120} />
          <SkeletonBox height={120} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 15, color: c.textBody, textAlign: 'center', marginBottom: 16 }}>
          Could not load data. Tap to retry.
        </Text>
        <Pressable
          style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, opacity: pressed ? 0.8 : 1 })}
          onPress={() => { setLoadError(false); setLoading(true); fetchAll(); }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={[s.header, { backgroundColor: c.primary }]}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Financial Tracker</Text>
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={s.body}
          contentContainerStyle={s.bodyContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
        >

          {/* Debt recovery card */}
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>Debt recovery</Text>
            {totalDebt === 0 ? (
              <View style={s.summaryEmpty}>
                <Text style={s.summaryEmptyIcon}>💳</Text>
                <Text style={s.summaryEmptyTitle}>No debts tracked yet</Text>
                <Text style={s.summaryEmptyBody}>Add debts in the Debts tab below to start tracking your recovery progress here.</Text>
              </View>
            ) : (
              <>
                <View style={s.summaryRow}>
                  <View style={s.summaryCol}>
                    <Text style={[s.summaryVal, { color: c.error }]}>{fmt(totalDebt, currency)}</Text>
                    <Text style={s.summaryLbl}>Total debt</Text>
                  </View>
                  <View style={[s.summaryCol, s.summaryMid]}>
                    <Text style={[s.summaryVal, { color: c.primary }]}>{fmt(totalPaid, currency)}</Text>
                    <Text style={s.summaryLbl}>Paid back</Text>
                  </View>
                  <View style={s.summaryCol}>
                    <Text style={[s.summaryVal, { color: c.textBody }]}>{fmt(stillOwed, currency)}</Text>
                    <Text style={s.summaryLbl}>Still owed</Text>
                  </View>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${recoveryPct * 100}%` as any }]} />
                </View>
                <Text style={s.progressLbl}>{Math.round(recoveryPct * 100)}% recovered</Text>
              </>
            )}
          </View>

          {/* Savings card */}
          <View style={s.savingsCard}>
            <Text style={s.savingsCardTitle}>Savings</Text>
            <Pressable
              style={s.savingsRow}
              onPress={weeklyBet ? undefined : () => router.push('/(tabs)/account')}
              disabled={!!weeklyBet}>
              <Text style={s.savingsRowEmoji}>💸</Text>
              <View style={s.savingsRowBody}>
                <Text style={s.savingsRowLabel}>Not spent since day one</Text>
                <Text style={s.savingsRowSub}>
                  {weeklyBet ? `Theoretical · ${fmt(Number(weeklyBet), currency)}/week` : 'Tap to set your weekly spending →'}
                </Text>
              </View>
              {weeklyBet
                ? <Text style={[s.savingsRowAmt, { color: c.textMuted }]}>{fmt(autoSaved, currency)}</Text>
                : <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />}
            </Pressable>
            {totalManualSavings > 0 && (
              <>
                <View style={s.savingsSep} />
                <View style={s.savingsRow}>
                  <Text style={s.savingsRowEmoji}>💰</Text>
                  <View style={s.savingsRowBody}>
                    <Text style={s.savingsRowLabel}>Total banked</Text>
                    <Text style={s.savingsRowSub}>Money you've set aside</Text>
                  </View>
                  <Text style={[s.savingsRowAmt, { color: c.success }]}>{fmt(totalManualSavings, currency)}</Text>
                </View>
              </>
            )}
            <View style={s.savingsSep} />
            <Pressable style={s.savingsRow} onPress={openGoalModal}>
              <Text style={s.savingsRowEmoji}>{savingsGoalIcon}</Text>
              <View style={s.savingsRowBody}>
                {savingsGoal ? (
                  <>
                    <Text style={s.savingsRowLabel}>{savingsGoalFor || 'Savings goal'}</Text>
                    <Text style={[s.savingsRowSub, totalManualSavings >= savingsGoal && { color: c.success, fontWeight: '600' }]}>
                      {totalManualSavings >= savingsGoal ? '🎉 Goal reached!' : 'Tap to edit'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={s.savingsRowLabel}>Set a savings goal</Text>
                    <Text style={s.savingsRowSub}>Tap to add a target amount</Text>
                  </>
                )}
              </View>
              {savingsGoal != null && savingsGoal > 0 ? (
                <View style={s.goalAmtRow}>
                  <Text style={[s.savingsRowAmt, { color: c.success, fontSize: 12, fontWeight: '600', textAlign: 'right' }]}>
                    {fmt(totalManualSavings, currency)} of {fmt(savingsGoal, currency)} · {Math.round(Math.min(1, totalManualSavings / savingsGoal) * 100)}%
                  </Text>
                  {totalManualSavings >= savingsGoal && (
                    <Pressable onPress={shareGoal} hitSlop={8}>
                      <Ionicons name="share-outline" size={15} color={c.primary} />
                    </Pressable>
                  )}
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
              )}
            </Pressable>
          </View>

          <View style={s.sectionDivider} />

          {/* Tabs */}
          <View style={s.tabBar}>
            <Pressable style={s.tabBtn} onPress={() => setTab('debts')}>
              <Text style={[s.tabTxt, tab === 'debts' && s.tabTxtDebt]}>Debts</Text>
              {tab === 'debts' && <View style={[s.tabIndicator, { backgroundColor: c.error }]} />}
            </Pressable>
            <Pressable style={s.tabBtn} onPress={() => setTab('saving')}>
              <Text style={[s.tabTxt, tab === 'saving' && s.tabTxtSaving]}>Savings</Text>
              {tab === 'saving' && <View style={[s.tabIndicator, { backgroundColor: c.primary }]} />}
            </Pressable>
            <Pressable style={s.tabBtn} onPress={() => setTab('session')}>
              <Text style={[s.tabTxt, tab === 'session' && s.tabTxtSession]}>Session log</Text>
              {tab === 'session' && <View style={[s.tabIndicator, { backgroundColor: SESSION_COLOR }]} />}
            </Pressable>
          </View>

          {/* Debts tab */}
          {tab === 'debts' && (
            <>
              <Pressable
                style={({ pressed }) => [s.addBtn, { borderColor: c.error }, pressed && { opacity: 0.85 }]}
                onPress={openAddDebt}>
                <Ionicons name="add-circle-outline" size={18} color={c.error} />
                <Text style={[s.addBtnTxt, { color: c.error }]}>Add a debt</Text>
              </Pressable>

              {debts.length > 1 && (
                <View style={s.sortRow}>
                  {([['default', 'Largest first'], ['progress', 'Almost done'], ['due', 'Due soonest']] as [DebtSort, string][]).map(([mode, label]) => (
                    <Pressable key={mode} style={[s.sortChip, debtSort === mode && s.sortChipActive]} onPress={() => setDebtSort(mode)}>
                      <Text style={[s.sortChipTxt, debtSort === mode && s.sortChipTxtActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {debts.length === 0 ? (
                <View style={[s.sessionInfoCard, { borderLeftColor: c.error }]}>
                  <View style={s.sessionInfoHeader}>
                    <Text style={s.sessionInfoIcon}>💳</Text>
                    <Text style={s.sessionInfoTitle}>Track what you owe</Text>
                  </View>
                  <Text style={s.sessionInfoBody}>
                    Add every debt you built up from gambling — bank loans, money borrowed from family or friends, credit cards.
                  </Text>
                  <Text style={s.sessionInfoBody}>
                    For each debt you can log repayments, set a payoff target date, and watch your recovery progress grow.
                  </Text>
                  <View style={s.sessionInfoTip}>
                    <Ionicons name="information-circle-outline" size={15} color={c.error} />
                    <Text style={[s.sessionInfoTipTxt, { color: c.error }]}>Only you can see your debt amounts.</Text>
                  </View>
                </View>
              ) : (
                sortedDebts.map(debt => {
                  const paid = paidByDebt[debt.id] ?? 0;
                  const remaining = Math.max(0, Number(debt.total_amount) - paid);
                  const pct = Number(debt.total_amount) > 0
                    ? Math.min(1, paid / Number(debt.total_amount)) : 0;
                  const isPaidOff = remaining === 0 && paid > 0;
                  const overdueTd = debt.target_date ? new Date(debt.target_date + 'T12:00:00') : null;
                  const isOverdue = !isPaidOff && overdueTd !== null && Math.ceil((overdueTd.getTime() - Date.now()) / 86400000) <= 0;

                  return (
                    <Swipeable
                      key={debt.id}
                      ref={(ref) => { swipeRefs.current.set(debt.id, ref); }}
                      friction={2}
                      leftThreshold={60}
                      rightThreshold={60}
                      onSwipeableOpen={(direction) => {
                        swipeRefs.current.get(debt.id)?.close();
                        if (direction === 'left') confirmDeleteDebt(debt);
                        else if (!isPaidOff) openQuickPay(debt);
                      }}
                      renderLeftActions={() => (
                        <View style={s.swipeDeleteAction}>
                          <Ionicons name="trash-outline" size={22} color={c.white} />
                          <Text style={s.swipeDeleteTxt}>Delete</Text>
                        </View>
                      )}
                      renderRightActions={isPaidOff ? undefined : () => (
                        <View style={s.swipePayAction}>
                          <Ionicons name="card-outline" size={22} color={c.white} />
                          <Text style={s.swipePayTxt}>Pay</Text>
                        </View>
                      )}>
                      <Pressable
                        style={({ pressed }) => [s.debtCard, isPaidOff && s.debtCardPaidOff, isOverdue && s.debtCardOverdue, pressed && { opacity: 0.85 }]}
                        onPress={() => router.push(`/tracker/${debt.id}`)}>
                        <View style={s.debtTop}>
                          <Text style={s.debtEmoji}>{categoryEmoji(debt.category)}</Text>
                          <View style={s.debtInfo}>
                            <Text style={s.debtName}>{debt.name}</Text>
                            <Text style={s.debtMeta}>
                              {isPaidOff
                                ? `${fmt(paid, currency)} fully paid`
                                : `${fmt(paid, currency)} paid · ${fmt(remaining, currency)} remaining`}
                            </Text>
                          </View>
                          <View style={s.debtRight}>
                            {isPaidOff ? (
                              <View style={s.paidOffBadge}>
                                <Text style={s.paidOffBadgeTxt}>✓ Paid off</Text>
                              </View>
                            ) : (
                              <Text style={s.debtPct}>{Math.round(pct * 100)}%</Text>
                            )}
                            <Pressable onPress={() => handleDebtMenu(debt)} hitSlop={10} style={s.menuBtn} accessibilityLabel="Debt options" accessibilityRole="button">
                              <Ionicons name="ellipsis-horizontal" size={18} color={c.textFaint} />
                            </Pressable>
                          </View>
                        </View>
                        <View style={s.debtProgressTrack}>
                          <View style={[s.debtProgressFill, { width: `${pct * 100}%` as any, backgroundColor: debtProgressColor(pct, c) }]} />
                        </View>
                        {!isPaidOff && (() => {
                          const td = debt.target_date ? new Date(debt.target_date + 'T12:00:00') : null;
                          const daysRemaining = td ? Math.ceil((td.getTime() - Date.now()) / 86400000) : null;
                          const daysElapsed = Math.max(1, (Date.now() - new Date(debt.created_at).getTime()) / 86400000);
                          const requiredPerDay = td && daysRemaining && daysRemaining > 0 ? remaining / daysRemaining : null;
                          const actualPerDay = paid > 0 ? paid / daysElapsed : null;
                          const isAhead = requiredPerDay !== null && actualPerDay !== null ? actualPerDay >= requiredPerDay : null;
                          return (
                            <View style={s.debtTargetRow}>
                              {td ? (
                                <>
                                  <Text style={s.debtTargetDate}>
                                    📅 {td.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {daysRemaining !== null && (
                                      <Text style={{ color: daysRemaining <= 0 ? c.error : c.textFaint }}>
                                        {daysRemaining > 0 ? `  ·  ${daysRemaining}d left` : '  ·  Past target'}
                                      </Text>
                                    )}
                                  </Text>
                                  <View style={s.debtTargetRight}>
                                    {requiredPerDay !== null && (
                                      <Text style={s.debtTargetStat}>Need {fmt(requiredPerDay, currency)}/day</Text>
                                    )}
                                    {isAhead !== null && (
                                      <View style={[s.paceBadge, { backgroundColor: isAhead ? c.success : c.error }]}>
                                        <Text style={s.paceBadgeTxt}>{isAhead ? '▲' : '▼'}</Text>
                                      </View>
                                    )}
                                  </View>
                                </>
                              ) : (
                                <Text style={s.debtTargetUnset}>📅 Set payoff target →</Text>
                              )}
                            </View>
                          );
                        })()}
                        {!isPaidOff && debt.id === firstUnpaidDebtId && (
                          <View style={s.swipeHint}>
                            <Text style={s.swipeHintDelete}>← Delete</Text>
                            <Text style={s.swipeHintPay}>Pay →</Text>
                          </View>
                        )}
                      </Pressable>
                    </Swipeable>
                  );
                })
              )}
            </>
          )}

          {/* Savings tab */}
          {tab === 'saving' && (
            <>
              <Pressable
                style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }]}
                onPress={openAddSaving}>
                <Ionicons name="add-circle-outline" size={18} color={c.primary} />
                <Text style={s.addBtnTxt}>Log a saving</Text>
              </Pressable>

              {savings.length === 0 ? (
                <View style={[s.sessionInfoCard, { borderLeftColor: c.primary }]}>
                  <View style={s.sessionInfoHeader}>
                    <Text style={s.sessionInfoIcon}>💰</Text>
                    <Text style={s.sessionInfoTitle}>Build your savings</Text>
                  </View>
                  <Text style={s.sessionInfoBody}>
                    Every time you set money aside — even a small amount — log it here. It's proof that stopping gambling is already working.
                  </Text>
                  <Text style={s.sessionInfoBody}>
                    Set a savings goal and target date to stay motivated. The tracker will show your progress towards it automatically.
                  </Text>
                  <View style={s.sessionInfoTip}>
                    <Ionicons name="information-circle-outline" size={15} color={c.primary} />
                    <Text style={[s.sessionInfoTipTxt, { color: c.primary }]}>Your savings are private and only visible to you.</Text>
                  </View>
                </View>
              ) : (
                <>
                  {savings.map(entry => (
                    <Pressable
                      key={entry.id}
                      style={({ pressed }) => [s.savingCard, pressed && { opacity: 0.85 }]}
                      onPress={() => handleSavingMenu(entry)}>
                      <View style={s.savingCardTop}>
                        <Text style={s.savingCardEmoji}>💰</Text>
                        <View style={s.savingCardInfo}>
                          <Text style={s.savingCardLabel}>{entry.note || 'Saving'}</Text>
                          <Text style={s.savingCardDate}>{fmtDate(entry.created_at)}</Text>
                        </View>
                        <View style={s.savingCardRight}>
                          <Text style={s.savingCardAmt}>+{fmt(Number(entry.amount), currency)}</Text>
                          <Pressable onPress={() => handleSavingMenu(entry)} hitSlop={10} style={s.menuBtn} accessibilityLabel="Saving entry options" accessibilityRole="button">
                            <Ionicons name="ellipsis-horizontal" size={18} color={c.textFaint} />
                          </Pressable>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </>
          )}

          {/* Session log tab */}
          {tab === 'session' && (
            <>
              {/* Summary card — only shown once there are entries */}
              {sessions.length > 0 && (
                <View style={s.sessionSummaryCard}>
                  <View style={s.sessionSummaryRow}>
                    <View style={s.sessionSummaryCol}>
                      <Text style={[s.sessionSummaryVal, { color: c.error }]}>
                        -{fmt(sessions.reduce((sum, e) => sum + Number(e.amount), 0), currency)}
                      </Text>
                      <Text style={s.sessionSummaryLbl}>Total lost</Text>
                    </View>
                    <View style={[s.sessionSummaryCol, { borderLeftWidth: 1, borderLeftColor: c.borderSubtle }]}>
                      <Text style={s.sessionSummaryVal}>{sessions.length}</Text>
                      <Text style={s.sessionSummaryLbl}>{sessions.length === 1 ? 'Session' : 'Sessions'}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Info card — only shown before first entry */}
              {sessions.length === 0 && <View style={s.sessionInfoCard}>
                <View style={s.sessionInfoHeader}>
                  <Text style={s.sessionInfoIcon}>📓</Text>
                  <Text style={s.sessionInfoTitle}>What is the session log?</Text>
                </View>
                <Text style={s.sessionInfoBody}>
                  This is a private, honest record of gambling sessions — without adding to your debt total.
                </Text>
                <Text style={s.sessionInfoBody}>
                  Use it to track when you gambled, how much you lost, and spot patterns over time. It does{' '}
                  <Text style={s.sessionInfoBold}>not</Text> affect your streak, your debt recovery progress, or your savings — it's purely for self-awareness.
                </Text>
                <View style={s.sessionInfoTip}>
                  <Ionicons name="information-circle-outline" size={15} color={SESSION_COLOR} />
                  <Text style={s.sessionInfoTipTxt}>Only you can see these entries.</Text>
                </View>
              </View>}

              <Pressable
                style={({ pressed }) => [s.addBtn, { borderColor: SESSION_COLOR }, pressed && { opacity: 0.85 }]}
                onPress={openAddSession}>
                <Ionicons name="add-circle-outline" size={18} color={SESSION_COLOR} />
                <Text style={[s.addBtnTxt, { color: SESSION_COLOR }]}>Log a session</Text>
              </Pressable>

              {sessions.length === 0 ? (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTxt}>No sessions logged yet.{'\n'}Tap "Log a session" to start tracking honestly.</Text>
                </View>
              ) : (
                sessions.map(entry => (
                  <Pressable
                    key={entry.id}
                    style={({ pressed }) => [s.sessionCard, pressed && { opacity: 0.85 }]}
                    onPress={() => setMenuSession(entry)}>
                    <View style={s.sessionCardTop}>
                      <Text style={s.sessionCardEmoji}>{sessionEmoji(entry.category)}</Text>
                      <View style={s.sessionCardInfo}>
                        <Text style={s.sessionCardLabel}>{sessionLabel(entry.category)}</Text>
                        {entry.note ? <Text style={s.sessionCardNote} numberOfLines={2} ellipsizeMode="tail">{entry.note}</Text> : null}
                        <Text style={s.sessionCardDate}>{fmtDate(entry.created_at)}</Text>
                      </View>
                      <View style={s.sessionCardRight}>
                        <Text style={s.sessionCardAmt}>-{fmt(Number(entry.amount), currency)}</Text>
                        <Pressable onPress={() => setMenuSession(entry)} hitSlop={10} style={s.menuBtn} accessibilityLabel="Session options" accessibilityRole="button">
                          <Ionicons name="ellipsis-horizontal" size={18} color={c.textFaint} />
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                ))
              )}
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Debt modal — add & edit */}
      <Modal visible={debtModalVisible} transparent animationType="fade" onRequestClose={() => { if (!nativePickerOpen.current) closeDebtModal(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[s.modalOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={closeDebtModal}>
            <Pressable style={s.sheet} onPress={() => {}}>
              
              <Text style={s.sheetTitle}>{editingDebt ? 'Edit debt' : 'Add a debt'}</Text>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={s.fieldLbl}>Name</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Bank loan, Friend — John"
                  placeholderTextColor={c.textFaint}
                  value={debtName}
                  onChangeText={setDebtName}
                  maxLength={60}
                />
                <Text style={s.fieldLbl}>Total amount owed</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 2000"
                  placeholderTextColor={c.textFaint}
                  keyboardType="decimal-pad"
                  value={debtAmount}
                  onChangeText={setDebtAmount}
                />
                <Text style={s.fieldLbl}>Category</Text>
                <View style={s.chipRow}>
                  {DEBT_CATEGORIES.map(cat => (
                    <Pressable
                      key={cat.key}
                      style={[s.chip, debtCategory === cat.key && s.chipActive]}
                      onPress={() => setDebtCategory(cat.key)}>
                      <Text style={[s.chipTxt, debtCategory === cat.key && s.chipTxtActive]}>
                        {cat.emoji} {cat.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.fieldLbl}>
                  Payoff target date <Text style={[s.fieldLbl, { fontWeight: '400', textTransform: 'none', letterSpacing: 0 }]}>(optional)</Text>
                </Text>
                <Pressable style={s.dateRow} onPress={openDebtTargetPicker}>
                  <Ionicons name="calendar-outline" size={16} color={c.textMuted} />
                  <Text style={[s.dateRowTxt, !debtTargetDate && { color: c.textFaint }]}>
                    {debtTargetDate
                      ? debtTargetDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'No target date set'}
                  </Text>
                  {debtTargetDate && (
                    <Pressable onPress={e => { e.stopPropagation(); setDebtTargetDate(null); }} hitSlop={10}>
                      <Ionicons name="close-circle" size={16} color={c.textFaint} />
                    </Pressable>
                  )}
                </Pressable>
              </ScrollView>
              <View style={s.sheetActions}>
                <Pressable style={s.cancelBtn} onPress={closeDebtModal}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.saveBtn, savingDebt && s.btnDisabled]} onPress={saveDebt} disabled={savingDebt}>
                  {savingDebt
                    ? <ActivityIndicator color={c.white} size="small" />
                    : <Text style={s.saveBtnTxt}>{editingDebt ? 'Save changes' : 'Add debt'}</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Saving modal — add & edit */}
      <Modal visible={savingModalVisible} transparent animationType="fade" onRequestClose={closeSavingModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[s.modalOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={closeSavingModal}>
            <Pressable style={s.sheet} onPress={() => {}}>
              
              <Text style={s.sheetTitle}>{editingSaving ? 'Edit saving' : 'Log a saving'}</Text>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={s.fieldLbl}>Amount</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 100"
                  placeholderTextColor={c.textFaint}
                  keyboardType="decimal-pad"
                  value={savingAmount}
                  onChangeText={setSavingAmount}
                />
                <Text style={s.fieldLbl}>Note <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional)</Text></Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Savings account, Holiday fund"
                  placeholderTextColor={c.textFaint}
                  value={savingNote}
                  onChangeText={setSavingNote}
                />
              </ScrollView>
              <View style={s.sheetActions}>
                <Pressable style={s.cancelBtn} onPress={closeSavingModal}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.saveBtn, submitting && s.btnDisabled]} onPress={saveSaving} disabled={submitting}>
                  {submitting
                    ? <ActivityIndicator color={c.white} size="small" />
                    : <Text style={s.saveBtnTxt}>{editingSaving ? 'Save changes' : 'Add saving'}</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Debt context menu */}
      <Modal visible={!!menuDebt} transparent animationType="fade" onRequestClose={() => setMenuDebt(null)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuDebt(null)}>
          <Pressable style={s.menuSheet} onPress={() => {}}>
            
            {menuDebt && (() => {
              const paid = paidByDebt[menuDebt.id] ?? 0;
              const remaining = Math.max(0, Number(menuDebt.total_amount) - paid);
              const pct = Number(menuDebt.total_amount) > 0 ? Math.min(1, paid / Number(menuDebt.total_amount)) : 0;
              return (
                <>
                  <View style={s.menuHeader}>
                    <Text style={s.menuEmoji}>{categoryEmoji(menuDebt.category)}</Text>
                    <View style={s.menuHeaderText}>
                      <Text style={s.menuTitle}>{menuDebt.name}</Text>
                      <Text style={s.menuSub}>{Math.round(pct * 100)}% paid back</Text>
                    </View>
                  </View>
                  <View style={s.menuStats}>
                    <View style={s.menuStat}>
                      <Text style={[s.menuStatVal, { color: c.error }]}>{fmt(Number(menuDebt.total_amount), currency)}</Text>
                      <Text style={s.menuStatLbl}>Total</Text>
                    </View>
                    <View style={s.menuStat}>
                      <Text style={[s.menuStatVal, { color: c.primary }]}>{fmt(paid, currency)}</Text>
                      <Text style={s.menuStatLbl}>Paid</Text>
                    </View>
                    <View style={s.menuStat}>
                      <Text style={[s.menuStatVal, { color: c.textBody }]}>{fmt(remaining, currency)}</Text>
                      <Text style={s.menuStatLbl}>Remaining</Text>
                    </View>
                  </View>
                  <View style={s.menuProgressTrack}>
                    <View style={[s.menuProgressFill, { width: `${pct * 100}%` as any }]} />
                  </View>
                  <View style={s.menuActions}>
                    <Pressable style={({ pressed }) => [s.menuActionBtn, pressed && { opacity: 0.75 }]}
                      onPress={() => { setMenuDebt(null); openEditDebt(menuDebt); }}>
                      <Ionicons name="pencil-outline" size={18} color={c.primary} />
                      <Text style={s.menuActionTxt}>Edit</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [s.menuActionBtn, s.menuActionDanger, pressed && { opacity: 0.75 }]}
                      onPress={() => { setMenuDebt(null); confirmDeleteDebt(menuDebt); }}>
                      <Ionicons name="trash-outline" size={18} color={c.error} />
                      <Text style={[s.menuActionTxt, { color: c.error }]}>Delete</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
            <View style={{ height: Math.max(16, insets.bottom) }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete debt confirmation */}
      <Modal visible={!!deleteDebtTarget} transparent animationType="fade" onRequestClose={() => setDeleteDebtTarget(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setDeleteDebtTarget(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            
            <View style={s.deleteIconRow}>
              <View style={s.deleteIconCircle}>
                <Ionicons name="trash-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.deleteTitle}>Delete debt?</Text>
            {deleteDebtTarget && (
              <Text style={s.deleteBody}>
                This will permanently delete <Text style={s.deleteBold}>{deleteDebtTarget.name}</Text> and all payments made towards it.
              </Text>
            )}
            <View style={s.sheetActions}>
              <Pressable style={s.cancelBtn} onPress={() => setDeleteDebtTarget(null)}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.deleteBtn, deleting && s.btnDisabled]} onPress={executeDeleteDebt} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.deleteBtnTxt}>Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete saving confirmation */}
      <Modal visible={!!deleteSavingTarget} transparent animationType="fade" onRequestClose={() => setDeleteSavingTarget(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setDeleteSavingTarget(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            
            <View style={s.deleteIconRow}>
              <View style={s.deleteIconCircle}>
                <Ionicons name="trash-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.deleteTitle}>Delete saving?</Text>
            {deleteSavingTarget && (
              <Text style={s.deleteBody}>
                Delete this entry of <Text style={s.deleteBold}>{fmt(Number(deleteSavingTarget.amount), currency)}</Text>?
                {deleteSavingTarget.note ? `\n${deleteSavingTarget.note}` : ''}
              </Text>
            )}
            <View style={s.sheetActions}>
              <Pressable style={s.cancelBtn} onPress={() => setDeleteSavingTarget(null)}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.deleteBtn, deleting && s.btnDisabled]} onPress={executeDeleteSaving} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.deleteBtnTxt}>Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Saving context menu */}
      <Modal visible={!!menuSaving} transparent animationType="fade" onRequestClose={() => setMenuSaving(null)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuSaving(null)}>
          <Pressable style={s.menuSheet} onPress={() => {}}>

            {menuSaving && (
              <>
                <View style={s.menuHeader}>
                  <Text style={s.menuEmoji}>💰</Text>
                  <View style={s.menuHeaderText}>
                    <Text style={s.menuTitle}>{menuSaving.note || 'Saving'}</Text>
                    <Text style={s.menuSub}>{fmtDate(menuSaving.created_at)}</Text>
                  </View>
                  <Text style={[s.menuStatVal, { color: c.success, fontSize: 20 }]}>+{fmt(Number(menuSaving.amount), currency)}</Text>
                </View>
                <View style={s.menuActions}>
                  <Pressable style={({ pressed }) => [s.menuActionBtn, pressed && { opacity: 0.75 }]}
                    onPress={() => { setMenuSaving(null); openEditSaving(menuSaving); }}>
                    <Ionicons name="pencil-outline" size={18} color={c.primary} />
                    <Text style={s.menuActionTxt}>Edit</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.menuActionBtn, s.menuActionDanger, pressed && { opacity: 0.75 }]}
                    onPress={() => { setMenuSaving(null); confirmDeleteSaving(menuSaving); }}>
                    <Ionicons name="trash-outline" size={18} color={c.error} />
                    <Text style={[s.menuActionTxt, { color: c.error }]}>Delete</Text>
                  </Pressable>
                </View>
              </>
            )}
            <View style={{ height: Math.max(16, insets.bottom) }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Savings goal modal */}
      <Modal visible={goalModalVisible} transparent animationType={Platform.OS === 'android' ? 'none' : 'fade'} onRequestClose={() => { if (!nativePickerOpen.current) closeGoalModal(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[s.modalOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={closeGoalModal}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetTitle}>Savings goal</Text>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={s.fieldLbl}>Icon</Text>
                <View style={s.iconGrid}>
                  {GOAL_ICONS.map(icon => (
                    <Pressable
                      key={icon}
                      style={[s.iconChip, goalIconInput === icon && s.iconChipActive]}
                      onPress={() => setGoalIconInput(icon)}>
                      <Text style={s.iconChipEmoji}>{icon}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.fieldLbl}>What are you saving for? <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional)</Text></Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Holiday, New car, Emergency fund"
                  placeholderTextColor={c.textFaint}
                  value={goalForInput}
                  onChangeText={setGoalForInput}
                  maxLength={40}
                />
                <Text style={s.fieldLbl}>Target amount</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 5000"
                  placeholderTextColor={c.textFaint}
                  keyboardType="decimal-pad"
                  value={goalInput}
                  onChangeText={setGoalInput}
                />
                <Text style={s.fieldLbl}>
                  Target date{' '}
                  <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional)</Text>
                </Text>
                <Pressable style={s.dateRow} onPress={openSavingsTargetPicker}>
                  <Ionicons name="calendar-outline" size={16} color={c.textMuted} />
                  <Text style={[s.dateRowTxt, !goalTargetDateInput && { color: c.textFaint }]}>
                    {goalTargetDateInput
                      ? goalTargetDateInput.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Set a target date'}
                  </Text>
                  {goalTargetDateInput && (
                    <Pressable onPress={() => setGoalTargetDateInput(null)} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={c.textFaint} />
                    </Pressable>
                  )}
                </Pressable>
                {savingsGoal && (
                  <Pressable
                    onPress={async () => {
                      try {
                        await AsyncStorage.multiRemove([SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY]);
                        await logGoalEvent('goal_deleted', savingsGoal, savingsGoalFor || null);
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                          await supabase.from('users').update({
                            savings_goal_amount: null, savings_goal_label: null,
                            savings_goal_icon: null, savings_target_date: null,
                          }).eq('id', user.id);
                        }
                        setSavingsGoal(null);
                        setSavingsGoalFor('');
                        setSavingsGoalIcon('🎯');
                        setSavingsTargetDate(null);
                        closeGoalModal();
                      } catch (e) {
                        console.warn('[tracker] remove goal error:', e);
                      }
                    }}
                    style={{ alignSelf: 'center', marginTop: 12 }}>
                    <Text style={{ color: c.error, fontSize: 13 }}>Remove goal</Text>
                  </Pressable>
                )}
              </ScrollView>
              <View style={s.sheetActions}>
                <Pressable style={s.cancelBtn} onPress={closeGoalModal}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.saveBtn, savingGoalBusy && { opacity: 0.6 }]} onPress={saveGoal} disabled={savingGoalBusy}>
                  <Text style={s.saveBtnTxt}>{savingGoalBusy ? 'Saving…' : 'Save goal'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Quick pay modal */}
      <Modal visible={!!quickPayDebt} transparent animationType="fade" onRequestClose={closeQuickPay}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[s.modalOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={closeQuickPay}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetTitle}>Log a payment</Text>
              {quickPayDebt && (
                <Text style={[s.fieldLbl, { marginTop: 4 }]}>{quickPayDebt.name}</Text>
              )}
              <Text style={s.fieldLbl}>Amount</Text>
              <TextInput
                style={s.input}
                placeholder={quickPayDebt ? `Up to ${fmt(Math.max(0, Number(quickPayDebt.total_amount) - (paidByDebt[quickPayDebt.id] ?? 0)), currency)}` : ''}
                placeholderTextColor={c.textFaint}
                keyboardType="decimal-pad"
                value={quickPayAmount}
                onChangeText={setQuickPayAmount}
                autoFocus
              />
              {quickPayDebt && (() => {
                const remaining = Math.max(0, Number(quickPayDebt.total_amount) - (paidByDebt[quickPayDebt.id] ?? 0));
                return remaining > 0 ? (
                  <Pressable style={s.payInFullBtn} onPress={() => setQuickPayAmount(String(Math.round(remaining * 100) / 100))}>
                    <Text style={s.payInFullTxt}>Pay in full · {fmt(remaining, currency)}</Text>
                  </Pressable>
                ) : null;
              })()}
              <Text style={s.fieldLbl}>Note <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional)</Text></Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Monthly instalment"
                placeholderTextColor={c.textFaint}
                value={quickPayNote}
                onChangeText={setQuickPayNote}
              />
              <View style={s.sheetActions}>
                <Pressable style={s.cancelBtn} onPress={closeQuickPay}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.saveBtn, submittingQuickPay && s.btnDisabled]} onPress={saveQuickPay} disabled={submittingQuickPay}>
                  {submittingQuickPay
                    ? <ActivityIndicator color={c.white} size="small" />
                    : <Text style={s.saveBtnTxt}>Save payment</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Session log modal */}
      <Modal visible={sessionModalVisible} transparent animationType="fade" onRequestClose={closeSessionModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[s.modalOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={closeSessionModal}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetTitle}>{editingSession ? 'Edit session' : 'Log a session'}</Text>
              {!editingSession && (
                <Text style={[s.fieldLbl, { color: c.textFaint, fontWeight: '400', textTransform: 'none', letterSpacing: 0, marginTop: 4 }]}>
                  This won't affect your debt or streak — it's just for your own awareness.
                </Text>
              )}
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={s.fieldLbl}>Amount lost</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 50"
                  placeholderTextColor={c.textFaint}
                  keyboardType="decimal-pad"
                  value={sessionAmount}
                  onChangeText={setSessionAmount}
                  autoFocus
                />
                <Text style={s.fieldLbl}>Type of gambling</Text>
                <View style={s.chipRow}>
                  {SESSION_CATEGORIES.map(cat => (
                    <Pressable
                      key={cat.key}
                      style={[s.chip, sessionCategory === cat.key && s.sessionChipActive]}
                      onPress={() => setSessionCategory(cat.key)}>
                      <Text style={[s.chipTxt, sessionCategory === cat.key && s.sessionChipTxtActive]}>
                        {cat.emoji} {cat.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.fieldLbl}>Note <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional)</Text></Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. what triggered it, how you felt"
                  placeholderTextColor={c.textFaint}
                  value={sessionNote}
                  onChangeText={setSessionNote}
                  maxLength={120}
                />
                <Text style={s.fieldLbl}>
                  Date <Text style={{ fontWeight: '400', color: c.textFaint }}>(optional — defaults to today)</Text>
                </Text>
                <Pressable style={s.dateRow} onPress={() => {
                  setEditTargetDate(sessionDate);
                  if (Platform.OS === 'ios') {
                    setShowSessionDateModal(true);
                  } else {
                    nativePickerOpen.current = true;
                    DateTimePickerAndroid.open({
                      value: sessionDate,
                      mode: 'date',
                      maximumDate: new Date(),
                      onChange: (_evt: any, d?: Date) => { nativePickerOpen.current = false; if (d) setSessionDate(d); },
                    });
                  }
                }}>
                  <Ionicons name="calendar-outline" size={16} color={c.textMuted} />
                  <Text style={s.dateRowTxt}>
                    {sessionDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
                    {sessionDate.toDateString() === new Date().toDateString() ? '  ·  today' : ''}
                  </Text>
                </Pressable>
              </ScrollView>
              <View style={s.sheetActions}>
                <Pressable style={s.cancelBtn} onPress={closeSessionModal}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.sessionSaveBtn, submittingSession && s.btnDisabled]} onPress={saveSession} disabled={submittingSession}>
                  {submittingSession
                    ? <ActivityIndicator color={c.white} size="small" />
                    : <Text style={s.saveBtnTxt}>{editingSession ? 'Save changes' : 'Log session'}</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Session context menu */}
      <Modal visible={!!menuSession} transparent animationType="fade" onRequestClose={() => setMenuSession(null)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuSession(null)}>
          <Pressable style={s.menuSheet} onPress={() => {}}>
            {menuSession && (
              <>
                <View style={s.menuHeader}>
                  <Text style={s.menuEmoji}>{sessionEmoji(menuSession.category)}</Text>
                  <View style={s.menuHeaderText}>
                    <Text style={s.menuTitle}>{sessionLabel(menuSession.category)}</Text>
                    <Text style={s.menuSub}>{fmtDate(menuSession.created_at)}{menuSession.note ? ` · ${menuSession.note}` : ''}</Text>
                  </View>
                  <Text style={[s.menuStatVal, { color: c.error, fontSize: 18 }]}>-{fmt(Number(menuSession.amount), currency)}</Text>
                </View>
                <View style={s.menuActions}>
                  <Pressable style={({ pressed }) => [s.menuActionBtn, pressed && { opacity: 0.75 }]}
                    onPress={() => { setMenuSession(null); openEditSession(menuSession); }}>
                    <Ionicons name="pencil-outline" size={18} color={c.primary} />
                    <Text style={s.menuActionTxt}>Edit</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.menuActionBtn, s.menuActionDanger, pressed && { opacity: 0.75 }]}
                    onPress={() => { setMenuSession(null); confirmDeleteSession(menuSession); }}>
                    <Ionicons name="trash-outline" size={18} color={c.error} />
                    <Text style={[s.menuActionTxt, { color: c.error }]}>Delete</Text>
                  </Pressable>
                </View>
              </>
            )}
            <View style={{ height: Math.max(16, insets.bottom) }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete session confirmation */}
      <Modal visible={!!deleteSessionTarget} transparent animationType="fade" onRequestClose={() => setDeleteSessionTarget(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setDeleteSessionTarget(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.deleteIconRow}>
              <View style={s.deleteIconCircle}>
                <Ionicons name="trash-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.deleteTitle}>Delete session?</Text>
            {deleteSessionTarget && (
              <Text style={s.deleteBody}>
                Delete this{' '}<Text style={s.deleteBold}>{fmt(Number(deleteSessionTarget.amount), currency)}</Text>{' '}
                {sessionLabel(deleteSessionTarget.category)} entry?
              </Text>
            )}
            <View style={s.sheetActions}>
              <Pressable style={s.cancelBtn} onPress={() => setDeleteSessionTarget(null)}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.deleteBtn, deleting && s.btnDisabled]} onPress={executeDeleteSession} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.deleteBtnTxt}>Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* iOS debt target date picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={showDebtTargetModal} transparent animationType="slide">
          <View style={s.iosModalOverlay}>
            <View style={s.iosModalSheet}>
              <Text style={s.iosModalTitle}>Debt payoff target</Text>
              <DateTimePicker
                value={editTargetDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_evt: any, d?: Date) => d && setEditTargetDate(new Date(d.getTime()))}
                style={{ height: 200 }}
              />
              <View style={s.iosModalActions}>
                <Pressable style={s.iosModalBtn} onPress={() => setShowDebtTargetModal(false)}>
                  <Text style={s.iosModalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.iosModalBtn, s.iosModalSave, savingTargetDate && { opacity: 0.5 }]}
                  disabled={savingTargetDate}
                  onPress={() => saveDebtTargetDate(editTargetDate)}>
                  <Text style={s.iosModalSaveTxt}>{savingTargetDate ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* iOS session date picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={showSessionDateModal} transparent animationType="slide">
          <View style={s.iosModalOverlay}>
            <View style={s.iosModalSheet}>
              <Text style={s.iosModalTitle}>When did this happen?</Text>
              <DateTimePicker
                value={editTargetDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_evt: any, d?: Date) => d && setEditTargetDate(new Date(d.getTime()))}
                style={{ height: 200 }}
              />
              <View style={s.iosModalActions}>
                <Pressable style={s.iosModalBtn} onPress={() => setShowSessionDateModal(false)}>
                  <Text style={s.iosModalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.iosModalBtn, s.iosModalSave]}
                  onPress={() => { setSessionDate(editTargetDate); setShowSessionDateModal(false); }}>
                  <Text style={s.iosModalSaveTxt}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* iOS savings target date picker (inside goal modal flow) */}
      {Platform.OS === 'ios' && (
        <Modal visible={showSavingsTargetModal} transparent animationType="slide">
          <View style={s.iosModalOverlay}>
            <View style={s.iosModalSheet}>
              <Text style={s.iosModalTitle}>Savings target date</Text>
              <DateTimePicker
                value={editTargetDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_evt: any, d?: Date) => d && setEditTargetDate(new Date(d.getTime()))}
                style={{ height: 200 }}
              />
              <View style={s.iosModalActions}>
                <Pressable style={s.iosModalBtn} onPress={() => setShowSavingsTargetModal(false)}>
                  <Text style={s.iosModalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.iosModalBtn, s.iosModalSave]}
                  onPress={() => { setGoalTargetDateInput(new Date(editTargetDate.getTime())); setShowSavingsTargetModal(false); }}>
                  <Text style={s.iosModalSaveTxt}>Confirm</Text>
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

  header: { paddingBottom: 16 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.white },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  summaryCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  summaryTitle: { fontSize: 12, fontWeight: '700', color: c.textFaint, textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryRow: { flexDirection: 'row' },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.borderSubtle },
  summaryVal: { fontSize: 18, fontWeight: '700' },
  summaryLbl: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: c.bgTeal, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: c.primary, borderRadius: 3 },
  progressLbl: { fontSize: 12, color: c.primary, fontWeight: '600', textAlign: 'center' },

  goalAmtRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 150 },

  savingsCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 0 },
  savingsCardTitle: { fontSize: 12, fontWeight: '700', color: c.textFaint, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savingsRowEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  savingsRowBody: { flex: 1 },
  savingsRowLabel: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  savingsRowSub: { fontSize: 12, color: c.textFaint, marginTop: 2 },
  savingsRowAmt: { fontSize: 17, fontWeight: '800' },
  savingsSep: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 12 },

  sectionDivider: { height: 1, backgroundColor: c.borderLight, marginTop: 6, marginBottom: 4 },

  tabBar: { flexDirection: 'row', backgroundColor: c.bgCard, borderRadius: 12, overflow: 'hidden' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', position: 'relative' },
  tabTxt: { fontSize: 14, fontWeight: '600', color: c.textFaint },
  tabTxtDebt: { color: c.error },
  tabTxtSaving: { color: c.primary },
  tabIndicator: { position: 'absolute', bottom: 0, left: 20, right: 20, height: 2.5, borderRadius: 2 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.bgCard, borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: c.primary,
  },
  addBtnTxt: { fontSize: 15, fontWeight: '700', color: c.primary },

  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  sortChip: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: c.bgElement, alignItems: 'center' },
  sortChipActive: { backgroundColor: c.primary },
  sortChipTxt: { fontSize: 12, fontWeight: '600', color: c.textFaint },
  sortChipTxtActive: { color: '#fff' },

  emptyCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: c.textFaint, textAlign: 'center', lineHeight: 22 },

  summaryEmpty: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  summaryEmptyIcon: { fontSize: 32 },
  summaryEmptyTitle: { fontSize: 15, fontWeight: '700', color: c.textBody },
  summaryEmptyBody: { fontSize: 13, color: c.textFaint, textAlign: 'center', lineHeight: 20 },

  debtCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  debtCardPaidOff: { borderWidth: 1.5, borderColor: c.primaryLight },
  debtCardOverdue: { borderLeftWidth: 3, borderLeftColor: c.error },
  debtTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  debtEmoji: { fontSize: 26 },
  debtInfo: { flex: 1 },
  debtName: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  debtMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  debtPayoff: { fontSize: 11, color: c.textFaint, marginTop: 3 },
  debtRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  debtPct: { fontSize: 13, fontWeight: '700', color: c.primary },
  debtProgressTrack: { height: 5, backgroundColor: c.bgTeal, borderRadius: 3, overflow: 'hidden' },
  debtProgressFill: { height: '100%', backgroundColor: c.primary, borderRadius: 3 },

  paidOffBadge: { backgroundColor: c.bgSuccess, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  paidOffBadgeTxt: { fontSize: 11, fontWeight: '700', color: c.success },

  quickPayBtn: {
    backgroundColor: c.bgTeal, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: c.primary,
  },
  quickPayTxt: { fontSize: 12, fontWeight: '700', color: c.primary },

  debtTargetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  debtTargetDate: { fontSize: 11, color: c.textMuted, fontWeight: '500', flex: 1 },
  debtTargetRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  debtTargetStat: { fontSize: 11, color: c.textMuted },
  debtTargetUnset: { fontSize: 11, color: c.primary, fontWeight: '500' },

  swipeHint: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  swipeHintDelete: { fontSize: 10, color: c.textError, fontWeight: '500', opacity: 0.6 },
  swipeHintPay: { fontSize: 10, color: c.primaryLight, fontWeight: '500' },

  menuBtn: { padding: 4 },

  savingCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16 },
  savingCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savingCardEmoji: { fontSize: 26 },
  savingCardInfo: { flex: 1 },
  savingCardLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  savingCardDate: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  savingCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savingCardAmt: { fontSize: 15, fontWeight: '700', color: c.success },

  savingsTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: c.bgCard, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 2, borderTopColor: c.bgTeal,
  },
  savingsTotalLbl: { fontSize: 13, fontWeight: '700', color: c.textBody },
  savingsTotalVal: { fontSize: 18, fontWeight: '800', color: c.success },


  goalRightSet: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  iconChip: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.bgElement, borderWidth: 1.5, borderColor: 'transparent',
  },
  iconChipActive: { borderColor: c.primary, backgroundColor: c.bgTeal },
  iconChipEmoji: { fontSize: 22 },

  swipeDeleteAction: {
    backgroundColor: c.error, borderRadius: 14, marginRight: 8,
    width: 72, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  swipeDeleteTxt: { fontSize: 12, fontWeight: '700', color: c.white },
  swipePayAction: {
    backgroundColor: c.primary, borderRadius: 14, marginLeft: 8,
    width: 72, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  swipePayTxt: { fontSize: 12, fontWeight: '700', color: c.white },

  input: {
    borderWidth: 1, borderColor: c.borderLight, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary, backgroundColor: c.bgInput,
  },
  fieldLbl: { fontSize: 13, color: c.textBody, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: c.borderMid, backgroundColor: c.bgInput,
  },
  chipActive: { borderColor: c.primary, backgroundColor: c.bgTeal },
  chipTxt: { fontSize: 13, color: c.textBody },
  chipTxtActive: { color: c.primary, fontWeight: '600' },

  menuOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay, padding: 24 },
  menuSheet: {
    backgroundColor: c.bgCard, borderRadius: 22,
    padding: 20, paddingTop: 12, width: '100%',
  },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, marginTop: 8 },
  menuEmoji: { fontSize: 32 },
  menuHeaderText: { flex: 1 },
  menuTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
  menuSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  menuStats: { flexDirection: 'row', backgroundColor: c.bgElement, borderRadius: 12, padding: 12, marginBottom: 10 },
  menuStat: { flex: 1, alignItems: 'center' },
  menuStatVal: { fontSize: 15, fontWeight: '700' },
  menuStatLbl: { fontSize: 11, color: c.textFaint, marginTop: 2 },
  menuProgressTrack: { height: 5, backgroundColor: c.bgTeal, borderRadius: 3, overflow: 'hidden', marginBottom: 20 },
  menuProgressFill: { height: '100%', backgroundColor: c.primary, borderRadius: 3 },
  menuActions: { flexDirection: 'row', gap: 10 },
  menuActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 12, backgroundColor: c.bgTealDeep,
    borderWidth: 1, borderColor: c.bgTealMid,
  },
  menuActionDanger: { backgroundColor: c.bgError, borderColor: c.borderError },
  menuActionTxt: { fontSize: 15, fontWeight: '600', color: c.primary },

  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay, padding: 24 },
  sheet: {
    backgroundColor: c.bgCard, borderRadius: 22, padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.bgElement },
  cancelBtnTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.primary },
  saveBtnTxt: { color: c.white, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },

  deleteIconRow: { alignItems: 'center', marginBottom: 12 },
  deleteIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: c.bgError, borderWidth: 1.5, borderColor: c.borderError,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  deleteBody: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 21, marginBottom: 4 },
  deleteBold: { fontWeight: '700', color: c.textSecondary },
  deleteBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.error },
  deleteBtnTxt: { color: c.white, fontWeight: '700', fontSize: 15 },

  targetCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  targetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  targetTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
  targetEditBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.bgTeal, borderRadius: 8 },
  targetEditTxt: { fontSize: 12, fontWeight: '600', color: c.primary },
  targetEmpty: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
  targetRows: { gap: 8 },
  targetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetLbl: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  targetVal: { fontSize: 13, color: c.textPrimary, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  paceBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  paceBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },

  pacingFooter: {
    marginTop: 6, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderLight,
  },
  pacingFooterSet: { fontSize: 12, color: c.primary, fontWeight: '500' },
  pacingFooterRow: { gap: 4 },
  pacingFooterDate: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  pacingFooterStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pacingFooterStat: { fontSize: 12, color: c.textMuted },

  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: c.borderLight, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: c.bgInput,
  },
  dateRowTxt: { flex: 1, fontSize: 15, color: c.textPrimary },

  iosModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  iosModalSheet: { backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  iosModalTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  iosModalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  iosModalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: c.bgElement },
  iosModalSave: { backgroundColor: c.primary },
  iosModalCancel: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  iosModalSaveTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  tabTxtSession: { color: SESSION_COLOR },

  sessionInfoCard: {
    backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10,
    borderLeftWidth: 3, borderLeftColor: SESSION_COLOR,
  },
  sessionInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  sessionInfoIcon: { fontSize: 22 },
  sessionInfoTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  sessionInfoBody: { fontSize: 13, color: c.textBody, lineHeight: 20 },
  sessionInfoBold: { fontWeight: '700', color: c.textSecondary },
  sessionInfoTip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sessionInfoTipTxt: { fontSize: 12, color: SESSION_COLOR, fontWeight: '500' },

  sessionSummaryCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16 },
  sessionSummaryRow: { flexDirection: 'row' },
  sessionSummaryCol: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  sessionSummaryVal: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  sessionSummaryLbl: { fontSize: 11, color: c.textMuted, marginTop: 2 },

  sessionCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16 },
  sessionCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionCardEmoji: { fontSize: 26 },
  sessionCardInfo: { flex: 1 },
  sessionCardLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  sessionCardNote: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  sessionCardDate: { fontSize: 12, color: c.textFaint, marginTop: 2 },
  sessionCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionCardAmt: { fontSize: 15, fontWeight: '700', color: c.error },

  sessionChipActive: { borderColor: SESSION_COLOR, backgroundColor: SESSION_CHIP_BG },
  sessionChipTxtActive: { color: SESSION_COLOR, fontWeight: '600' },
  sessionSaveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: SESSION_COLOR },

  payInFullBtn: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: c.bgTeal, borderRadius: 8,
  },
  payInFullTxt: { fontSize: 13, fontWeight: '600', color: c.primary },
});
