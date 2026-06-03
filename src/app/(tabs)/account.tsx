import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ONBOARDED_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';

interface Profile {
  displayName: string | null;
  email: string | null;
  quitTimestamp: string | null;
  motivation: string | null;
  isPremium: boolean;
}

const MOTIVATION_LABELS: Record<string, string> = {
  family: 'Family',
  finances: 'Finances',
  mental_health: 'Mental health',
  saving: 'Saving for something',
  better_self: 'Becoming a better me',
  break_free: 'Breaking free for good',
};

function formatQuitDate(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date} @ ${time}`;
}

export default function AccountScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editDate, setEditDate] = useState<Date | null>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('display_name, quit_timestamp, quit_date, motivation, is_premium')
      .eq('id', user.id)
      .single();
    setProfile({
      displayName: data?.display_name ?? null,
      email: user.email ?? null,
      quitTimestamp: data?.quit_timestamp ?? data?.quit_date ?? null,
      motivation: data?.motivation ?? null,
      isPremium: data?.is_premium ?? false,
    });
  }, []);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

  const openEdit = () => {
    const parsed = profile?.quitTimestamp ? new Date(profile.quitTimestamp) : null;
    const current = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
    setEditDate(current);

    if (Platform.OS === 'ios') {
      setShowIOSModal(true);
      return;
    }

    // Android: imperative two-step date → time
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (_event: any, selectedDate?: Date) => {
        if (!selectedDate) return;
        DateTimePickerAndroid.open({
          value: selectedDate,
          mode: 'time',
          is24Hour: true,
          onChange: (_timeEvent: any, selectedTime?: Date) => {
            if (!selectedTime) return;
            const merged = new Date(selectedDate);
            merged.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            Alert.alert(
              'Update start date?',
              `Set to ${formatQuitDate(merged.toISOString())}?\n\nThis will reset your current streak counter.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Save', onPress: () => saveQuitDate(merged) },
              ],
            );
          },
        });
      },
    });
  };

  const saveQuitDate = async (date: Date) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const iso = date.toISOString();
      const dateOnly = iso.split('T')[0];
      await supabase.from('users').update({
        quit_timestamp: iso,
        quit_date: dateOnly,
      }).eq('id', user.id);
      await supabase.from('streaks').update({
        streak_start_date: dateOnly,
        current_streak: 0,
      }).eq('user_id', user.id);
      setProfile(prev => prev ? { ...prev, quitTimestamp: iso } : prev);
    }
    setSaving(false);
  };


  const confirmSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            await AsyncStorage.removeItem(ONBOARDED_KEY);
            await supabase.auth.signOut();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0F6E6E" />
      </View>
    );
  }

  const initials = (profile?.displayName ?? profile?.email ?? '?')[0].toUpperCase();
  const motivationLabel = profile?.motivation
    ? profile.motivation.split(',').filter(Boolean)
        .map(m => MOTIVATION_LABELS[m] ?? m)
        .join(', ')
    : null;
  const quitFormatted = formatQuitDate(profile?.quitTimestamp ?? null);

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Account</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>

        {/* Profile card */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initials}</Text>
          </View>
          <Text style={s.displayName}>{profile?.displayName ?? 'Anonymous'}</Text>
          <Text style={s.email}>{profile?.email}</Text>
          {profile?.isPremium && (
            <View style={s.premiumBadge}>
              <Text style={s.premiumBadgeTxt}>✨ Premium</Text>
            </View>
          )}
        </View>

        {/* Journey */}
        {(quitFormatted || motivationLabel) && (
          <View style={s.infoCard}>
            <Text style={s.infoCardTitle}>Your journey</Text>
            {quitFormatted && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Started</Text>
                <View style={s.infoValueRow}>
                  <Text style={s.infoValue}>{quitFormatted}</Text>
                  <Pressable
                    onPress={openEdit}
                    disabled={saving}
                    style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.6 }]}>
                    {saving
                      ? <ActivityIndicator size="small" color="#0F6E6E" />
                      : <Text style={s.editBtnTxt}>Edit</Text>}
                  </Pressable>
                </View>
              </View>
            )}
            {motivationLabel && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Why you quit</Text>
                <Text style={s.infoValue}>{motivationLabel}</Text>
              </View>
            )}
          </View>
        )}

        {/* Subscription */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Subscription</Text>
          <Text style={s.subStatus}>
            {profile?.isPremium ? '✨ Premium — active' : 'Free plan'}
          </Text>
          {!profile?.isPremium && (
            <Pressable style={({ pressed }) => [s.upgradeBtn, pressed && { opacity: 0.85 }]}>
              <Text style={s.upgradeBtnTxt}>Upgrade to Premium</Text>
            </Pressable>
          )}
        </View>

        {/* Privacy Policy */}
        <Pressable
          style={({ pressed }) => [s.privacyBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/privacy-policy')}>
          <Text style={s.privacyBtnTxt}>Privacy Policy</Text>
        </Pressable>

        {/* Sign out */}
        <Pressable
          style={({ pressed }) => [s.signOutBtn, pressed && { opacity: 0.7 }]}
          onPress={confirmSignOut}
          disabled={signingOut}>
          {signingOut
            ? <ActivityIndicator color="#c0392b" size="small" />
            : <Text style={s.signOutTxt}>Sign out</Text>}
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* iOS modal picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={showIOSModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Set start date & time</Text>
              </View>
              {editDate && (
                <DateTimePicker
                  value={editDate}
                  mode="datetime"
                  display="spinner"
                  onValueChange={(d) => d && setEditDate(d)}
                  maximumDate={new Date()}
                  style={{ height: 200 }}
                />
              )}
              <View style={s.modalActions}>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setShowIOSModal(false)}>
                  <Text style={s.modalBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, s.modalBtnSave, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    setShowIOSModal(false);
                    if (!editDate) return;
                    Alert.alert(
                      'Update start date?',
                      `Set to ${formatQuitDate(editDate.toISOString())}?\n\nThis will reset your current streak counter.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Save', onPress: () => saveQuitDate(editDate) },
                      ],
                    );
                  }}>
                  <Text style={s.modalBtnSaveTxt}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
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

  profileCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    alignItems: 'center', gap: 6,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#e6f7f7', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  avatarTxt: { fontSize: 32, fontWeight: '700', color: '#0F6E6E' },
  displayName: { fontSize: 18, fontWeight: '700', color: '#111' },
  email: { fontSize: 13, color: '#888' },
  premiumBadge: {
    backgroundColor: '#e6f7f7', paddingVertical: 4, paddingHorizontal: 12,
    borderRadius: 12, marginTop: 4,
  },
  premiumBadgeTxt: { fontSize: 13, color: '#0F6E6E', fontWeight: '600' },

  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  infoCardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 14, color: '#888' },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  infoValue: { fontSize: 14, color: '#111', fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  editBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#e6f7f7' },
  editBtnTxt: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  subStatus: { fontSize: 15, color: '#555' },
  upgradeBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  upgradeBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  privacyBtn: { alignItems: 'center', paddingVertical: 12 },
  privacyBtnTxt: { fontSize: 13, color: '#aaa', textDecorationLine: 'underline' },

  signOutBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#ffcdd2',
  },
  signOutTxt: { fontSize: 15, color: '#c0392b', fontWeight: '600' },

  // iOS modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f0f0f0' },
  modalBtnCancel: { fontSize: 15, color: '#555', fontWeight: '600' },
  modalBtnSave: { backgroundColor: '#0F6E6E' },
  modalBtnSaveTxt: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
