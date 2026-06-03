import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

const TRIGGERS = [
  { key: 'betting_ads', label: 'Betting ads' },
  { key: 'live_sport',  label: 'Live sport' },
  { key: 'social',      label: 'Friends/social' },
  { key: 'stress',      label: 'Stress' },
  { key: 'boredom',     label: 'Boredom' },
  { key: 'financial',   label: 'Financial pressure' },
  { key: 'other',       label: 'Other' },
];

type JournalEntry = {
  id: string;
  trigger: string;
  outcome: 'overcame' | 'slipped';
  note: string | null;
  created_at: string;
};

function triggerLabel(key: string) {
  return TRIGGERS.find(t => t.key === key)?.label ?? key;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const overcame = entry.outcome === 'overcame';
  return (
    <View style={s.entryCard}>
      <View style={s.entryTop}>
        <View style={[s.outcomePill, overcame ? s.pillGreen : s.pillMuted]}>
          <Text style={[s.pillText, overcame ? s.pillTextGreen : s.pillTextMuted]}>
            {overcame ? 'Overcame ✓' : 'Had a slip'}
          </Text>
        </View>
        <Text style={s.entryDate}>{formatDate(entry.created_at)}</Text>
      </View>
      <Text style={s.entryTrigger}>{triggerLabel(entry.trigger)}</Text>
      {entry.note ? <Text style={s.entryNote}>{entry.note}</Text> : null}
    </View>
  );
}

export default function JournalScreen() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [customTrigger, setCustomTrigger] = useState('');
  const [outcome, setOutcome] = useState<'overcame' | 'slipped' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('urge_journal')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setEntries((data ?? []) as JournalEntry[]);
  }, []);

  useEffect(() => {
    fetchEntries().finally(() => setLoading(false));
  }, [fetchEntries]);

  useFocusEffect(useCallback(() => {
    fetchEntries();
  }, [fetchEntries]));

  const resetForm = () => {
    setSelectedTrigger(null);
    setCustomTrigger('');
    setOutcome(null);
    setNote('');
  };

  const saveEntry = async () => {
    if (!selectedTrigger || !outcome) return;
    const triggerValue =
      selectedTrigger === 'other'
        ? (customTrigger.trim() || 'other')
        : selectedTrigger;

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase.from('urge_journal').insert({
      user_id: user.id,
      trigger: triggerValue,
      outcome,
      note: note.trim() || null,
    });

    setSaving(false);
    setModalVisible(false);
    resetForm();
    fetchEntries();
  };

  const canSave = selectedTrigger !== null && outcome !== null &&
    (selectedTrigger !== 'other' || customTrigger.trim().length > 0);

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
            <Pressable
              style={({ pressed }) => [s.logBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setModalVisible(true)}>
              <Text style={s.logBtnTxt}>+ Log entry</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#0F6E6E" />
        </View>
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📓</Text>
          <Text style={s.emptyTitle}>No entries yet</Text>
          <Text style={s.emptySub}>
            Log a moment when you feel the urge — it helps you spot patterns and build resilience.
          </Text>
          <Pressable
            style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setModalVisible(true)}>
            <Text style={s.emptyBtnTxt}>Log your first entry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => <EntryCard entry={item} />}
        />
      )}

      {/* Add Entry Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setModalVisible(false); resetForm(); }}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.modalBackdrop} onPress={() => { setModalVisible(false); resetForm(); }} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Log a moment</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Trigger */}
              <Text style={s.fieldLabel}>What triggered it?</Text>
              <View style={s.chipsWrap}>
                {TRIGGERS.map(t => (
                  <Pressable
                    key={t.key}
                    style={[s.chip, selectedTrigger === t.key && s.chipActive]}
                    onPress={() => setSelectedTrigger(t.key)}>
                    <Text style={[s.chipTxt, selectedTrigger === t.key && s.chipTxtActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {selectedTrigger === 'other' && (
                <TextInput
                  style={s.customInput}
                  placeholder="Describe the trigger…"
                  placeholderTextColor="#aaa"
                  value={customTrigger}
                  onChangeText={setCustomTrigger}
                  maxLength={120}
                />
              )}

              {/* Outcome */}
              <Text style={s.fieldLabel}>What happened?</Text>
              <View style={s.outcomeRow}>
                <Pressable
                  style={[s.outcomeBtn, outcome === 'overcame' && s.outcomeBtnActive]}
                  onPress={() => setOutcome('overcame')}>
                  <Text style={[s.outcomeBtnTxt, outcome === 'overcame' && s.outcomeBtnTxtActive]}>
                    Overcame it ✓
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.outcomeBtn, outcome === 'slipped' && s.outcomeBtnSlipped]}
                  onPress={() => setOutcome('slipped')}>
                  <Text style={[s.outcomeBtnTxt, outcome === 'slipped' && s.outcomeBtnTxtActive]}>
                    Had a slip
                  </Text>
                </Pressable>
              </View>

              {/* Note */}
              <Text style={s.fieldLabel}>How are you feeling? <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.noteInput}
                placeholder="Add a note…"
                placeholderTextColor="#aaa"
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                maxLength={500}
                textAlignVertical="top"
              />

              {/* Actions */}
              <View style={s.sheetActions}>
                <Pressable
                  style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => { setModalVisible(false); resetForm(); }}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    s.saveBtn,
                    !canSave && s.saveBtnDisabled,
                    pressed && canSave && { opacity: 0.85 },
                  ]}
                  onPress={saveEntry}
                  disabled={!canSave || saving}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.saveBtnTxt}>Save entry</Text>}
                </Pressable>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
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
  headerContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, gap: 8,
  },
  backBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  logBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12,
  },
  logBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },

  list: { padding: 16, gap: 10 },

  entryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 6 },
  entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  outcomePill: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  pillGreen: { backgroundColor: '#e6f7f0' },
  pillMuted: { backgroundColor: '#f5f5f5' },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextGreen: { color: '#0a7a4e' },
  pillTextMuted: { color: '#888' },
  entryDate: { fontSize: 12, color: '#aaa' },
  entryTrigger: { fontSize: 15, fontWeight: '600', color: '#111' },
  entryNote: { fontSize: 13, color: '#666', lineHeight: 18 },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 40, gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 8, backgroundColor: '#0F6E6E',
    borderRadius: 24, paddingVertical: 13, paddingHorizontal: 32,
  },
  emptyBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, maxHeight: '85%',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0',
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 20 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 10, marginTop: 4 },
  optional: { fontWeight: '400', color: '#aaa' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14,
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  chipActive: { backgroundColor: '#e6f7f7', borderColor: '#0F6E6E' },
  chipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  chipTxtActive: { color: '#0F6E6E' },

  customInput: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111', marginBottom: 16,
  },

  outcomeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  outcomeBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  outcomeBtnActive: { backgroundColor: '#e6f7f0', borderColor: '#0a7a4e' },
  outcomeBtnSlipped: { backgroundColor: '#fff5f5', borderColor: '#c0392b' },
  outcomeBtnTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
  outcomeBtnTxtActive: { color: '#111' },

  noteInput: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111', minHeight: 80, marginBottom: 20,
  },

  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  cancelBtnTxt: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: {
    flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#0F6E6E',
  },
  saveBtnDisabled: { backgroundColor: '#b0cece' },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
