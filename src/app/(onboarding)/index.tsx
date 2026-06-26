import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Logo from '@/components/Logo';
import { ONBOARDED_KEY, SEEN_WELCOME_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { authFlags } from '@/lib/auth-flags';

export default function WelcomeScreen() {
  const router = useRouter();
  const [btnWidth, setBtnWidth] = useState<number | undefined>(undefined);
  // Stays false until we confirm there is no active session.
  // If there IS a session (e.g. brief flash during Google OAuth), we redirect
  // immediately and the user never sees the welcome content.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.setItem(SEEN_WELCOME_KEY, 'true');
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setReady(true);
        return;
      }
      // If Google OAuth is still in flight, signup.tsx owns the navigation — don't double-navigate.
      if (authFlags.googleOAuthInProgress) {
        return; // stay as blank gradient; signup.tsx will replace this screen
      }
      // Fully onboarded — send straight to tabs.
      const onboarded = await AsyncStorage.getItem(ONBOARDED_KEY);
      if (onboarded === 'true') {
        router.replace('/(tabs)' as any);
        return;
      }
      // Mid-onboarding (e.g. user pressed back from q1): show the welcome screen
      // so they can continue. Do NOT redirect to q1 — that would create a back-loop.
      setReady(true);
    });
  }, []);

  // Render a plain gradient while checking — visually matches the loading screen
  // so any flash is invisible to the user.
  if (!ready || authFlags.googleOAuthInProgress) {
    return (
      <LinearGradient colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']} style={styles.gradient}>
        <View style={styles.center}>
          <Logo size={72} variant="white" />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <View style={styles.logoBox}>
            <Logo size={84} variant="white" />
          </View>

          <Text
            style={styles.appName}
            onLayout={e => setBtnWidth(e.nativeEvent.layout.width)}>
            CornerDay
          </Text>
          <Text style={styles.tagline}>The day you turn it around{'\n'}starts today.</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, btnWidth ? { width: btnWidth } : undefined, pressed && styles.pressed]}
            onPress={() => router.push('/(onboarding)/signup')}>
            <Text style={styles.primaryBtnText}>Get started</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, btnWidth ? { width: btnWidth } : undefined, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/(onboarding)/signup', params: { mode: 'signin' } })}>
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  safe: {
    flex: 1,
    paddingHorizontal: 28,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  logoBox: {
    width: 114,
    height: 114,
    borderRadius: 26,
    backgroundColor: '#0F6E6E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 18,
  },
  appName: {
    fontSize: 54,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    lineHeight: 30,
  },
  actions: {
    paddingBottom: 52,
    marginBottom: 28,
    gap: 14,
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F6E6E',
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.32)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.75,
  },
});
