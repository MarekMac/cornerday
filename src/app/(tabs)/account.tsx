import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  quitDate: string | null;
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

export default function AccountScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('display_name, quit_date, motivation, is_premium')
      .eq('id', user.id)
      .single();
    setProfile({
      displayName: data?.display_name ?? null,
      email: user.email ?? null,
      quitDate: data?.quit_date ?? null,
      motivation: data?.motivation ?? null,
      isPremium: data?.is_premium ?? false,
    });
  }, []);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

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
  const quitDateFormatted = profile?.quitDate
    ? new Date(profile.quitDate).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const motivationLabel = MOTIVATION_LABELS[profile?.motivation ?? ''] ?? profile?.motivation ?? null;

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
        {(quitDateFormatted || motivationLabel) && (
          <View style={s.infoCard}>
            <Text style={s.infoCardTitle}>Your journey</Text>
            {quitDateFormatted && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Quit date</Text>
                <Text style={s.infoValue}>{quitDateFormatted}</Text>
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
  infoValue: { fontSize: 14, color: '#111', fontWeight: '600', maxWidth: '55%', textAlign: 'right' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  subStatus: { fontSize: 15, color: '#555' },
  upgradeBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  upgradeBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  signOutBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#ffcdd2',
  },
  signOutTxt: { fontSize: 15, color: '#c0392b', fontWeight: '600' },
});
