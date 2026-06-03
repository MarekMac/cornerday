import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Slot, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Session } from '@supabase/supabase-js';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ONBOARDED_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { UserProvider } from '@/context/user';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const init = async () => {
      const [{ data: { session } }, onboarded] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(ONBOARDED_KEY),
      ]);

      setSession(session);

      if (!session) {
        router.replace('/(onboarding)');
      } else if (onboarded === 'true') {
        router.replace('/(tabs)');
      } else {
        router.replace('/(onboarding)/signup');
      }
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

  return (
    <UserProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Slot />
      </ThemeProvider>
    </UserProvider>
  );
}
