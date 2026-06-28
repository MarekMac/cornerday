import { initSentry, Sentry } from '@/lib/sentry';
initSentry();

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, AppStateStatus, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BIOMETRIC_LOCK_KEY } from '@/constants/storage-keys';
import { initHaptics } from '@/lib/haptics';
import { getImagePickerActive } from '@/lib/image-picker-active';
import { authFlags } from '@/lib/auth-flags';

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
import { supabase } from '@/lib/supabase';
import { UserProvider } from '@/context/user';
import { PurchasesProvider, usePurchases } from '@/context/purchases';
import { AppThemeProvider, useAppTheme } from '@/context/theme';
import { NetworkProvider, useIsOnline } from '@/context/network';
import { Paywall } from '@/components/Paywall';

function InnerLayout() {
  const { colorScheme } = useAppTheme();
  const { isPremium } = usePurchases();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const authCheckedRef = useRef(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [seenWelcome, setSeenWelcome] = useState<boolean>(false);
  const [locked, setLocked] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  // Prevents SIGNED_OUT from routing to welcome/signin while a deep link (email
  // confirmation or password reset) is mid-flight and will set its own route.
  const handlingDeepLinkRef = useRef(false);
  // OAuth and token refreshes fire SIGNED_OUT immediately before SIGNED_IN.
  // Debounce the SIGNED_OUT navigation so a following SIGNED_IN can cancel it.
  const signedOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authenticate = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock CornerDay',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        requireConfirmation: false,
      });
      if (result.success) setLocked(false);
    } catch {
      // Biometric hardware unavailable or permission denied — don't trap the user
      setLocked(false);
    }
  }, []);

  useEffect(() => { authCheckedRef.current = authChecked; }, [authChecked]);
  useEffect(() => { initHaptics(); }, []);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch { /* silent — never block startup */ }
    })();
  }, []);

  useEffect(() => {
    if (locked) authenticate();
  }, [locked, authenticate]);

  // Handle tap on check-in notification — premium goes to AI coach, free goes to mood check-in
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      if (!session) return;
      if (response.notification.request.content.data?.type === 'ai_checkin') {
        if (isPremium) {
          router.push('/(tabs)/coach?checkin=true' as any);
        } else {
          router.push('/(tabs)?checkin=true' as any);
        }
      }
    });
    return () => sub.remove();
  }, [router, isPremium, session]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (state === 'active' && backgroundedAtRef.current !== null) {
        const elapsed = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (elapsed > 30000) {
          const flag = await AsyncStorage.getItem(BIOMETRIC_LOCK_KEY);
          if (flag === 'true' && !getImagePickerActive()) setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const parseDeepLinkParams = (url: string): Record<string, string> => {
      const params: Record<string, string> = {};
      const parse = (str: string) => str.split('&').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        try { params[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1)); } catch { /* ignore */ }
      });
      // Parse query string (?k=v) first, then fragment (#k=v) — fragment wins on collision
      const [base, fragment] = url.split('#');
      const queryStr = (base.split('?')[1] ?? '');
      parse(queryStr);
      if (fragment) parse(fragment);
      return params;
    };

    // Returns true if the URL was a password-reset deep link and was handled
    const handleResetUrl = async (url: string): Promise<boolean> => {
      if (!url.includes('reset-password')) return false;
      handlingDeepLinkRef.current = true;
      const params = parseDeepLinkParams(url);
      if (params.token_hash) {
        // New path: edge function relays one-time token_hash; verify client-side
        const { error } = await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: 'recovery' });
        setPendingRoute(error ? '/(onboarding)/signup?mode=signin' : '/(onboarding)/reset-password');
        handlingDeepLinkRef.current = false;
        return true;
      }
      if (params.access_token && params.refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
        setPendingRoute(error ? '/(onboarding)/signup?mode=signin' : '/(onboarding)/reset-password');
        handlingDeepLinkRef.current = false;
        return true;
      }
      handlingDeepLinkRef.current = false;
      return false;
    };

    const handleConfirmEmailUrl = async (url: string): Promise<boolean> => {
      if (!url.includes('confirm-email')) return false;
      handlingDeepLinkRef.current = true;
      const params = parseDeepLinkParams(url);
      const handleSuccess = async () => {
        const localOnboarded = await AsyncStorage.getItem(ONBOARDED_KEY);
        setPendingRoute(localOnboarded === 'true' ? '/(tabs)' : '/(onboarding)/q1');
      };
      if (params.token_hash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: 'signup' });
        if (error) { setPendingRoute('/(onboarding)/signup?mode=signin'); handlingDeepLinkRef.current = false; return true; }
        await handleSuccess();
        handlingDeepLinkRef.current = false;
        return true;
      }
      if (params.access_token && params.refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
        if (error) { setPendingRoute('/(onboarding)/signup?mode=signin'); handlingDeepLinkRef.current = false; return true; }
        await handleSuccess();
        handlingDeepLinkRef.current = false;
        return true;
      }
      handlingDeepLinkRef.current = false;
      return false;
    };

    const init = async () => {
      // Check for password-reset deep link first — must win over normal auth flow
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && await handleResetUrl(initialUrl)) {
        setAuthChecked(true);
        return;
      }
      // Email confirmation — handle fully here so init() doesn't race with it
      if (initialUrl && await handleConfirmEmailUrl(initialUrl)) {
        setAuthChecked(true);
        return;
      }

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
          setAuthChecked(true);
          return;
        }
        setPendingRoute('/(tabs)');
      } else {
        // AsyncStorage flag missing — check Supabase. A stub row is auto-created by the
        // handle_new_user trigger on auth.users INSERT, so we check quit_date (set only
        // at the end of the ready screen) to know if onboarding is actually complete.
        const { data: userData } = await supabase
          .from('users')
          .select('id, quit_date')
          .eq('id', sess.user.id)
          .maybeSingle();
        if (userData?.quit_date) {
          // Onboarding complete
          await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
          setPendingRoute('/(tabs)');
        } else if (userData) {
          // Stub row exists but onboarding not done (e.g. new OAuth user)
          setPendingRoute('/(onboarding)/q1');
        } else {
          // Ghost session: auth JWT still cached but user row was deleted
          await AsyncStorage.multiRemove([ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_STEP_KEY, ONBOARDING_DATA_KEY]);
          await supabase.auth.signOut();
          setAuthChecked(true);
          return;
        }
      }

      // Lock on cold start if biometric is enabled and user has an active session
      if (biometricFlag === 'true' && sess) setLocked(true);

      setAuthChecked(true);
    };

    init();

    // Handle deep links when the app is already foregrounded
    const urlSub = Linking.addEventListener('url', async ({ url }) => {
      if (await handleResetUrl(url)) return;
      if (await handleConfirmEmailUrl(url)) {
        if (!authCheckedRef.current) setAuthChecked(true);
        return;
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess);
      if (event === 'SIGNED_OUT' && !handlingDeepLinkRef.current && !authFlags.googleOAuthInProgress) {
        // Timer is set SYNCHRONOUSLY (no await before this line) so SIGNED_IN can always
        // cancel it. All async work (AsyncStorage reads, session check) is deferred inside
        // the callback so it only runs if the timer actually fires.
        if (signedOutTimerRef.current) clearTimeout(signedOutTimerRef.current);
        signedOutTimerRef.current = setTimeout(async () => {
          signedOutTimerRef.current = null;
          // If a session still exists AND this was not an intentional sign-out,
          // SIGNED_IN already ran — this was an OAuth token-refresh pair, bail out.
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (currentSession && !authFlags.signingOut) return;
          // Real sign-out: clean up and navigate to the right screen.
          authFlags.signingOut = false;
          await AsyncStorage.removeItem(ONBOARDED_KEY);
          const seen = (await AsyncStorage.getItem(SEEN_WELCOME_KEY)) === 'true';
          setSeenWelcome(seen);
          const signedOutRoute = seen ? '/(onboarding)/signup?mode=signin' : '/(onboarding)';
          setPendingRoute(signedOutRoute);
          setAuthChecked(true);
        }, 300);
      } else if (event === 'SIGNED_IN') {
        // During an intentional sign-out a concurrent token refresh may fire SIGNED_IN.
        // Ignore it entirely — the SIGNED_OUT timer will handle navigation to sign-in.
        if (authFlags.signingOut) return;
        // Cancel any pending SIGNED_OUT navigation — OAuth always pairs SIGNED_OUT with SIGNED_IN
        if (signedOutTimerRef.current) {
          clearTimeout(signedOutTimerRef.current);
          signedOutTimerRef.current = null;
        }
        if (authCheckedRef.current && sess) {
          // Handles deferred PKCE exchanges or magic links that resolve after init() has run.
          // For normal OAuth/signup flows, signup.tsx handles routing — only navigate here
          // for confirmed returning users to avoid double-navigation races.
          const onboarded = await AsyncStorage.getItem(ONBOARDED_KEY);
          if (onboarded === 'true') {
            setPendingRoute('/(tabs)');
          } else {
            const { data: userRow } = await supabase.from('users').select('id, quit_date').eq('id', sess.user.id).maybeSingle();
            if (userRow?.quit_date) {
              await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
              setPendingRoute('/(tabs)');
            }
            // New users (no quit_date): signup.tsx handles routing to q1 — don't navigate here
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      urlSub.remove();
      if (signedOutTimerRef.current) clearTimeout(signedOutTimerRef.current);
    };
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
      <OfflineBanner />
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

function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;
  return (
    <View style={offlineStyles.banner} pointerEvents="none">
      <Text style={offlineStyles.text}>No internet connection</Text>
    </View>
  );
}

const offlineStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#555',
    paddingVertical: 6,
    alignItems: 'center',
    zIndex: 9999,
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

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

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NetworkProvider>
        <AppThemeProvider>
          <UserProvider>
            <PurchasesProvider>
              <InnerLayout />
            </PurchasesProvider>
          </UserProvider>
        </AppThemeProvider>
      </NetworkProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
