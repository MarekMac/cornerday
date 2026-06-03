import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

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
import { useColorScheme } from 'react-native';
import { Session } from '@supabase/supabase-js';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ONBOARDED_KEY, ONBOARDING_STEP_KEY, SEEN_WELCOME_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { UserProvider } from '@/context/user';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  // Run auth check once on mount — result stored, not navigated yet
  useEffect(() => {
    const init = async () => {
      const [{ data: { session } }, onboarded, savedStep, seenWelcome] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(ONBOARDED_KEY),
        AsyncStorage.getItem(ONBOARDING_STEP_KEY),
        AsyncStorage.getItem(SEEN_WELCOME_KEY),
      ]);

      setSession(session);

      if (!session) {
        setPendingRoute(seenWelcome === 'true' ? '/(onboarding)/signup?mode=signin' : '/(onboarding)');
      } else if (onboarded === 'true') {
        setPendingRoute('/(tabs)');
      } else {
        setPendingRoute(`/(onboarding)/${savedStep ?? 'q1'}`);
      }

      setAuthChecked(true);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_OUT') {
        AsyncStorage.removeItem(ONBOARDED_KEY);
        router.replace('/(onboarding)');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Navigate only once both auth is resolved AND navigation container is ready
  useEffect(() => {
    if (!authChecked || !navigationState?.key || !pendingRoute) return;
    router.replace(pendingRoute as any);
    setPendingRoute(null);
  }, [authChecked, navigationState?.key, pendingRoute]);

  return (
    <UserProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Slot />
      </ThemeProvider>
    </UserProvider>
  );
}
