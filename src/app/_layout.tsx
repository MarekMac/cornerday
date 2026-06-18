import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, AppStateStatus, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BIOMETRIC_LOCK_KEY } from '@/constants/storage-keys';
import { initHaptics } from '@/lib/haptics';
import { getImagePickerActive } from '@/lib/image-picker-active';

// Suppress the dev-only "GO_BACK not handled" overlay — this warning is
// emitted by React Navigation when Android restores navigation state on
// app resume and immediately fires a back gesture before our auth guard
// runs. It is a no-op in production builds (onUnhandledAction is empty).
if (__DEV__) {
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes("'GO_BACK'")) return;
    orig(...args);
  };
}

import { DarkTheme, DefaultTheme, ThemeProvider, ErrorBoundaryProps } from 'expo-router';
import { Slot, useRouter, useRootNavigationState } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Session } from '@supabase/supabase-js';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ONBOARDED_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY, SEEN_WELCOME_KEY } from '@/constants/storage-keys';
import { scheduleOnboardingCheckin } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { UserProvider } from '@/context/user';
import { PurchasesProvider, usePurchases } from '@/context/purchases';
import { AppThemeProvider, useAppTheme } from '@/context/theme';
import { Paywall } from '@/components/Paywall';

function InnerLayout() {
  const { colorScheme } = useAppTheme();
  const { isPremium } = usePurchases();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [seenWelcome, setSeenWelcome] = useState<boolean>(false);
  const [locked, setLocked] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);

  const authenticate = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock CornerDay',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
    } catch {}
  }, []);

  useEffect(() => { initHaptics(); }, []);

  useEffect(() => {
    if (locked) authenticate();
  }, [locked, authenticate]);

  // Schedule 72h re-engagement check-in; reschedule on every session change
  useEffect(() => {
    if (!session) return;
    scheduleOnboardingCheckin();
  }, [session]);

  // Handle tap on check-in notification — premium goes to AI coach, free goes to mood check-in
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      if (response.notification.request.content.data?.type === 'ai_checkin') {
        if (isPremium) {
          router.push('/(tabs)/coach?checkin=true' as any);
        } else {
          router.push('/(tabs)?checkin=true' as any);
        }
      }
    });
    return () => sub.remove();
  }, [router, isPremium]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (state === 'active' && backgroundedAtRef.current !== null) {
        const elapsed = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (elapsed > 2000) {
          const flag = await AsyncStorage.getItem(BIOMETRIC_LOCK_KEY);
          if (flag === 'true' && !getImagePickerActive()) setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const init = async () => {
      const [sessionResult, onboarded, savedStep, seenWelcomeVal, biometricFlag] = await Promise.all([
        supabase.auth.getSession().catch(() => ({ data: { session: null }, error: null })),
        AsyncStorage.getItem(ONBOARDED_KEY),
        AsyncStorage.getItem(ONBOARDING_STEP_KEY),
        AsyncStorage.getItem(SEEN_WELCOME_KEY),
        AsyncStorage.getItem(BIOMETRIC_LOCK_KEY),
      ]);

      const sess = sessionResult.data.session;
      const seen = seenWelcomeVal === 'true';
      setSession(sess);
      setSeenWelcome(seen);

      if (!sess) {
        // Clear stale onboarding flags so back-navigation restores cleanly next reload
        await AsyncStorage.multiRemove([ONBOARDED_KEY, ONBOARDING_STEP_KEY, ONBOARDING_DATA_KEY]);
        setPendingRoute(seen ? '/(onboarding)/signup?mode=signin' : '/(onboarding)');
      } else if (onboarded === 'true') {
        // Verify user row still exists — catches deleted account with stale JWT
        const { data: userRow } = await supabase.from('users').select('id').eq('id', sess.user.id).maybeSingle();
        if (!userRow) {
          await AsyncStorage.multiRemove([ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_STEP_KEY, ONBOARDING_DATA_KEY]);
          await supabase.auth.signOut();
          return;
        }
        setPendingRoute('/(tabs)');
      } else {
        // AsyncStorage flag missing (e.g. dev reload cleared storage) — check Supabase
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('id', sess.user.id)
          .maybeSingle();
        if (userData !== null) {
          // Row exists — user completed signup flow (questions may have been skipped)
          await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
          setPendingRoute('/(tabs)');
        } else {
          // Ghost session: auth JWT still cached but user row was deleted
          await AsyncStorage.multiRemove([ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_STEP_KEY, ONBOARDING_DATA_KEY]);
          await supabase.auth.signOut();
          return;
        }
      }

      // Lock on cold start if biometric is enabled and user has an active session
      if (biometricFlag === 'true' && sess) setLocked(true);

      setAuthChecked(true);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess);
      if (event === 'SIGNED_OUT') {
        await AsyncStorage.removeItem(ONBOARDED_KEY);
        const seen = (await AsyncStorage.getItem(SEEN_WELCOME_KEY)) === 'true';
        setSeenWelcome(seen);
        setPendingRoute(seen ? '/(onboarding)/signup?mode=signin' : '/(onboarding)');
        setAuthChecked(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authChecked || !navigationState?.key || !pendingRoute) return;
    router.replace(pendingRoute as any);
    setPendingRoute(null);
  }, [authChecked, navigationState?.key, pendingRoute]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Slot />
      <Paywall />
      {authChecked && locked && (
        <View style={lockStyles.overlay}>
          <LinearGradient colors={['#0F6E6E', '#1a9a9a', '#a8d8d0']} style={lockStyles.gradient}>
            <Text style={lockStyles.emoji}>🔒</Text>
            <Text style={lockStyles.title}>CornerDay</Text>
            <Text style={lockStyles.sub}>Your recovery is private</Text>
            <Pressable style={lockStyles.btn} onPress={authenticate} accessibilityLabel="Unlock CornerDay" accessibilityRole="button">
              <Text style={lockStyles.btnTxt}>Unlock</Text>
            </Pressable>
          </LinearGradient>
        </View>
      )}
    </ThemeProvider>
  );
}

const lockStyles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gradient: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emoji: { fontSize: 48, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  sub: { fontSize: 15, color: 'rgba(255,255,255,0.75)', marginBottom: 24 },
  btn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24, paddingHorizontal: 40, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  btnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <LinearGradient
      colors={['#0F6E6E', '#1a9a9a']}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}
    >
      <Text style={{ fontSize: 48 }}>⚠️</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' }}>
        Something went wrong
      </Text>
      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 20 }}>
        {error.message || 'An unexpected error occurred.'}
      </Text>
      <Pressable
        onPress={retry}
        accessibilityLabel="Try again"
        accessibilityRole="button"
        style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24, paddingHorizontal: 40, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Try again</Text>
      </Pressable>
    </LinearGradient>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <UserProvider>
          <PurchasesProvider>
            <InnerLayout />
          </PurchasesProvider>
        </UserProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
