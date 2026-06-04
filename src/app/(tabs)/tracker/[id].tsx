import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { router, useLocalSearchParams } from 'expo-router';

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

interface Debt {
  id: string;
  name: string;
  total_amount: number;
  category: string;
  created_at: string;
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

export default function DebtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [debt, setDebt] = useState<Debt | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [debtRes, paymentsRes, profileRes] = await Promise.all([
      supabase.from('debts').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('debt_payments').select('*').eq('debt_id', id).eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('users').select('currency').eq('id', user.id).single(),
    ]);

    if (debtRes.data) setDebt(debtRes.data as Debt);
    setPayments((paymentsRes.data ?? []) as Payment[]);
    if (profileRes.data?.currency) setCurrency(profileRes.data.currency);
  }, [id]);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const deletePayment = (paymentId: string, amount: number) => {
    Alert.alert(
      'Delete payment?',
      `Remove this payment of ${fmt(amount, currency)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('debt_payments').delete().eq('id', paymentId);
          await fetchData();
        }},
      ],
    );
  };

  const addPayment = async () => {
    const val = parseFloat(amount);
    if (!amount || isNaN(val) || val <= 0) {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('debt_payments').insert({
        user_id: user.id, debt_id: debt.id,
        amount: val, note: note.trim() || null,
      });
      if (isPayingOff) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎉 Debt paid off!',
            body: `You've fully paid off "${debt.name}". That's a huge step — well done.`,
            data: { screen: '/(tabs)/tracker' },
          },
          trigger: null,
        });
      }
      setAmount(''); setNote('');
      await fetchData();
    }
    setSubmitting(false);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#0F6E6E" /></View>;
  }

  if (!debt) {
    return (
      <View style={s.center}>
        <Text style={{ color: '#888' }}>Debt not found.</Text>
      </View>
    );
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, Number(debt.total_amount) - totalPaid);
  const pct = Number(debt.total_amount) > 0 ? Math.min(1, totalPaid / Number(debt.total_amount)) : 0;
  const isPaidOff = remaining === 0 && totalPaid > 0;

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
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
                <Text style={[s.summaryVal, { color: '#c0392b' }]}>{fmt(Number(debt.total_amount), currency)}</Text>
                <Text style={s.summaryLbl}>Total owed</Text>
              </View>
              <View style={[s.summaryCol, s.summaryMid]}>
                <Text style={[s.summaryVal, { color: '#0F6E6E' }]}>{fmt(totalPaid, currency)}</Text>
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
              <View style={[s.progressFill, { width: `${pct * 100}%` as any }]} />
            </View>
            <Text style={s.progressLbl}>
              {isPaidOff ? '🎉 Fully paid off!' : `${Math.round(pct * 100)}% paid back`}
            </Text>
          </View>

          {/* Add payment */}
          {!isPaidOff && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Log a Payment</Text>
              <TextInput
                style={s.input}
                placeholder={`Amount (max ${fmt(remaining, currency)})`}
                placeholderTextColor="#bbb"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <TextInput
                style={[s.input, { marginTop: 10 }]}
                placeholder="Note (optional)"
                placeholderTextColor="#bbb"
                value={note}
                onChangeText={setNote}
              />
              <Pressable
                style={[s.actionBtn, submitting && s.btnDisabled]}
                onPress={addPayment}
                disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
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
                      <Ionicons name="trash-outline" size={16} color="#ddd" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 16 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  backBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

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

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 14 },

  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111', backgroundColor: '#fafafa',
  },

  actionBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#0F6E6E' },
  btnDisabled: { opacity: 0.6 },
  actionBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  emptyTxt: { fontSize: 14, color: '#aaa', textAlign: 'center', paddingVertical: 12 },

  paymentItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  paymentLeft: { flex: 1, gap: 2 },
  paymentNote: { fontSize: 14, fontWeight: '500', color: '#111' },
  paymentDate: { fontSize: 12, color: '#888' },
  paymentAmount: { fontSize: 15, fontWeight: '700', color: '#0F6E6E' },
  paymentRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
