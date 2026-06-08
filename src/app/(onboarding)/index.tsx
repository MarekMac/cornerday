import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SEEN_WELCOME_KEY } from '@/constants/storage-keys';
import Logo from '@/components/Logo';

export default function WelcomeScreen() {
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.setItem(SEEN_WELCOME_KEY, 'true');
  }, []);

  return (
    <LinearGradient colors={['#0F6E6E', '#1a9a9a', '#a8d8d0']} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <Logo size={100} />
          <Text style={styles.appName}>CornerDay</Text>
          <Text style={styles.tagline}>Turn the corner.{'\n'}Build a better tomorrow.</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => router.push('/(onboarding)/signup')}>
            <Text style={styles.primaryBtnText}>Get started</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
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
    color: '#fff',
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
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F6E6E',
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
