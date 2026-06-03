import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

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

function fmt(amount: number, currency = 'USD') {
  const syms: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$',
  };
  const s = syms[currency] ?? currency;
  if (amount >= 1000) return `${s}${(amount / 1000).toFixed(1)}k`;
  return `${s}${Math.round(amount)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function streakDays(quitTimestamp: string | null) {
  if (!quitTimestamp) return 0;
  const ms = Date.now() - new Date(quitTimestamp).getTime();
  return ms < 0 ? 0 : Math.floor(ms / 86400000);
}

export default function TrackerIndex() {
  const [tab, setTab] = useState<MainTab>('debts');
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [savings, setSavings] = useState<SavingEntry[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [weeklyBet, setWeeklyBet] = useState<string | null>(null);
  const [quitTs, setQuitTs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [debtsRes, paymentsRes, savingsRes, profileRes] = await Promise.all([
      supabase.from('debts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('debt_payments').select('debt_id, amount').eq('user_id', user.id),
      supabase.from('losses').select('id, amount, note, created_at').eq('user_id', user.id).eq('type', 'saving').order('created_at', { ascending: false }),
      supabase.from('users').select('currency, weekly_bet, quit_timestamp').eq('id', user.id).single(),
    ]);

    setDebts((debtsRes.data ?? []) as Debt[]);
    setPayments((paymentsRes.data ?? []) as DebtPayment[]);
    setSavings((savingsRes.data ?? []) as SavingEntry[]);
    if (profileRes.data) {
      setCurrency(profileRes.data.currency ?? 'USD');
      setWeeklyBet(profileRes.data.weekly_bet ?? null);
      setQuitTs(profileRes.data.quit_timestamp ?? null);
    }
  }, []);

  useEffect(() => { fetchAll().finally(() => setLoading(false)); }, [fetchAll]);
  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const paidByDebt: Record<string, number> = {};
  payments.forEach(p => { paidByDebt[p.debt_id] = (paidByDebt[p.debt_id] ?? 0) + Number(p.amount); });

  const totalDebt = debts.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalPaid = Object.values(paidByDebt).reduce((s, v) => s + v, 0);
  const stillOwed = Math.max(0, totalDebt - totalPaid);
  const recoveryPct = totalDebt > 0 ? Math.min(1, totalPaid / totalDebt) : 0;

  const days = streakDays(quitTs);
  const autoSaved = weeklyBet ? Math.round(days * (Number(weeklyBet) / 7)) : 0;
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
    setDebtModalVisible(false);
    setEditingDebt(null);
  };

  const saveDebt = async () => {
    const amount = parseFloat(debtAmount);
    if (!debtName.trim() || isNaN(amount) || amount <= 0) {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      if (editingDebt) {
        await supabase.from('debts').update({
          name: debtName.trim(), total_amount: amount, category: debtCategory,
        }).eq('id', editingDebt.id);
      } else {
        await supabase.from('debts').insert({
          user_id: user.id, name: debtName.trim(),
          total_amount: amount, category: debtCategory,
        });
      }
      closeDebtModal();
      await fetchAll();
    }
    setSavingDebt(false);
  };

  const handleDebtMenu = (debt: Debt) => {
    Alert.alert(debt.name, undefined, [
      { text: 'Edit', onPress: () => openEditDebt(debt) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteDebt(debt) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDeleteDebt = (debt: Debt) => {
    Alert.alert(
      'Delete debt?',
      `This will permanently delete "${debt.name}" and all payments made towards it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('debts').delete().eq('id', debt.id);
          await fetchAll();
        }},
      ],
    );
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
    setSavingModalVisible(false);
    setEditingSaving(null);
  };

  const saveSaving = async () => {
    const amount = parseFloat(savingAmount);
    if (!savingAmount || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      if (editingSaving) {
        await supabase.from('losses').update({
          amount, note: savingNote.trim() || null,
        }).eq('id', editingSaving.id);
      } else {
        await supabase.from('losses').insert({
          user_id: user.id, type: 'saving', amount,
          category: 'Saving', note: savingNote.trim() || null,
        });
      }
      closeSavingModal();
      await fetchAll();
    }
    setSubmitting(false);
  };

  const handleSavingMenu = (entry: SavingEntry) => {
    Alert.alert(entry.note || 'Saving', undefined, [
      { text: 'Edit', onPress: () => openEditSaving(entry) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteSaving(entry) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDeleteSaving = (entry: SavingEntry) => {
    Alert.alert(
      'Delete saving?',
      `Delete this entry of ${fmt(Number(entry.amount), currency)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('losses').delete().eq('id', entry.id);
          await fetchAll();
        }},
      ],
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#0F6E6E" /></View>;
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Financial Tracker</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">

          {/* Summary */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryCol}>
                <Text style={[s.summaryVal, { color: '#c0392b' }]}>{fmt(totalDebt, currency)}</Text>
                <Text style={s.summaryLbl}>Total debt</Text>
              </View>
              <View style={[s.summaryCol, s.summaryMid]}>
                <Text style={[s.summaryVal, { color: '#0F6E6E' }]}>{fmt(totalPaid, currency)}</Text>
                <Text style={s.summaryLbl}>Paid back</Text>
              </View>
              <View style={s.summaryCol}>
                <Text style={[s.summaryVal, { color: '#555' }]}>{fmt(stillOwed, currency)}</Text>
                <Text style={s.summaryLbl}>Still owed</Text>
              </View>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${recoveryPct * 100}%` as any }]} />
            </View>
            <Text style={s.progressLbl}>{Math.round(recoveryPct * 100)}% recovered</Text>

            {weeklyBet ? (
              <View style={s.savingsRow}>
                <Text style={s.savingsIcon}>💰</Text>
                <View style={s.savingsText}>
                  <Text style={s.savingsLabel}>Saved by not gambling</Text>
                  <Text style={s.savingsHint}>{fmt(Number(weeklyBet), currency)}/week · {days} day{days !== 1 ? 's' : ''}</Text>
                </View>
                <Text style={s.savingsAmount}>{fmt(autoSaved, currency)}</Text>
              </View>
            ) : null}

            {totalManualSavings > 0 && (
              <View style={[s.savingsRow, { borderTopWidth: 0, paddingTop: 0, marginTop: -4 }]}>
                <Text style={s.savingsIcon}>🏦</Text>
                <View style={s.savingsText}>
                  <Text style={s.savingsLabel}>Manually logged savings</Text>
                </View>
                <Text style={s.savingsAmount}>{fmt(totalManualSavings, currency)}</Text>
              </View>
            )}
          </View>

          {/* Tabs */}
          <View style={s.tabBar}>
            {(['debts', 'saving'] as MainTab[]).map(t => (
              <Pressable key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
                  {t === 'debts' ? 'Debts' : 'Savings'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Debts tab */}
          {tab === 'debts' && (
            <>
              <Pressable
                style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }]}
                onPress={openAddDebt}>
                <Ionicons name="add-circle-outline" size={18} color="#0F6E6E" />
                <Text style={s.addBtnTxt}>Add a debt</Text>
              </Pressable>

              {debts.length === 0 ? (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTxt}>No debts added yet.{'\n'}Tap "Add a debt" to start tracking what you owe.</Text>
                </View>
              ) : (
                debts.map(debt => {
                  const paid = paidByDebt[debt.id] ?? 0;
                  const remaining = Math.max(0, Number(debt.total_amount) - paid);
                  const pct = Number(debt.total_amount) > 0
                    ? Math.min(1, paid / Number(debt.total_amount)) : 0;
                  return (
                    <Pressable
                      key={debt.id}
                      style={({ pressed }) => [s.debtCard, pressed && { opacity: 0.85 }]}
                      onPress={() => router.push(`/tracker/${debt.id}`)}>
                      <View style={s.debtTop}>
                        <Text style={s.debtEmoji}>{categoryEmoji(debt.category)}</Text>
                        <View style={s.debtInfo}>
                          <Text style={s.debtName}>{debt.name}</Text>
                          <Text style={s.debtMeta}>
                            {fmt(paid, currency)} paid · {fmt(remaining, currency)} remaining
                          </Text>
                        </View>
                        <View style={s.debtRight}>
                          <Text style={s.debtPct}>{Math.round(pct * 100)}%</Text>
                          <Pressable onPress={() => handleDebtMenu(debt)} hitSlop={10} style={s.menuBtn}>
                            <Ionicons name="ellipsis-horizontal" size={18} color="#bbb" />
                          </Pressable>
                        </View>
                      </View>
                      <View style={s.debtProgressTrack}>
                        <View style={[s.debtProgressFill, { width: `${pct * 100}%` as any }]} />
                      </View>
                    </Pressable>
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
                <Ionicons name="add-circle-outline" size={18} color="#0F6E6E" />
                <Text style={s.addBtnTxt}>Log a saving</Text>
              </Pressable>

              {savings.length === 0 ? (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTxt}>No savings logged yet.{'\n'}Tap "Log a saving" to record money you've set aside.</Text>
                </View>
              ) : (
                <View style={s.card}>
                  <Text style={s.cardTitle}>My Savings</Text>
                  {savings.map(entry => (
                    <View key={entry.id} style={s.savingItem}>
                      <View style={s.savingLeft}>
                        <Text style={s.savingLabel}>{entry.note || 'Saving'}</Text>
                        <Text style={s.savingDate}>{fmtDate(entry.created_at)}</Text>
                      </View>
                      <View style={s.savingRight}>
                        <Text style={s.savingAmt}>+{fmt(Number(entry.amount), currency)}</Text>
                        <Pressable onPress={() => handleSavingMenu(entry)} hitSlop={10} style={s.menuBtn}>
                          <Ionicons name="ellipsis-horizontal" size={18} color="#bbb" />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Debt modal — add & edit */}
      <Modal visible={debtModalVisible} transparent animationType="slide"
        onRequestClose={closeDebtModal}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.modalBackdrop} onPress={closeDebtModal} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{editingDebt ? 'Edit debt' : 'Add a debt'}</Text>

            <Text style={s.fieldLbl}>Name</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Bank loan, Friend — John"
              placeholderTextColor="#bbb"
              value={debtName}
              onChangeText={setDebtName}
              maxLength={60}
            />

            <Text style={s.fieldLbl}>Total amount owed</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 2000"
              placeholderTextColor="#bbb"
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

            <View style={s.sheetActions}>
              <Pressable style={s.cancelBtn} onPress={closeDebtModal}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.saveBtn, savingDebt && s.btnDisabled]}
                onPress={saveDebt}
                disabled={savingDebt}>
                {savingDebt
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.saveBtnTxt}>{editingDebt ? 'Save changes' : 'Add debt'}</Text>}
              </Pressable>
            </View>
            <View style={{ height: 16 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Saving modal — add & edit */}
      <Modal visible={savingModalVisible} transparent animationType="slide"
        onRequestClose={closeSavingModal}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.modalBackdrop} onPress={closeSavingModal} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{editingSaving ? 'Edit saving' : 'Log a saving'}</Text>

            <Text style={s.fieldLbl}>Amount</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 100"
              placeholderTextColor="#bbb"
              keyboardType="decimal-pad"
              value={savingAmount}
              onChangeText={setSavingAmount}
            />

            <Text style={s.fieldLbl}>Note <Text style={{ fontWeight: '400', color: '#aaa' }}>(optional)</Text></Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Savings account, Holiday fund"
              placeholderTextColor="#bbb"
              value={savingNote}
              onChangeText={setSavingNote}
            />

            <View style={s.sheetActions}>
              <Pressable style={s.cancelBtn} onPress={closeSavingModal}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.saveBtn, submitting && s.btnDisabled]}
                onPress={saveSaving}
                disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.saveBtnTxt}>{editingSaving ? 'Save changes' : 'Add saving'}</Text>}
              </Pressable>
            </View>
            <View style={{ height: 16 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f7f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 16 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  summaryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  summaryRow: { flexDirection: 'row' },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#f0f0f0' },
  summaryVal: { fontSize: 18, fontWeight: '700' },
  summaryLbl: { fontSize: 11, color: '#888', marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: '#e6f7f7', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#0F6E6E', borderRadius: 3 },
  progressLbl: { fontSize: 12, color: '#0F6E6E', fontWeight: '600', textAlign: 'center' },

  savingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, marginTop: 2,
  },
  savingsIcon: { fontSize: 20 },
  savingsText: { flex: 1, gap: 2 },
  savingsLabel: { fontSize: 13, fontWeight: '600', color: '#111' },
  savingsHint: { fontSize: 11, color: '#888' },
  savingsAmount: { fontSize: 16, fontWeight: '700', color: '#0a7a4e' },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#0F6E6E' },
  tabTxt: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTxtActive: { color: '#fff' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#0F6E6E',
  },
  addBtnTxt: { fontSize: 15, fontWeight: '700', color: '#0F6E6E' },

  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 22 },

  debtCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  debtTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  debtEmoji: { fontSize: 26 },
  debtInfo: { flex: 1 },
  debtName: { fontSize: 15, fontWeight: '700', color: '#111' },
  debtMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  debtRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  debtPct: { fontSize: 13, fontWeight: '700', color: '#0F6E6E' },
  debtProgressTrack: { height: 5, backgroundColor: '#e6f7f7', borderRadius: 3, overflow: 'hidden' },
  debtProgressFill: { height: '100%', backgroundColor: '#0F6E6E', borderRadius: 3 },

  menuBtn: { padding: 4 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 14 },

  savingItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  savingLeft: { flex: 1, gap: 2 },
  savingLabel: { fontSize: 14, fontWeight: '600', color: '#111' },
  savingDate: { fontSize: 12, color: '#888' },
  savingRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savingAmt: { fontSize: 15, fontWeight: '700', color: '#0a7a4e' },

  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111', backgroundColor: '#fafafa',
  },
  fieldLbl: { fontSize: 13, color: '#555', fontWeight: '600', marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa',
  },
  chipActive: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  chipTxt: { fontSize: 13, color: '#555' },
  chipTxtActive: { color: '#0F6E6E', fontWeight: '600' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 4 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f5f5f5' },
  cancelBtnTxt: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0F6E6E' },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
});
