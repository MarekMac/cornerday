import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

type MainTab = 'debts' | 'saving';

interface Debt {
  id: string;
  name: string;
  total_amount: number;
  category: string;
  created_at: string;
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

function fmtLive(amount: number, currency = 'USD') {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const s = syms[currency] ?? currency;
  return `${s}${amount.toFixed(1)}`;
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

function fmtPayoffDate(d: Date): string {
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  if (days <= 1) return 'Very soon';
  if (days < 8) return `In ${days} days`;
  if (days < 60) return `In ~${Math.round(days / 7)} weeks`;
  return `~${d.toLocaleDateString([], { month: 'short', year: 'numeric' })}`;
}

function debtProgressColor(pct: number): string {
  if (pct >= 1) return '#0a7a4e';
  if (pct >= 0.7) return '#0F6E6E';
  if (pct >= 0.4) return '#e67e22';
  return '#c0392b';
}

function parseQuitDate(quitDate: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(quitDate)) {
    const [y, mo, d] = quitDate.split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return new Date(quitDate);
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
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

  // Quick pay modal
  const [quickPayDebt, setQuickPayDebt] = useState<Debt | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayNote, setQuickPayNote] = useState('');
  const [submittingQuickPay, setSubmittingQuickPay] = useState(false);

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

  // Swipe refs — one per debt card
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());
  // Prevent useFocusEffect from duplicating the initial useEffect fetch
  const initialFetchDone = useRef(false);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [debtsRes, paymentsRes, savingsRes, profileRes, rawGoal, rawFor, rawIcon] = await Promise.all([
      supabase.from('debts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('debt_payments').select('debt_id, amount').eq('user_id', user.id),
      supabase.from('losses').select('id, amount, note, created_at').eq('user_id', user.id).eq('type', 'saving').order('created_at', { ascending: false }),
      supabase.from('users').select('currency, weekly_bet, quit_timestamp, quit_date, debt_target_date, savings_target_date').eq('id', user.id).maybeSingle(),
      AsyncStorage.getItem(SAVINGS_GOAL_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_FOR_KEY),
      AsyncStorage.getItem(SAVINGS_GOAL_ICON_KEY),
    ]);

    setDebts((debtsRes.data ?? []) as Debt[]);
    setPayments((paymentsRes.data ?? []) as DebtPayment[]);
    setSavings((savingsRes.data ?? []) as SavingEntry[]);
    if (profileRes.data) {
      setCurrency(profileRes.data.currency ?? 'USD');
      setWeeklyBet(profileRes.data.weekly_bet ?? null);
      setQuitTs(profileRes.data.quit_timestamp ?? profileRes.data.quit_date ?? null);
      setDebtTargetDate(profileRes.data.debt_target_date ? new Date(profileRes.data.debt_target_date) : null);
      setSavingsTargetDate(profileRes.data.savings_target_date ? new Date(profileRes.data.savings_target_date) : null);
    }
    setSavingsGoal(rawGoal ? Number(rawGoal) : null);
    setSavingsGoalFor(rawFor ?? '');
    setSavingsGoalIcon(rawIcon ?? '🎯');
  }, []);

  useEffect(() => { fetchAll().finally(() => { setLoading(false); initialFetchDone.current = true; }); }, [fetchAll]);
  useFocusEffect(useCallback(() => { if (initialFetchDone.current) fetchAll(); }, [fetchAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
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
    setDebtModalVisible(true);
  };

  const openEditDebt = (debt: Debt) => {
    setEditingDebt(debt);
    setDebtName(debt.name);
    setDebtAmount(String(debt.total_amount));
    setDebtCategory(debt.category);
    setDebtModalVisible(true);
  };

  const closeDebtModal = () => {
    Keyboard.dismiss();
    setDebtModalVisible(false);
    setEditingDebt(null);
    setDebtName(''); setDebtAmount(''); setDebtCategory('other');
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
        if (editingDebt) {
          await supabase.from('debts').update({
            name: debtName.trim(), total_amount: amount, category: debtCategory,
          }).eq('id', editingDebt.id);
          await supabase.from('losses').insert({
            user_id: user.id, type: 'debt_edited', amount, category: 'Debt', note: debtName.trim(),
          });
        } else {
          await supabase.from('debts').insert({
            user_id: user.id, name: debtName.trim(),
            total_amount: amount, category: debtCategory,
          });
        }
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
        await supabase.from('debts').delete().eq('id', deleteDebtTarget.id);
        await supabase.from('losses').insert({
          user_id: user.id, type: 'debt_deleted', amount: deleteDebtTarget.total_amount,
          category: 'Debt', note: deleteDebtTarget.name,
        });
      }
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
    Keyboard.dismiss();
    setSavingModalVisible(false);
    setEditingSaving(null);
    setSavingAmount(''); setSavingNote('');
  };

  const saveSaving = async () => {
    const amount = parseFloat(savingAmount.trim());
    if (!savingAmount.trim() || isNaN(amount) || !isFinite(amount) || amount <= 0) {
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
          }).eq('id', editingSaving.id);
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
        await supabase.from('losses').delete().eq('id', deleteSavingTarget.id);
        await supabase.from('losses').insert({
          user_id: user.id, type: 'saving_deleted', amount: deleteSavingTarget.amount,
          category: 'Saving', note: deleteSavingTarget.note,
        });
      }
      setDeleteSavingTarget(null);
      await fetchAll();
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
    if (goalInput && (isNaN(val) || !isFinite(val) || val <= 0)) {
      Alert.alert('Invalid amount', 'Please enter a valid goal amount.');
      return;
    }
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
    // Persist savings target date to DB
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({
        savings_target_date: goalTargetDateInput ? goalTargetDateInput.toISOString().split('T')[0] : null,
      }).eq('id', user.id);
      setSavingsTargetDate(goalTargetDateInput);
    }
    closeGoalModal();
  };

  const saveDebtTargetDate = async (date: Date) => {
    setSavingTargetDate(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ debt_target_date: date.toISOString().split('T')[0] }).eq('id', user.id);
      setDebtTargetDate(date);
    }
    setSavingTargetDate(false);
    setShowDebtTargetModal(false);
  };

  const openDebtTargetPicker = () => {
    const seed = debtTargetDate ?? new Date(Date.now() + 90 * 86400000);
    setEditTargetDate(seed);
    if (Platform.OS === 'ios') {
      setShowDebtTargetModal(true);
    } else {
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'date',
        minimumDate: new Date(),
        onValueChange: (_evt: any, d?: Date) => { if (d) saveDebtTargetDate(d); },
      });
    }
  };

  const openSavingsTargetPicker = () => {
    const seed = goalTargetDateInput ?? new Date(Date.now() + 90 * 86400000);
    setEditTargetDate(seed);
    if (Platform.OS === 'ios') {
      setShowSavingsTargetModal(true);
    } else {
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'date',
        minimumDate: new Date(),
        onValueChange: (_evt: any, d?: Date) => { if (d) { setGoalTargetDateInput(d); setShowSavingsTargetModal(false); } },
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
    Keyboard.dismiss();
    setQuickPayDebt(null);
    setQuickPayAmount('');
    setQuickPayNote('');
  };

  const saveQuickPay = async () => {
    if (!quickPayDebt) return;
    const val = parseFloat(quickPayAmount);
    if (!quickPayAmount || isNaN(val) || val <= 0) {
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
          await supabase.from('losses').insert({
            user_id: user.id, type: 'debt_paid_off', amount: Number(quickPayDebt.total_amount),
            category: 'Debt', note: quickPayDebt.name,
          });
        }
        closeQuickPay();
        await fetchAll();
      }
    } finally {
      setSubmittingQuickPay(false);
    }
  };

  // Sort: unpaid first (by remaining desc), paid-off last
  const sortedDebts = [...debts].sort((a, b) => {
    const paidA = paidByDebt[a.id] ?? 0;
    const paidB = paidByDebt[b.id] ?? 0;
    const remA = Math.max(0, Number(a.total_amount) - paidA);
    const remB = Math.max(0, Number(b.total_amount) - paidB);
    const doneA = remA === 0 && paidA > 0;
    const doneB = remB === 0 && paidB > 0;
    if (doneA !== doneB) return doneA ? 1 : -1;
    return remB - remA;
  });

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[c.headerGradDeep, c.headerGradStart, c.headerGradEnd]} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Financial Tracker</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={s.body}
          contentContainerStyle={s.bodyContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F6E6E" colors={['#0F6E6E']} />}
        >

          {/* Debt recovery card */}
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>Debt recovery</Text>
            {totalDebt === 0 ? (
              <View style={s.summaryEmpty}>
                <Text style={s.summaryEmptyIcon}>💳</Text>
                <Text style={s.summaryEmptyTitle}>No debts tracked yet</Text>
                <Text style={s.summaryEmptyBody}>Add a debt below to start tracking your recovery progress.</Text>
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
                {(() => {
                  const daysElapsed = days;
                  const daysRemaining = debtTargetDate ? Math.ceil((debtTargetDate.getTime() - Date.now()) / 86400000) : null;
                  const requiredPerDay = daysRemaining && daysRemaining > 0 && stillOwed > 0 ? stillOwed / daysRemaining : null;
                  const actualPerDay = daysElapsed > 0 && totalPaid > 0 ? totalPaid / daysElapsed : null;
                  const isAhead = requiredPerDay !== null && actualPerDay !== null ? actualPerDay >= requiredPerDay : null;
                  return (
                    <Pressable onPress={openDebtTargetPicker} style={s.pacingFooter}>
                      {!debtTargetDate ? (
                        <Text style={s.pacingFooterSet}>📅 Set payoff target date</Text>
                      ) : (
                        <View style={s.pacingFooterRow}>
                          <Text style={s.pacingFooterDate}>
                            📅 {debtTargetDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                            {daysRemaining !== null && (
                              <Text style={{ color: daysRemaining <= 0 ? c.error : c.textFaint }}>
                                {daysRemaining > 0 ? `  ·  ${daysRemaining}d left` : '  ·  Past target'}
                              </Text>
                            )}
                          </Text>
                          <View style={s.pacingFooterStats}>
                            {requiredPerDay !== null && (
                              <Text style={s.pacingFooterStat}>Need {fmt(requiredPerDay, currency)}/day</Text>
                            )}
                            {actualPerDay !== null && isAhead !== null && (
                              <View style={[s.paceBadge, { backgroundColor: isAhead ? c.success : c.error }]}>
                                <Text style={s.paceBadgeTxt}>{isAhead ? '▲ Ahead' : '▼ Behind'}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      )}
                    </Pressable>
                  );
                })()}
              </>
            )}
          </View>

          {/* Savings card */}
          <View style={s.savingsCard}>
            <Text style={s.savingsCardTitle}>Savings</Text>
            <View style={s.savingsRow}>
              <Text style={s.savingsRowEmoji}>💸</Text>
              <View style={s.savingsRowBody}>
                <Text style={s.savingsRowLabel}>Not spent since day one</Text>
                <Text style={s.savingsRowSub}>
                  {weeklyBet ? `Theoretical · ${fmt(Number(weeklyBet), currency)}/week` : 'Set weekly spending in Account'}
                </Text>
              </View>
              <Text style={[s.savingsRowAmt, { color: c.textMuted }]}>{fmtLive(autoSaved, currency)}</Text>
            </View>
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
              {tab === 'debts' && <View style={[s.tabIndicator, { backgroundColor: '#c0392b' }]} />}
            </Pressable>
            <Pressable style={s.tabBtn} onPress={() => setTab('saving')}>
              <Text style={[s.tabTxt, tab === 'saving' && s.tabTxtSaving]}>Savings</Text>
              {tab === 'saving' && <View style={[s.tabIndicator, { backgroundColor: '#0F6E6E' }]} />}
            </Pressable>
          </View>

          {/* Debts tab */}
          {tab === 'debts' && (
            <>
              <Pressable
                style={({ pressed }) => [s.addBtn, { borderColor: '#c0392b' }, pressed && { opacity: 0.85 }]}
                onPress={openAddDebt}>
                <Ionicons name="add-circle-outline" size={18} color={c.error} />
                <Text style={[s.addBtnTxt, { color: c.error }]}>Add a debt</Text>
              </Pressable>

              {debts.length === 0 ? (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTxt}>No debts added yet.{'\n'}Tap "Add a debt" to start tracking what you owe.</Text>
                </View>
              ) : (
                sortedDebts.map(debt => {
                  const paid = paidByDebt[debt.id] ?? 0;
                  const remaining = Math.max(0, Number(debt.total_amount) - paid);
                  const pct = Number(debt.total_amount) > 0
                    ? Math.min(1, paid / Number(debt.total_amount)) : 0;
                  const isPaidOff = remaining === 0 && paid > 0;

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
                        style={({ pressed }) => [s.debtCard, isPaidOff && s.debtCardPaidOff, pressed && { opacity: 0.85 }]}
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
                            <Pressable onPress={() => handleDebtMenu(debt)} hitSlop={10} style={s.menuBtn}>
                              <Ionicons name="ellipsis-horizontal" size={18} color={c.textFaint} />
                            </Pressable>
                          </View>
                        </View>
                        <View style={s.debtProgressTrack}>
                          <View style={[s.debtProgressFill, { width: `${pct * 100}%` as any, backgroundColor: debtProgressColor(pct) }]} />
                        </View>
                        {!isPaidOff && (
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
                <View style={s.emptyCard}>
                  <Text style={s.emptyTxt}>No savings logged yet.{'\n'}Tap "Log a saving" to record money you've set aside.</Text>
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
                          <Pressable onPress={() => handleSavingMenu(entry)} hitSlop={10} style={s.menuBtn}>
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

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Debt modal — add & edit */}
      <Modal visible={debtModalVisible} transparent animationType="fade" onRequestClose={closeDebtModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.modalOverlay} onPress={closeDebtModal}>
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
                    <Pressable onPress={async e => {
                      e.stopPropagation();
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) await supabase.from('users').update({ debt_target_date: null }).eq('id', user.id);
                      setDebtTargetDate(null);
                    }} hitSlop={10}>
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
          <Pressable style={s.modalOverlay} onPress={closeSavingModal}>
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
      <Modal visible={goalModalVisible} transparent animationType="fade" onRequestClose={closeGoalModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.modalOverlay} onPress={closeGoalModal}>
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
                      await AsyncStorage.multiRemove([SAVINGS_GOAL_KEY, SAVINGS_GOAL_FOR_KEY, SAVINGS_GOAL_ICON_KEY]);
                      await logGoalEvent('goal_deleted', savingsGoal, savingsGoalFor || null);
                      setSavingsGoal(null);
                      setSavingsGoalFor('');
                      setSavingsGoalIcon('🎯');
                      closeGoalModal();
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
                <Pressable style={s.saveBtn} onPress={saveGoal}>
                  <Text style={s.saveBtnTxt}>Save goal</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Quick pay modal */}
      <Modal visible={!!quickPayDebt} transparent animationType="fade" onRequestClose={closeQuickPay}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.modalOverlay} onPress={closeQuickPay}>
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
                onValueChange={(_evt: any, d?: Date) => d && setEditTargetDate(new Date(d.getTime()))}
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
                onValueChange={(_evt: any, d?: Date) => d && setEditTargetDate(new Date(d.getTime()))}
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

  emptyCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: c.textFaint, textAlign: 'center', lineHeight: 22 },

  summaryEmpty: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  summaryEmptyIcon: { fontSize: 32 },
  summaryEmptyTitle: { fontSize: 15, fontWeight: '700', color: c.textBody },
  summaryEmptyBody: { fontSize: 13, color: c.textFaint, textAlign: 'center', lineHeight: 20 },

  debtCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  debtCardPaidOff: { borderWidth: 1.5, borderColor: c.primaryLight },
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

  paidOffBadge: { backgroundColor: '#e8f5e9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  paidOffBadgeTxt: { fontSize: 11, fontWeight: '700', color: c.success },

  quickPayBtn: {
    backgroundColor: c.bgTeal, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: c.primary,
  },
  quickPayTxt: { fontSize: 12, fontWeight: '700', color: c.primary },

  swipeHint: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  swipeHintDelete: { fontSize: 10, color: '#e8a89e', fontWeight: '500' },
  swipeHintPay: { fontSize: 10, color: '#8cc8c0', fontWeight: '500' },

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
});
