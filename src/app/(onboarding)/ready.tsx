import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

import { ONBOARDED_KEY } from '@/constants/storage-keys';
import { useOnboarding } from '@/context/onboarding';
import { supabase } from '@/lib/supabase';
import { generateUsername } from '@/lib/usernameGenerator';

function CelebrationIllustration() {
  return (
    <Svg width={120} height={140} viewBox="0 0 120 140">
      {/* Confetti */}
      <Rect x="15" y="10" width="7" height="7" rx="1" fill="rgba(255,255,255,0.6)" transform="rotate(20 15 10)" />
      <Rect x="95" y="8" width="6" height="6" rx="1" fill="rgba(255,255,255,0.5)" transform="rotate(-15 95 8)" />
      <Rect x="105" y="35" width="5" height="5" rx="1" fill="rgba(168,216,208,0.8)" transform="rotate(30 105 35)" />
      <Rect x="8" y="40" width="5" height="5" rx="1" fill="rgba(255,255,255,0.5)" transform="rotate(-20 8 40)" />
      <Circle cx="25" cy="28" r="3" fill="rgba(255,255,255,0.5)" />
      <Circle cx="100" cy="22" r="2.5" fill="rgba(168,216,208,0.7)" />
      <Circle cx="112" cy="55" r="2" fill="rgba(255,255,255,0.4)" />
      <Circle cx="10" cy="62" r="2" fill="rgba(255,255,255,0.4)" />

      {/* Left arm raised */}
      <Path d="M42 75 Q28 55 18 38" stroke="white" strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* Left hand */}
      <Circle cx="18" cy="36" r="5" fill="white" />

      {/* Right arm raised */}
      <Path d="M78 75 Q92 55 102 38" stroke="white" strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* Right hand */}
      <Circle cx="102" cy="36" r="5" fill="white" />

      {/* Body */}
      <Path d="M42 95 Q60 105 78 95 L74 75 Q60 82 46 75 Z" fill="rgba(255,255,255,0.9)" />

      {/* Legs */}
      <Path d="M50 105 Q48 118 46 130" stroke="rgba(255,255,255,0.9)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <Path d="M70 105 Q72 118 74 130" stroke="rgba(255,255,255,0.9)" strokeWidth="7" strokeLinecap="round" fill="none" />

      {/* Head */}
      <Circle cx="60" cy="58" r="18" fill="white" />
      {/* Eyes */}
      <Circle cx="54" cy="55" r="2.5" fill="#0F6E6E" />
      <Circle cx="66" cy="55" r="2.5" fill="#0F6E6E" />
      {/* Smile */}
      <Path d="M52 63 Q60 70 68 63" stroke="#0F6E6E" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Stars near hands */}
      <Path d="M12 22 L13.5 18 L15 22 L19 22 L16 25 L17 29 L13.5 27 L10 29 L11 25 L8 22 Z" fill="rgba(255,255,255,0.7)" />
      <Path d="M105 24 L106 21 L107 24 L110 24 L108 26 L109 29 L106 27 L103 29 L104 26 L102 24 Z" fill="rgba(255,255,255,0.6)" />
    </Svg>
  );
}

const MOTIVATION_LABELS: Record<string, string> = {
  family: 'My family',
  finances: 'My finances',
  mental_health: 'My mental health',
  saving: 'Saving for something',
  better_self: 'Becoming a better me',
};

const CHECKLIST = [
  { icon: '🎯', text: 'Your motivation is set' },
  { icon: '🌊', text: 'Your trigger is identified' },
  { icon: '🏆', text: 'Your goal is locked in' },
  { icon: '🔒', text: 'Your data is private & secure' },
];

export default function ReadyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, clearProgress } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState(() => generateUsername());
  const [customName, setCustomName] = useState('');

  const motivationLabel = data.motivation
    ? MOTIVATION_LABELS[data.motivation] ?? data.motivation
    : 'your reason';

  const handleGo = async () => {
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Session expired. Please sign in again.');
      setLoading(false);
      return;
    }

    const quitTimestamp = data.quitDate ? new Date(data.quitDate) : new Date();
    const now = quitTimestamp.toISOString();
    const y = quitTimestamp.getFullYear();
    const mo = String(quitTimestamp.getMonth() + 1).padStart(2, '0');
    const dy = String(quitTimestamp.getDate()).padStart(2, '0');
    const today = `${y}-${mo}-${dy}`;

    const [updateResult, streakResult] = await Promise.all([
      supabase.from('users').update({
        display_name: customName.trim() || username,
        motivation: data.motivation ?? '',
        trigger: data.trigger ?? '',
        goal: data.goal ?? '',
        support_type: data.supportType ?? '',
        weekly_bet: data.weeklyBet ?? null,
        currency: data.currency ?? 'USD',
        quit_date: today,
        quit_timestamp: now,
      }).eq('id', user.id),

      supabase.from('streaks').upsert({
        user_id: user.id,
        current_streak: 0,
        longest_streak: 0,
        streak_start_date: today,
        last_check_in: today,
      }, { onConflict: 'user_id' }),
    ]);

    if (updateResult.error || streakResult.error) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    clearProgress();
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    router.replace('/(tabs)');
  };

  return (
    <LinearGradient colors={['#0F6E6E', '#1a9a9a', '#a8d8d0']} style={styles.gradient}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/q5')}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <View style={styles.hero}>
          <Text style={styles.checkmark}>🌟</Text>
          <Text style={styles.title}>You're all set!</Text>
          <Text style={styles.subtitle}>
            Your motivation is{' '}
            <Text style={styles.highlight}>{motivationLabel}</Text>.{'\n'}
            Let's start turning things around.
          </Text>
        </View>

        <View style={styles.checklist}>
          {CHECKLIST.map((item, i) => (
            <View key={i} style={styles.checkItem}>
              <Text style={styles.checkIcon}>{item.icon}</Text>
              <Text style={styles.checkText}>{item.text}</Text>
              <Text style={styles.tick}>✓</Text>
            </View>
          ))}
        </View>

        {/* Username picker */}
        <View style={styles.usernameCard}>
          <Text style={styles.usernameLabel}>Your username</Text>
          <View style={styles.usernameRow}>
            <Text style={styles.usernameText} numberOfLines={1} adjustsFontSizeToFit>
              {customName.trim() || username}
            </Text>
            <Pressable
              onPress={() => { setUsername(generateUsername()); setCustomName(''); }}
              style={({ pressed }) => [styles.regenBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}>
              <Ionicons name="shuffle-outline" size={20} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>
          <TextInput
            style={styles.usernameInput}
            value={customName}
            onChangeText={setCustomName}
            placeholder="Or type your own…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            maxLength={30}
            returnKeyType="done"
          />
          <Text style={styles.usernameHint}>You can change this anytime in Account</Text>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => router.replace('/(onboarding)/signup')}>
              <Text style={styles.errorLink}>Go to sign in →</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.spacer} />

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            onPress={handleGo}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#0F6E6E" />
            ) : (
              <Text style={styles.btnText}>Go to my dashboard</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 28 },
  backBtn: {
    alignSelf: 'flex-start',
    padding: 4,
    marginTop: 8,
    marginLeft: -4,
  },
  checkmark: { fontSize: 64, marginBottom: 8 },
  hero: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 24,
    gap: 12,
  },
  spacer: { flex: 1 },
title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 24,
  },
  highlight: {
    fontWeight: '700',
    color: '#fff',
  },
  checklist: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 20,
    gap: 14,
    marginBottom: 24,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkIcon: { fontSize: 20 },
  checkText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  tick: {
    fontSize: 16,
    color: '#a8d8d0',
    fontWeight: '700',
  },
  usernameCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  usernameLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  usernameText: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  regenBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usernameInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  usernameHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  errorBox: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#ffe0e0',
    textAlign: 'center',
    fontSize: 13,
  },
  errorLink: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footer: { paddingBottom: 0 },
  btn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F6E6E',
  },
  pressed: { opacity: 0.8 },
});
