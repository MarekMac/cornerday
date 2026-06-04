import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const TRIGGERS = [
  { key: 'betting_ads', label: 'Betting ads' },
  { key: 'live_sport',  label: 'Live sport' },
  { key: 'social',      label: 'Friends/social' },
  { key: 'stress',      label: 'Stress' },
  { key: 'boredom',     label: 'Boredom' },
  { key: 'financial',   label: 'Financial pressure' },
  { key: 'other',       label: 'Other' },
];

type FeedEntry =
  | { kind: 'urge';         id: string; trigger: string; outcome: 'overcame' | 'slipped'; note: string | null; created_at: string }
  | { kind: 'debt';         id: string; name: string; total_amount: number; category: string; created_at: string }
  | { kind: 'payment';      id: string; amount: number; note: string | null; debt_name: string; created_at: string }
  | { kind: 'saving';       id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'streak_reset'; id: string; note: string | null; created_at: string };

function triggerLabel(key: string) {
  return TRIGGERS.find(t => t.key === key)?.label ?? key;
}

function fmt(amount: number, currency = 'USD') {
  const syms: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$',
  };
  const s = syms[currency] ?? currency;
  if (amount >= 1000) return `${s}${(amount / 1000).toFixed(1)}k`;
  return `${s}${Math.round(amount)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EntryCard({ entry, currency }: { entry: FeedEntry; currency: string }) {
  if (entry.kind === 'urge') {
    const overcame = entry.outcome === 'overcame';
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, overcame ? s.pillGreen : s.pillRed]}>
            <Text style={[s.pillTxt, overcame ? s.pillTxtGreen : s.pillTxtRed]}>
              {overcame ? 'Urge · Overcame ✓' : 'Urge · Had a slip'}
            </Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <Text style={s.cardTitle}>{triggerLabel(entry.trigger)}</Text>
        {entry.note ? <Text style={s.cardNote}>{entry.note}</Text> : null}
      </View>
    );
  }

  if (entry.kind === 'debt') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillRed]}>
            <Text style={[s.pillTxt, s.pillTxtRed]}>Debt added</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.name}</Text>
          <Text style={[s.cardAmount, { color: '#c0392b' }]}>−{fmt(Number(entry.total_amount), currency)}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'payment') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillTeal]}>
            <Text style={[s.pillTxt, s.pillTxtTeal]}>Payment</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.debt_name}</Text>
          <Text style={[s.cardAmount, { color: '#0F6E6E' }]}>+{fmt(Number(entry.amount), currency)}</Text>
        </View>
        {entry.note ? <Text style={s.cardNote}>{entry.note}</Text> : null}
      </View>
    );
  }

  if (entry.kind === 'saving') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillGreenSolid]}>
            <Text style={[s.pillTxt, s.pillTxtGreenSolid]}>Saving</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.note || 'Saving'}</Text>
          <Text style={[s.cardAmount, { color: '#0a7a4e' }]}>+{fmt(Number(entry.amount), currency)}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'streak_reset') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillOrange]}>
            <Text style={[s.pillTxt, s.pillTxtOrange]}>Streak reset</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <Text style={s.cardTitle}>New beginning</Text>
        {entry.note ? <Text style={s.cardNote}>{entry.note} — every restart is still progress.</Text> : null}
      </View>
    );
  }

  return null;
}

export default function JournalScreen() {
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [urgeRes, debtsRes, paymentsRes, savingsRes, resetsRes, profileRes] = await Promise.all([
      supabase.from('urge_journal').select('*').eq('user_id', user.id),
      supabase.from('debts').select('id, name, total_amount, category, created_at').eq('user_id', user.id),
      supabase.from('debt_payments').select('id, amount, note, created_at, debts(name)').eq('user_id', user.id),
      supabase.from('losses').select('id, amount, note, created_at').eq('user_id', user.id).eq('type', 'saving'),
      supabase.from('losses').select('id, note, created_at').eq('user_id', user.id).eq('type', 'streak_reset'),
      supabase.from('users').select('currency').eq('id', user.id).single(),
    ]);

    if (profileRes.data?.currency) setCurrency(profileRes.data.currency);

    const entries: FeedEntry[] = [];

    (urgeRes.data ?? []).forEach((e: any) => entries.push({ kind: 'urge', ...e }));
    (debtsRes.data ?? []).forEach((e: any) => entries.push({ kind: 'debt', ...e }));
    (paymentsRes.data ?? []).forEach((e: any) => entries.push({
      kind: 'payment',
      id: e.id,
      amount: e.amount,
      note: e.note,
      created_at: e.created_at,
      debt_name: (e.debts as any)?.name ?? 'Debt',
    }));
    (savingsRes.data ?? []).forEach((e: any) => entries.push({ kind: 'saving', ...e }));
    (resetsRes.data ?? []).forEach((e: any) => entries.push({ kind: 'streak_reset', ...e }));

    entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setFeed(entries);
  }, []);

  useEffect(() => { fetchFeed().finally(() => setLoading(false)); }, [fetchFeed]);
  useFocusEffect(useCallback(() => { fetchFeed(); }, [fetchFeed]));

  const clearAllLogs = () => {
    Alert.alert(
      'Clear all journal entries?',
      'This permanently deletes all urge logs, debts, payments, savings and streak resets. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await Promise.all([
              supabase.from('urge_journal').delete().eq('user_id', user.id),
              supabase.from('debt_payments').delete().eq('user_id', user.id),
              supabase.from('debts').delete().eq('user_id', user.id),
              supabase.from('losses').delete().eq('user_id', user.id).in('type', ['saving', 'streak_reset']),
            ]);
            fetchFeed();
          },
        },
      ],
    );
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </Pressable>
            <View style={s.headerCenter}>
              <Text style={s.headerTitle}>My Journal</Text>
            </View>
            {feed.length > 0 ? (
              <Pressable onPress={clearAllLogs} hitSlop={12} style={s.clearBtn}>
                <Ionicons name="trash-outline" size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#0F6E6E" />
        </View>
      ) : feed.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📓</Text>
          <Text style={s.emptyTitle}>Nothing here yet</Text>
          <Text style={s.emptySub}>
            Your urge moments, debts, payments and savings will all appear here as you log them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={item => `${item.kind}-${item.id}`}
          contentContainerStyle={s.list}
          renderItem={({ item }) => <EntryCard entry={item} currency={currency} />}
        />
      )}

    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 16 },
  headerContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, gap: 8,
  },
  backBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  list: { padding: 16, gap: 10 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  cardAmount: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
  cardNote: { fontSize: 13, color: '#666', lineHeight: 18 },
  cardDate: { fontSize: 12, color: '#aaa' },

  pill: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  pillTxt: { fontSize: 12, fontWeight: '700' },

  pillGreen: { backgroundColor: '#e6f7f0' },
  pillTxtGreen: { color: '#0a7a4e' },
  pillRed: { backgroundColor: '#fff0f0' },
  pillTxtRed: { color: '#c0392b' },
  pillBlue: { backgroundColor: '#f0f0ff' },
  pillTxtBlue: { color: '#4455cc' },
  pillTeal: { backgroundColor: '#e8f0ff' },
  pillTxtTeal: { color: '#1d6fcc' },
  pillGreenSolid: { backgroundColor: '#e6f7ed' },
  pillTxtGreenSolid: { color: '#0a7a4e' },
  pillOrange: { backgroundColor: '#fff4e6' },
  pillTxtOrange: { color: '#c0680a' },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 40, gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});
