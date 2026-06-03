import { LinearGradient } from 'expo-linear-gradient';
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

type TabType = 'loss' | 'payment' | 'history';

interface Entry {
  id: string;
  type: 'loss' | 'payment';
  amount: number;
  category: string;
  note: string | null;
  created_at: string;
}

const CATEGORIES = ['Sports betting', 'Casino', 'Poker', 'Online slots', 'Other'];
const CURRENCY_KEY = 'cornerday_currency';

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

export default function TrackerScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('loss');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currency, setCurrency] = useState('USD');

  const [lossAmount, setLossAmount] = useState('');
  const [lossCategory, setLossCategory] = useState(CATEGORIES[0]);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const fetchEntries = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [entriesRes, profileRes] = await Promise.all([
      supabase.from('losses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('users').select('currency').eq('id', user.id).single(),
    ]);

    setEntries(entriesRes.data ?? []);
    if (profileRes.data?.currency) setCurrency(profileRes.data.currency);
  }, []);

  useEffect(() => {
    fetchEntries().finally(() => setLoading(false));
  }, [fetchEntries]);

  const totalLost = entries.filter(e => e.type === 'loss').reduce((s, e) => s + Number(e.amount), 0);
  const paidBack = entries.filter(e => e.type === 'payment').reduce((s, e) => s + Number(e.amount), 0);
  const stillOwed = Math.max(0, totalLost - paidBack);
  const recoveryPct = totalLost > 0 ? Math.min(1, paidBack / totalLost) : 0;

  const logLoss = async () => {
    const amount = parseFloat(lossAmount);
    if (!lossAmount || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('losses').insert({
        user_id: user.id, type: 'loss', amount, category: lossCategory,
      });
      setLossAmount('');
      await fetchEntries();
    }
    setSubmitting(false);
  };

  const logPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!paymentAmount || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('losses').insert({
        user_id: user.id, type: 'payment', amount,
        category: 'Payment', note: paymentNote || null,
      });
      setPaymentAmount('');
      setPaymentNote('');
      await fetchEntries();
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0F6E6E" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Loss Tracker</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">

          {/* Summary */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryCol}>
                <Text style={[s.summaryVal, { color: '#c0392b' }]}>{fmt(totalLost, currency)}</Text>
                <Text style={s.summaryLbl}>Total lost</Text>
              </View>
              <View style={[s.summaryCol, s.summaryMid]}>
                <Text style={[s.summaryVal, { color: '#0F6E6E' }]}>{fmt(paidBack, currency)}</Text>
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
          </View>

          {/* Tab bar */}
          <View style={s.tabBar}>
            {(['loss', 'payment', 'history'] as TabType[]).map(t => (
              <Pressable
                key={t}
                style={[s.tabBtn, activeTab === t && s.tabBtnActive]}
                onPress={() => setActiveTab(t)}>
                <Text style={[s.tabTxt, activeTab === t && s.tabTxtActive]}>
                  {t === 'loss' ? 'Log Loss' : t === 'payment' ? 'Log Payment' : 'History'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Log Loss */}
          {activeTab === 'loss' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Log a Loss</Text>
              <TextInput
                style={s.input}
                placeholder="Amount (e.g. 50)"
                placeholderTextColor="#bbb"
                keyboardType="decimal-pad"
                value={lossAmount}
                onChangeText={setLossAmount}
              />
              <Text style={s.fieldLbl}>Category</Text>
              <View style={s.chipRow}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    style={[s.chip, lossCategory === cat && s.chipActive]}
                    onPress={() => setLossCategory(cat)}>
                    <Text style={[s.chipTxt, lossCategory === cat && s.chipTxtActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[s.actionBtn, { backgroundColor: '#c0392b' }, submitting && s.btnDisabled]}
                onPress={logLoss}
                disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.actionBtnTxt}>Add Loss</Text>}
              </Pressable>
            </View>
          )}

          {/* Log Payment */}
          {activeTab === 'payment' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Log a Payment</Text>
              <TextInput
                style={s.input}
                placeholder="Amount (e.g. 100)"
                placeholderTextColor="#bbb"
                keyboardType="decimal-pad"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
              />
              <TextInput
                style={[s.input, { marginTop: 10 }]}
                placeholder="Note (optional)"
                placeholderTextColor="#bbb"
                value={paymentNote}
                onChangeText={setPaymentNote}
              />
              <Pressable
                style={[s.actionBtn, { backgroundColor: '#0F6E6E' }, submitting && s.btnDisabled]}
                onPress={logPayment}
                disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.actionBtnTxt}>Add Payment</Text>}
              </Pressable>
            </View>
          )}

          {/* History */}
          {activeTab === 'history' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>History</Text>
              {entries.length === 0 ? (
                <Text style={s.emptyTxt}>No entries yet. Start by logging a loss or payment.</Text>
              ) : (
                entries.map(entry => (
                  <View key={entry.id} style={s.historyItem}>
                    <View style={s.historyLeft}>
                      <Text style={s.historyCategory}>
                        {entry.type === 'loss' ? entry.category : 'Payment'}
                      </Text>
                      <Text style={s.historyDate}>{fmtDate(entry.created_at)}</Text>
                      {entry.note ? <Text style={s.historyNote}>{entry.note}</Text> : null}
                    </View>
                    <View style={s.historyRight}>
                      <View style={[s.pill, entry.type === 'loss' ? s.pillLoss : s.pillPayment]}>
                        <Text style={[s.pillTxt, entry.type === 'loss' ? s.pillLossTxt : s.pillPaymentTxt]}>
                          {entry.type === 'loss' ? 'Loss' : 'Payment'}
                        </Text>
                      </View>
                      <Text style={[s.historyAmount, { color: entry.type === 'loss' ? '#c0392b' : '#0F6E6E' }]}>
                        {entry.type === 'loss' ? '−' : '+'}{fmt(Number(entry.amount), currency)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#0F6E6E' },
  tabTxt: { fontSize: 12, fontWeight: '600', color: '#888' },
  tabTxtActive: { color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 14 },

  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#111', backgroundColor: '#fafafa',
  },
  fieldLbl: { fontSize: 13, color: '#555', fontWeight: '600', marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa',
  },
  chipActive: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  chipTxt: { fontSize: 13, color: '#555' },
  chipTxtActive: { color: '#0F6E6E', fontWeight: '600' },

  actionBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  actionBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  emptyTxt: { fontSize: 14, color: '#aaa', textAlign: 'center', paddingVertical: 16 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  historyLeft: { flex: 1, gap: 2 },
  historyCategory: { fontSize: 14, fontWeight: '600', color: '#111' },
  historyDate: { fontSize: 12, color: '#888' },
  historyNote: { fontSize: 12, color: '#aaa', fontStyle: 'italic' },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  pill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  pillLoss: { backgroundColor: '#fff0f0' },
  pillPayment: { backgroundColor: '#e6f7f7' },
  pillTxt: { fontSize: 11, fontWeight: '600' },
  pillLossTxt: { color: '#c0392b' },
  pillPaymentTxt: { color: '#0F6E6E' },
  historyAmount: { fontSize: 15, fontWeight: '700' },
});
