import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { router, useLocalSearchParams } from 'expo-router';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

interface Debt {
  id: string;
  name: string;
  total_amount: number;
  category: string;
  created_at: string;
  target_date: string | null;
}

interface Payment {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
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

function debtProgressColor(pct: number): string {
  if (pct >= 1) return '#0a7a4e';
  if (pct >= 0.7) return '#0F6E6E';
  if (pct >= 0.4) return '#e67e22';
  return '#c0392b';
}

function fmtPayoffDate(d: Date): string {
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  if (days <= 1) return 'Very soon';
  if (days < 8) return `In ${days} days`;
  if (days < 60) return `In ~${Math.round(days / 7)} weeks`;
  return `~${d.toLocaleDateString([], { month: 'short', year: 'numeric' })}`;
}

export default function DebtDetailScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [debt, setDebt] = useState<Debt | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletePayTarget, setDeletePayTarget] = useState<{ id: string; amount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editTargetDate, setEditTargetDate] = useState(() => new Date(Date.now() + 90 * 86400000));
  const [savingTarget, setSavingTarget] = useState(false);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [debtRes, paymentsRes, profileRes] = await Promise.all([
      supabase.from('debts').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('debt_payments').select('*').eq('debt_id', id).eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('users').select('currency').eq('id', user.id).maybeSingle(),
    ]);

    if (debtRes.data) {
      setDebt(debtRes.data as Debt);
      if (debtRes.data.target_date) setTargetDate(new Date(debtRes.data.target_date));
    }
    setPayments((paymentsRes.data ?? []) as Payment[]);
    if (profileRes.data?.currency) setCurrency(profileRes.data.currency);
  }, [id]);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const deletePayment = (paymentId: string, amount: number) =>
    setDeletePayTarget({ id: paymentId, amount });

  const executeDeletePayment = async () => {
    if (!deletePayTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('debt_payments').delete().eq('id', deletePayTarget.id);
      if (error) { Alert.alert('Could not delete payment', error.message); return; }
      setDeletePayTarget(null);
      await fetchData();
    } finally {
      setDeleting(false);
    }
  };

  const addPayment = async () => {
    const val = parseFloat(amount.trim());
    if (!amount.trim() || isNaN(val) || !isFinite(val) || val <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    if (!debt) return;

    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(0, Number(debt.total_amount) - totalPaid);
    if (Math.round(val * 100) > Math.round(remaining * 100)) {
      Alert.alert('Too much', `You only owe ${fmt(remaining, currency)} on this debt.`);
      return;
    }

    const isPayingOff = Math.round(val * 100) === Math.round(remaining * 100);

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Session expired', 'Please sign in again.'); return; }
      const { error: insertError } = await supabase.from('debt_payments').insert({
        user_id: user.id, debt_id: debt.id,
        amount: val, note: note.trim() || null,
      });
      if (insertError) { Alert.alert('Could not save payment', insertError.message); return; }
      if (isPayingOff) {
        const { status: notifStatus } = await Notifications.getPermissionsAsync();
        if (notifStatus === 'granted') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '🎉 Debt paid off!',
              body: `You've fully paid off "${debt.name}". That's a huge step — well done.`,
              data: { screen: '/(tabs)/tracker' },
            },
            trigger: null,
          });
        }
        await supabase.from('losses').insert({
          user_id: user.id, type: 'debt_paid_off', amount: Number(debt.total_amount),
          category: 'Debt', note: debt.name,
        });
      }
      setAmount(''); setNote('');
      await fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const saveTargetDate = async (date: Date) => {
    setSavingTarget(true);
    try {
      const { error } = await supabase.from('debts').update({ target_date: date.toISOString().split('T')[0] }).eq('id', id);
      if (error) { Alert.alert('Could not save date', error.message); return; }
      setTargetDate(date);
      setShowTargetModal(false);
    } finally {
      setSavingTarget(false);
    }
  };

  const clearTargetDate = async () => {
    const { error } = await supabase.from('debts').update({ target_date: null }).eq('id', id);
    if (!error) setTargetDate(null);
  };

  const openTargetPicker = () => {
    const seed = targetDate ?? new Date(Date.now() + 90 * 86400000);
    setEditTargetDate(seed);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: seed, mode: 'date', minimumDate: new Date(),
        onChange: (_, d) => { if (d) saveTargetDate(d); },
      });
    } else {
      setShowTargetModal(true);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  }

  if (!debt) {
    return (
      <View style={s.center}>
        <Text style={{ color: c.textMuted }}>Debt not found.</Text>
      </View>
    );
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, Number(debt.total_amount) - totalPaid);
  const pct = Number(debt.total_amount) > 0 ? Math.min(1, totalPaid / Number(debt.total_amount)) : 0;
  const isPaidOff = remaining === 0 && totalPaid > 0;

  let payoffEstimate: string | null = null;
  if (!isPaidOff && payments.length > 0) {
    const firstPayment = new Date(payments[payments.length - 1].created_at);
    const daysSinceFirst = Math.max(1, (Date.now() - firstPayment.getTime()) / 86400000);
    const dailyRate = totalPaid / daysSinceFirst;
    if (dailyRate > 0) {
      payoffEstimate = fmtPayoffDate(new Date(Date.now() + (remaining / dailyRate) * 86400000));
    }
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[c.headerGradDeep, c.headerGradStart, c.headerGradEnd]} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={c.white} />
            </Pressable>
            <View style={s.headerCenter}>
              <Text style={s.headerTitle} numberOfLines={1}>{debt.name}</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">

          {/* Summary */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryCol}>
                <Text style={[s.summaryVal, { color: c.error }]}>{fmt(Number(debt.total_amount), currency)}</Text>
                <Text style={s.summaryLbl}>Total owed</Text>
              </View>
              <View style={[s.summaryCol, s.summaryMid]}>
                <Text style={[s.summaryVal, { color: c.primary }]}>{fmt(totalPaid, currency)}</Text>
                <Text style={s.summaryLbl}>Paid back</Text>
              </View>
              <View style={s.summaryCol}>
                <Text style={[s.summaryVal, { color: isPaidOff ? '#0a7a4e' : '#555' }]}>
                  {isPaidOff ? '✓ Done' : fmt(remaining, currency)}
                </Text>
                <Text style={s.summaryLbl}>Remaining</Text>
              </View>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${pct * 100}%` as any, backgroundColor: debtProgressColor(pct) }]} />
            </View>
            <Text style={[s.progressLbl, { color: debtProgressColor(pct) }]}>
              {isPaidOff ? '🎉 Fully paid off!' : `${Math.round(pct * 100)}% paid back`}
            </Text>
            {!isPaidOff && (() => {
              const firstPayment = payments.length > 0 ? new Date(payments[payments.length - 1].created_at) : null;
              const daysElapsed = firstPayment ? Math.max(1, (Date.now() - firstPayment.getTime()) / 86400000) : 1;
              const daysRemaining = targetDate ? Math.ceil((targetDate.getTime() - Date.now()) / 86400000) : null;
              const requiredPerDay = daysRemaining && daysRemaining > 0 ? remaining / daysRemaining : null;
              const actualPerDay = payments.length > 0 ? totalPaid / daysElapsed : null;
              const isAhead = requiredPerDay !== null && actualPerDay !== null ? actualPerDay >= requiredPerDay : null;
              return (
                <View style={s.targetSection}>
                  {targetDate ? (
                    <>
                      <View style={s.targetRow}>
                        <Text style={s.targetLbl}>Target date</Text>
                        <View style={s.targetRowRight}>
                          <Text style={s.targetVal}>
                            {targetDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                            {daysRemaining !== null && (
                              <Text style={{ color: daysRemaining <= 0 ? c.error : c.textMuted }}>
                                {daysRemaining > 0 ? `  ·  ${daysRemaining}d left` : '  ·  Past target'}
                              </Text>
                            )}
                          </Text>
                          <Pressable onPress={clearTargetDate} hitSlop={10}>
                            <Ionicons name="close-circle-outline" size={15} color={c.textFaint} />
                          </Pressable>
                        </View>
                      </View>
                      {requiredPerDay !== null && (
                        <View style={s.targetRow}>
                          <Text style={s.targetLbl}>Need</Text>
                          <Text style={s.targetVal}>{fmt(requiredPerDay, currency)}/day</Text>
                        </View>
                      )}
                      {actualPerDay !== null && (
                        <View style={s.targetRow}>
                          <Text style={s.targetLbl}>Pace</Text>
                          <View style={s.targetRowRight}>
                            <Text style={s.targetVal}>{fmt(actualPerDay, currency)}/day</Text>
                            {isAhead !== null && (
                              <View style={[s.paceBadge, { backgroundColor: isAhead ? c.success : c.error }]}>
                                <Text style={s.paceBadgeTxt}>{isAhead ? '▲ Ahead' : '▼ Behind'}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      )}
                      <Pressable onPress={openTargetPicker} style={s.targetEditBtn}>
                        <Ionicons name="pencil-outline" size={12} color={c.primary} />
                        <Text style={s.targetEditTxt}>Edit target date</Text>
                      </Pressable>
                    </>
                  ) : (
                    <View style={s.targetUnsetRow}>
                      {payoffEstimate && (
                        <Text style={s.payoffEst}>📅 Est. payoff: {payoffEstimate}</Text>
                      )}
                      <Pressable onPress={openTargetPicker} style={s.setTargetBtn}>
                        <Text style={s.setTargetTxt}>Set payoff target date</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>

          {/* Add payment */}
          {!isPaidOff && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Log a Payment</Text>
              <TextInput
                style={s.input}
                placeholder={`Amount (max ${fmt(remaining, currency)})`}
                placeholderTextColor={c.textFaint}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <TextInput
                style={[s.input, { marginTop: 10 }]}
                placeholder="Note (optional)"
                placeholderTextColor={c.textFaint}
                value={note}
                onChangeText={setNote}
              />
              <Pressable
                style={[s.actionBtn, submitting && s.btnDisabled]}
                onPress={addPayment}
                disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.actionBtnTxt}>Add Payment</Text>}
              </Pressable>
            </View>
          )}

          {/* Payment history */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Payment History</Text>
            {payments.length === 0 ? (
              <Text style={s.emptyTxt}>No payments yet.</Text>
            ) : (
              payments.map((p, i) => (
                <View key={p.id} style={[s.paymentItem, i === payments.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.paymentLeft}>
                    {p.note ? <Text style={s.paymentNote}>{p.note}</Text> : null}
                    <Text style={s.paymentDate}>{fmtDate(p.created_at)}</Text>
                  </View>
                  <View style={s.paymentRight}>
                    <Text style={s.paymentAmount}>+{fmt(Number(p.amount), currency)}</Text>
                    <Pressable onPress={() => deletePayment(p.id, Number(p.amount))} hitSlop={10}>
                      <Ionicons name="trash-outline" size={16} color={c.textDisabled} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && (
        <Modal visible={showTargetModal} transparent animationType="slide">
          <View style={s.iosModalOverlay}>
            <View style={s.iosModalSheet}>
              <Text style={s.iosModalTitle}>Payoff target date</Text>
              <DateTimePicker
                value={editTargetDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_e, d) => d && setEditTargetDate(d)}
                style={{ height: 200 }}
              />
              <View style={s.iosModalActions}>
                <Pressable style={s.iosModalBtn} onPress={() => setShowTargetModal(false)}>
                  <Text style={s.iosModalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.iosModalBtn, s.iosModalSave, savingTarget && { opacity: 0.5 }]}
                  onPress={() => saveTargetDate(editTargetDate)}
                  disabled={savingTarget}>
                  <Text style={s.iosModalSaveTxt}>{savingTarget ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={!!deletePayTarget} transparent animationType="fade" onRequestClose={() => setDeletePayTarget(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setDeletePayTarget(null)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            
            <View style={s.confirmIconRow}>
              <View style={s.confirmIconCircle}>
                <Ionicons name="trash-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.confirmTitle}>Delete payment?</Text>
            {deletePayTarget && (
              <Text style={s.confirmBody}>
                Remove this payment of{' '}
                <Text style={s.confirmBold}>{fmt(deletePayTarget.amount, currency)}</Text>?
              </Text>
            )}
            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setDeletePayTarget(null)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.confirmDelete, deleting && { opacity: 0.6 }]} onPress={executeDeletePayment} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.confirmDeleteTxt}>Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 16 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  backBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.white },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  summaryCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  summaryRow: { flexDirection: 'row' },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.borderSubtle },
  summaryVal: { fontSize: 18, fontWeight: '700' },
  summaryLbl: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: c.bgTeal, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLbl: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  payoffEst: { fontSize: 12, color: c.textMuted, textAlign: 'center' },

  targetSection: {
    marginTop: 4, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderLight,
    gap: 8,
  },
  targetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetLbl: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  targetVal: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
  paceBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  paceBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },
  targetEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  targetEditTxt: { fontSize: 12, color: c.primary, fontWeight: '500' },
  targetUnsetRow: { gap: 8 },
  setTargetBtn: { alignSelf: 'flex-start' },
  setTargetTxt: { fontSize: 12, color: c.primary, fontWeight: '500' },

  iosModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  iosModalSheet: { backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  iosModalTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  iosModalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  iosModalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: c.bgElement },
  iosModalSave: { backgroundColor: c.primary },
  iosModalCancel: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  iosModalSaveTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary, marginBottom: 14 },

  input: {
    borderWidth: 1, borderColor: c.borderLight, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary, backgroundColor: c.bgInput,
  },

  actionBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: c.primary },
  btnDisabled: { opacity: 0.6 },
  actionBtnTxt: { fontSize: 15, fontWeight: '700', color: c.white },

  emptyTxt: { fontSize: 14, color: c.textFaint, textAlign: 'center', paddingVertical: 12 },

  paymentItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.bgElement,
  },
  paymentLeft: { flex: 1, gap: 2 },
  paymentNote: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  paymentDate: { fontSize: 12, color: c.textMuted },
  paymentAmount: { fontSize: 15, fontWeight: '700', color: c.primary },
  paymentRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },

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
  confirmBold: { fontWeight: '700', color: c.textSecondary },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.bgElement },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  confirmDelete: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.error },
  confirmDeleteTxt: { color: c.white, fontWeight: '700', fontSize: 15 },
});
