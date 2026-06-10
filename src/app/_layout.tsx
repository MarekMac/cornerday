import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';

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

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Slot, useRouter, useRootNavigationState } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Session } from '@supabase/supabase-js';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ONBOARDED_KEY, ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY, SEEN_WELCOME_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { UserProvider } from '@/context/user';
import { PurchasesProvider } from '@/context/purchases';
import { AppThemeProvider, useAppTheme } from '@/context/theme';
import { Paywall } from '@/components/Paywall';

function InnerLayout() {
  const { colorScheme } = useAppTheme();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [seenWelcome, setSeenWelcome] = useState<boolean>(false);

  useEffect(() => {
    const init = async () => {
      const [sessionResult, onboarded, savedStep, seenWelcomeVal] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(ONBOARDED_KEY),
        AsyncStorage.getItem(ONBOARDING_STEP_KEY),
        AsyncStorage.getItem(SEEN_WELCOME_KEY),
      ]);

      const sess = sessionResult.data.session;
      const seen = seenWelcomeVal === 'true';
      setSession(sess);
      setSeenWelcome(seen);

      if (!sess) {
        setPendingRoute(seen ? '/(onboarding)/signup?mode=signin' : '/(onboarding)');
      } else if (onboarded === 'true') {
        setPendingRoute('/(tabs)');
      } else {
        // AsyncStorage flag missing (e.g. dev reload cleared storage) — check Supabase
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('motivation')
          .eq('id', sess.user.id)
          .single();
        if (userData?.motivation) {
          await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
          setPendingRoute('/(tabs)');
        } else if (userError?.code === 'PGRST116') {
          // Ghost session: auth JWT still cached but user row was deleted
          await AsyncStorage.multiRemove([ONBOARDED_KEY, SEEN_WELCOME_KEY, ONBOARDING_STEP_KEY, ONBOARDING_DATA_KEY]);
          await supabase.auth.signOut();
          return;
        } else {
          setPendingRoute(`/(onboarding)/${savedStep ?? 'q1'}`);
        }
      }

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
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) router.push(screen as any);
    });
    return () => sub.remove();
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
    </ThemeProvider>
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
