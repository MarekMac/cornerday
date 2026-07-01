import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/networkError';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';
import { CHECKLIST_KEY } from '@/constants/storage-keys';

const TRIGGERS = [
  { key: 'betting_ads', label: 'Betting ads' },
  { key: 'live_sport',  label: 'Live sport' },
  { key: 'social',      label: 'Friends/social' },
  { key: 'stress',      label: 'Stress' },
  { key: 'boredom',     label: 'Boredom' },
  { key: 'financial',   label: 'Financial pressure' },
  { key: 'other',       label: 'Other' },
];

const PLAN_DISTRACTION_OPTIONS = [
  { key: 'walk',     label: 'Go for a walk' },
  { key: 'call',     label: 'Call someone' },
  { key: 'music',    label: 'Listen to music' },
  { key: 'drink',    label: 'Make a hot drink' },
  { key: 'read',     label: 'Read' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'breathe',  label: 'Meditate' },
  { key: 'journal',  label: 'Write in journal' },
  { key: 'shower',   label: 'Take a shower' },
  { key: 'tv',       label: 'Watch something' },
  { key: 'game',     label: 'Play a game' },
  { key: 'outside',  label: 'Go outside' },
  { key: 'create',   label: 'Create something' },
  { key: 'text',     label: 'Text a friend' },
  { key: 'puzzle',   label: 'Do a puzzle' },
];

type FeedEntry =
  | { kind: 'urge';          id: string; trigger: string; outcome: 'overcame' | 'slipped'; note: string | null; distraction_used: string | null; created_at: string }
  | { kind: 'debt';          id: string; name: string; total_amount: number; category: string; created_at: string }
  | { kind: 'payment';       id: string; amount: number; note: string | null; debt_name: string; created_at: string }
  | { kind: 'saving';        id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'streak_reset';  id: string; note: string | null; created_at: string }
  | { kind: 'debt_edited';      id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'debt_deleted';     id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'saving_edited';    id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'saving_deleted';   id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'milestone_earned'; id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'debt_paid_off';    id: string; amount: number; note: string | null; created_at: string }
  | { kind: 'quit_date_changed';id: string; note: string | null; created_at: string }
  | { kind: 'journey_started'; id: string; note: string | null; created_at: string };

function triggerLabel(key: string | null | undefined) {
  if (!key) return 'Unknown trigger';
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
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EntryCard({ entry, currency, c }: { entry: FeedEntry; currency: string; c: AppColors }) {
  const s = useMemo(() => makeStyles(c), [c]);

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
        {entry.distraction_used && (
          <Text style={s.cardNote}>💪 {PLAN_DISTRACTION_OPTIONS.find(o => o.key === entry.distraction_used)?.label ?? entry.distraction_used}</Text>
        )}
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
          <Text style={[s.cardAmount, { color: c.error }]}>−{fmt(Number(entry.total_amount), currency)}</Text>
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
          <Text style={[s.cardAmount, { color: c.primary }]}>+{fmt(Number(entry.amount), currency)}</Text>
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
          <Text style={[s.cardAmount, { color: c.success }]}>+{fmt(Number(entry.amount), currency)}</Text>
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

  if (entry.kind === 'debt_edited') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillOrange]}>
            <Text style={[s.pillTxt, s.pillTxtOrange]}>Debt edited</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.note || 'Debt'}</Text>
          <Text style={[s.cardAmount, { color: c.error }]}>{fmt(Number(entry.amount), currency)}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'debt_deleted') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillRed]}>
            <Text style={[s.pillTxt, s.pillTxtRed]}>Debt removed</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.note || 'Debt'}</Text>
          <Text style={[s.cardAmount, { color: c.error }]}>{fmt(Number(entry.amount), currency)}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'saving_edited') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillOrange]}>
            <Text style={[s.pillTxt, s.pillTxtOrange]}>Saving edited</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.note || 'Saving'}</Text>
          <Text style={[s.cardAmount, { color: c.success }]}>+{fmt(Number(entry.amount), currency)}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'saving_deleted') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillRed]}>
            <Text style={[s.pillTxt, s.pillTxtRed]}>Saving removed</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.note || 'Saving'}</Text>
          <Text style={[s.cardAmount, { color: c.success }]}>{fmt(Number(entry.amount), currency)}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'milestone_earned') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillGreen]}>
            <Text style={[s.pillTxt, s.pillTxtGreen]}>Milestone reached ✓</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <Text style={s.cardTitle}>{entry.note || 'Milestone'}</Text>
      </View>
    );
  }

  if (entry.kind === 'debt_paid_off') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillGreen]}>
            <Text style={[s.pillTxt, s.pillTxtGreen]}>Debt paid off 🎉</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>{entry.note || 'Debt'}</Text>
          <Text style={[s.cardAmount, { color: c.primary }]}>{fmt(Number(entry.amount), currency)}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'quit_date_changed') {
    const formatted = entry.note
      ? new Date(entry.note).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillTeal]}>
            <Text style={[s.pillTxt, s.pillTxtTeal]}>Start date updated</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <Text style={s.cardTitle}>{formatted ?? 'Date changed'}</Text>
      </View>
    );
  }

  if (entry.kind === 'journey_started') {
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.pill, s.pillGreen]}>
            <Text style={[s.pillTxt, s.pillTxtGreen]}>Journey started 🌱</Text>
          </View>
          <Text style={s.cardDate}>{formatDate(entry.created_at)}</Text>
        </View>
        <Text style={s.cardTitle}>The day you turned it around</Text>
      </View>
    );
  }

  return null;
}

type FilterKind = 'all' | 'urge' | 'payment' | 'milestone' | 'reset';
type FilterOutcome = 'all' | 'overcame' | 'slipped';

export default function JournalScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const isMountedRef = useRef(true);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [clearAllVisible, setClearAllVisible] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [filterKind, setFilterKind] = useState<FilterKind>('all');
  const [filterOutcome, setFilterOutcome] = useState<FilterOutcome>('all');

  const fetchFeed = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [urgeRes, debtsRes, paymentsRes, savingsRes, resetsRes, activityRes, profileRes] = await Promise.all([
        supabase.from('urge_journal').select('*').eq('user_id', user.id).neq('trigger', 'Relapse'),
        supabase.from('debts').select('id, name, total_amount, category, created_at').eq('user_id', user.id),
        supabase.from('debt_payments').select('id, amount, note, created_at, debts(name)').eq('user_id', user.id),
        supabase.from('losses').select('id, amount, note, created_at').eq('user_id', user.id).eq('type', 'saving'),
        supabase.from('losses').select('id, note, created_at').eq('user_id', user.id).eq('type', 'streak_reset'),
        supabase.from('losses').select('id, type, amount, note, created_at').eq('user_id', user.id).in('type', ['debt_edited', 'debt_deleted', 'saving_edited', 'saving_deleted', 'milestone_earned', 'debt_paid_off', 'quit_date_changed', 'journey_started']),
        supabase.from('users').select('currency').eq('id', user.id).maybeSingle(),
      ]);

      if (!isMountedRef.current) return;
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
      (activityRes.data ?? []).forEach((e: any) => entries.push({ kind: e.type, id: e.id, amount: e.amount, note: e.note, created_at: e.created_at }));

      entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (!isMountedRef.current) return;
      setFetchError(false);
      setFeed(entries);
    } catch (e) {
      console.warn('[journal] fetchFeed error:', e);
      if (isMountedRef.current) setFetchError(true);
    }
  }, []);

  useEffect(() => { fetchFeed().finally(() => { if (isMountedRef.current) setLoading(false); }); }, [fetchFeed]);
  useFocusEffect(useCallback(() => { fetchFeed(); }, [fetchFeed]));

  const filteredFeed = feed.filter(e => {
    if (filterKind === 'urge') {
      if (e.kind !== 'urge') return false;
      if (filterOutcome !== 'all' && e.outcome !== filterOutcome) return false;
      return true;
    }
    if (filterKind === 'payment') return e.kind === 'payment' || e.kind === 'saving' || e.kind === 'debt_paid_off';
    if (filterKind === 'milestone') return e.kind === 'milestone_earned';
    if (filterKind === 'reset') return e.kind === 'streak_reset';
    return true;
  });

  const clearAllLogs = () => setClearAllVisible(true);

  const executeClearAll = async () => {
    setClearingAll(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // debt_payments must be deleted before debts to avoid FK constraint conflicts
        const { error: debtPaymentsErr } = await supabase.from('debt_payments').delete().eq('user_id', user.id);
        if (debtPaymentsErr) { Alert.alert('Could not clear journal', friendlyError(debtPaymentsErr)); return; }
        const { error: debtsErr } = await supabase.from('debts').delete().eq('user_id', user.id);
        if (debtsErr) { Alert.alert('Could not clear journal', friendlyError(debtsErr)); return; }
        const [urgeRes, moodRes, lossRes] = await Promise.all([
          supabase.from('urge_journal').delete().eq('user_id', user.id),
          supabase.from('mood_checkins').delete().eq('user_id', user.id),
          supabase.from('losses').delete().eq('user_id', user.id).in('type', ['saving', 'streak_reset', 'debt_edited', 'debt_deleted', 'saving_edited', 'saving_deleted', 'milestone_earned', 'debt_paid_off', 'quit_date_changed', 'journey_started']),
        ]);
        const dbError = [urgeRes, moodRes, lossRes].find(r => r.error)?.error;
        if (dbError) {
          Alert.alert('Could not clear journal', friendlyError(dbError));
          return;
        }
        await AsyncStorage.removeItem(CHECKLIST_KEY);
        await fetchFeed();
      }
    } catch (e) {
      console.warn('[journal] executeClearAll error:', e);
      Alert.alert('Could not clear journal', 'Please try again.');
    } finally {
      if (isMountedRef.current) {
        setClearingAll(false);
        setClearAllVisible(false);
      }
    }
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { backgroundColor: c.headerBg }]}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back" accessibilityRole="button">
              <Ionicons name="chevron-back" size={26} color={c.white} />
            </Pressable>
            <View style={s.headerCenter}>
              <Text style={s.headerTitle}>My Journal</Text>
            </View>
            {feed.length > 0 ? (
              <Pressable onPress={clearAllLogs} hitSlop={12} style={s.clearBtn} accessibilityLabel="Clear all entries" accessibilityRole="button">
                <Ionicons name="trash-outline" size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>
        </SafeAreaView>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : fetchError ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>⚠️</Text>
          <Text style={s.emptyTitle}>Could not load journal</Text>
          <Text style={s.emptySub}>Check your connection and pull down to retry.</Text>
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
          data={filteredFeed}
          keyExtractor={item => `${item.kind}-${item.id}`}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <View style={s.filterWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                {(['all', 'urge', 'payment', 'milestone', 'reset'] as FilterKind[]).map(k => (
                  <Pressable
                    key={k}
                    style={[s.filterChip, filterKind === k && s.filterChipActive]}
                    onPress={() => { setFilterKind(k); if (k !== 'urge') setFilterOutcome('all'); }}>
                    <Text style={[s.filterChipTxt, filterKind === k && s.filterChipTxtActive]}>
                      {k === 'all' ? 'All' : k === 'urge' ? 'Urges' : k === 'payment' ? 'Payments' : k === 'milestone' ? 'Milestones' : 'Resets'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {filterKind === 'urge' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                  {(['all', 'overcame', 'slipped'] as FilterOutcome[]).map(o => (
                    <Pressable
                      key={o}
                      style={[s.filterChip, s.filterChipSub, filterOutcome === o && s.filterChipActive]}
                      onPress={() => setFilterOutcome(o)}>
                      <Text style={[s.filterChipTxt, filterOutcome === o && s.filterChipTxtActive]}>
                        {o === 'all' ? 'All' : o === 'overcame' ? 'Overcame ✓' : 'Had a slip'}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {filteredFeed.length === 0 && (
                <View style={s.filterEmpty}>
                  <Text style={s.filterEmptyTxt}>No entries match this filter.</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => <EntryCard entry={item} currency={currency} c={c} />}
        />
      )}

      <Modal visible={clearAllVisible} transparent animationType="fade" onRequestClose={() => setClearAllVisible(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setClearAllVisible(false)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={s.confirmIconCircle}>
                <Ionicons name="trash-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.confirmTitle}>Clear all journal entries?</Text>
            <Text style={s.confirmBody}>
              This permanently deletes all urge logs, mood check-ins, debts, payments, savings and streak resets.{'\n'}This cannot be undone.
            </Text>
            <View style={s.confirmActions}>
              <Pressable style={s.confirmCancel} onPress={() => setClearAllVisible(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.confirmDelete, clearingAll && { opacity: 0.6 }]} onPress={executeClearAll} disabled={clearingAll}>
                {clearingAll
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.confirmDeleteTxt}>Clear all</Text>}
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
  headerContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, gap: 8,
  },
  backBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.white },

  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  filterWrap: { paddingTop: 12, paddingBottom: 4, gap: 8, marginHorizontal: -16 },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingRight: 24 },
  filterChip: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: c.bgElement },
  filterChipSub: { backgroundColor: c.bgElement },
  filterChipActive: { backgroundColor: c.primary },
  filterChipTxt: { fontSize: 13, fontWeight: '600', color: c.textBody },
  filterChipTxtActive: { color: c.white },
  filterEmpty: { paddingVertical: 24, alignItems: 'center' },
  filterEmptyTxt: { fontSize: 14, color: c.textFaint },

  card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: c.textPrimary, flex: 1 },
  cardAmount: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
  cardNote: { fontSize: 13, color: c.textBody, lineHeight: 18 },
  cardDate: { fontSize: 12, color: c.textFaint },

  pill: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  pillTxt: { fontSize: 12, fontWeight: '700' },

  pillGreen: { backgroundColor: c.bgTeal },
  pillTxtGreen: { color: c.success },
  pillRed: { backgroundColor: c.bgError },
  pillTxtRed: { color: c.error },
  pillTeal: { backgroundColor: c.bgTeal },
  pillTxtTeal: { color: c.primary },
  pillGreenSolid: { backgroundColor: c.bgTeal },
  pillTxtGreenSolid: { color: c.success },
  pillOrange: { backgroundColor: c.bgWarm },
  pillTxtOrange: { color: '#c0680a' },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 40, gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  emptySub: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },

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
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.bgElement },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  confirmDelete: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.error },
  confirmDeleteTxt: { color: c.white, fontWeight: '700', fontSize: 15 },
});
