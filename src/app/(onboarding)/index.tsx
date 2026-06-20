import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SEEN_WELCOME_KEY } from '@/constants/storage-keys';
import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';
import Logo from '@/components/Logo';

export default function WelcomeScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.setItem(SEEN_WELCOME_KEY, 'true');
  }, []);

  return (
    <View style={s.gradient}>
      <SafeAreaView style={s.safe}>
        <View style={s.hero}>
          <Logo size={100} />
          <Text style={s.appName}>CornerDay</Text>
          <Text style={s.tagline}>Turn the corner.{'\n'}Build a better tomorrow.</Text>
        </View>

        <View style={s.actions}>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
            onPress={() => router.push('/(onboarding)/signup')}>
            <Text style={s.primaryBtnText}>Get started</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
            onPress={() => router.push({ pathname: '/(onboarding)/signup', params: { mode: 'signin' } })}>
            <Text style={s.secondaryBtnText}>I already have an account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: c.primary,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 28,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: c.white,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 26,
    marginTop: 4,
  },
  actions: {
    paddingBottom: 32,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: c.white,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: c.primary,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.75,
  },
});
