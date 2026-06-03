import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
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

type TabType = 'loss' | 'payment' | 'saving';

interface Entry {
  id: string;
  type: 'loss' | 'payment' | 'saving';
  amount: number;
  category: string;
  note: string | null;
  created_at: string;
}

const CATEGORIES = ['Sports betting', 'Casino', 'Poker', 'Online slots', 'Other'];

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

function streakDaysFromQuitDate(quitTimestamp: string | null): number {
  if (!quitTimestamp) return 0;
  const quit = new Date(quitTimestamp).getTime();
  const now = Date.now();
  if (now < quit) return 0;
  return Math.floor((now - quit) / (1000 * 60 * 60 * 24));
}

export default function TrackerScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('loss');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [weeklyBet, setWeeklyBet] = useState<string | null>(null);
  const [quitTimestamp, setQuitTimestamp] = useState<string | null>(null);

  const [lossAmount, setLossAmount] = useState('');
  const [lossCategory, setLossCategory] = useState(CATEGORIES[0]);

  const [savingAmount, setSavingAmount] = useState('');
  const [savingNote, setSavingNote] = useState('');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [entriesRes, profileRes] = await Promise.all([
      supabase.from('losses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('users').select('currency, weekly_bet, quit_timestamp').eq('id', user.id).single(),
    ]);

    setEntries((entriesRes.data ?? []) as Entry[]);
    if (profileRes.data) {
      setCurrency(profileRes.data.currency ?? 'USD');
      setWeeklyBet(profileRes.data.weekly_bet ?? null);
      setQuitTimestamp(profileRes.data.quit_timestamp ?? null);
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const totalLost = entries.filter(e => e.type === 'loss').reduce((s, e) => s + Number(e.amount), 0);
  const paidBack = entries.filter(e => e.type === 'payment').reduce((s, e) => s + Number(e.amount), 0);
  const totalSaved = entries.filter(e => e.type === 'saving').reduce((s, e) => s + Number(e.amount), 0);
  const stillOwed = Math.max(0, totalLost - paidBack);
  const recoveryPct = totalLost > 0 ? Math.min(1, paidBack / totalLost) : 0;

  const streakDays = streakDaysFromQuitDate(quitTimestamp);
  const dailyRate = weeklyBet ? Number(weeklyBet) / 7 : 0;
  const autoSaved = Math.round(streakDays * dailyRate);

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
      await fetchData();
    }
    setSubmitting(false);
  };

  const logSaving = async () => {
    const amount = parseFloat(savingAmount);
    if (!savingAmount || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('losses').insert({
        user_id: user.id, type: 'saving', amount,
        category: 'Saving', note: savingNote || null,
      });
      setSavingAmount('');
      setSavingNote('');
      await fetchData();
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
      await fetchData();
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

  const TABS: { key: TabType; label: string }[] = [
    { key: 'loss',    label: 'Loss' },
    { key: 'payment', label: 'Payment' },
    { key: 'saving',  label: 'Saving' },
  ];

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

            {/* Auto-savings row */}
            {weeklyBet ? (
              <View style={s.savingsRow}>
                <Text style={s.savingsIcon}>💰</Text>
                <View style={s.savingsText}>
                  <Text style={s.savingsLabel}>Saved by not gambling</Text>
                  <Text style={s.savingsHint}>
                    {fmt(Number(weeklyBet), currency)}/week · {streakDays} day{streakDays !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={s.savingsAmount}>{fmt(autoSaved, currency)}</Text>
              </View>
            ) : null}

            {/* Manual savings total — only if entries exist */}
            {totalSaved > 0 && (
              <View style={[s.savingsRow, { borderTopWidth: 0, paddingTop: 0, marginTop: -4 }]}>
                <Text style={s.savingsIcon}>🏦</Text>
                <View style={s.savingsText}>
                  <Text style={s.savingsLabel}>Manually logged savings</Text>
                </View>
                <Text style={s.savingsAmount}>{fmt(totalSaved, currency)}</Text>
              </View>
            )}
          </View>

          {/* Tab bar */}
          <View style={s.tabBar}>
            {TABS.map(t => (
              <Pressable
                key={t.key}
                style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]}
                onPress={() => setActiveTab(t.key)}>
                <Text style={[s.tabTxt, activeTab === t.key && s.tabTxtActive]}>
                  {t.label}
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

          {/* Log Saving */}
          {activeTab === 'saving' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Log a Saving</Text>
              <TextInput
                style={s.input}
                placeholder="Amount (e.g. 100)"
                placeholderTextColor="#bbb"
                keyboardType="decimal-pad"
                value={savingAmount}
                onChangeText={setSavingAmount}
              />
              <TextInput
                style={[s.input, { marginTop: 10 }]}
                placeholder="Note (e.g. Savings account, Holiday fund)"
                placeholderTextColor="#bbb"
                value={savingNote}
                onChangeText={setSavingNote}
              />
              <Pressable
                style={[s.actionBtn, { backgroundColor: '#1a9a5a' }, submitting && s.btnDisabled]}
                onPress={logSaving}
                disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.actionBtnTxt}>Add Saving</Text>}
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

          {/* History — losses and payments only */}
          <View style={s.card}>
            <Text style={s.cardTitle}>History</Text>
            {entries.filter(e => e.type !== 'saving').length === 0 ? (
              <Text style={s.emptyTxt}>No entries yet.</Text>
            ) : (
              entries.filter(e => e.type !== 'saving').map(entry => {
                const isLoss = entry.type === 'loss';
                return (
                  <View key={entry.id} style={s.historyItem}>
                    <View style={s.historyLeft}>
                      <Text style={s.historyCategory}>
                        {isLoss ? entry.category : 'Payment'}
                      </Text>
                      <Text style={s.historyDate}>{fmtDate(entry.created_at)}</Text>
                      {entry.note ? <Text style={s.historyNote}>{entry.note}</Text> : null}
                    </View>
                    <View style={s.historyRight}>
                      <View style={[s.pill, isLoss ? s.pillLoss : s.pillPayment]}>
                        <Text style={[s.pillTxt, isLoss ? s.pillLossTxt : s.pillPaymentTxt]}>
                          {isLoss ? 'Loss' : 'Payment'}
                        </Text>
                      </View>
                      <Text style={[s.historyAmount, { color: isLoss ? '#c0392b' : '#0F6E6E' }]}>
                        {isLoss ? '−' : '+'}{fmt(Number(entry.amount), currency)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Savings — separate section */}
          <View style={s.card}>
            <Text style={s.cardTitle}>My Savings</Text>
            {entries.filter(e => e.type === 'saving').length === 0 ? (
              <Text style={s.emptyTxt}>No savings logged yet. Use the Saving tab above to record money you've set aside.</Text>
            ) : (
              entries.filter(e => e.type === 'saving').map(entry => (
                <View key={entry.id} style={s.historyItem}>
                  <View style={s.historyLeft}>
                    <Text style={s.historyCategory}>{entry.note || 'Saving'}</Text>
                    <Text style={s.historyDate}>{fmtDate(entry.created_at)}</Text>
                  </View>
                  <View style={s.historyRight}>
                    <View style={[s.pill, s.pillSaving]}>
                      <Text style={[s.pillTxt, s.pillSavingTxt]}>Saving</Text>
                    </View>
                    <Text style={[s.historyAmount, { color: '#0a7a4e' }]}>
                      +{fmt(Number(entry.amount), currency)}
                    </Text>
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
  tabTxt: { fontSize: 11, fontWeight: '600', color: '#888' },
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
  pillSaving: { backgroundColor: '#e6f7ed' },
  pillPayment: { backgroundColor: '#e6f7f7' },
  pillTxt: { fontSize: 11, fontWeight: '600' },
  pillLossTxt: { color: '#c0392b' },
  pillSavingTxt: { color: '#0a7a4e' },
  pillPaymentTxt: { color: '#0F6E6E' },
  historyAmount: { fontSize: 15, fontWeight: '700' },
});
