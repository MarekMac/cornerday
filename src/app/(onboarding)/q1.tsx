import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionCard } from '@/components/onboarding/OptionCard';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';
import { useOnboarding } from '@/context/onboarding';
import { authFlags } from '@/lib/auth-flags';

const OPTIONS = [
  { value: 'family',        label: 'My family',              icon: 'people-outline'       as const },
  { value: 'finances',      label: 'My finances',            icon: 'wallet-outline'       as const },
  { value: 'mental_health', label: 'My mental health',       icon: 'heart-outline'        as const },
  { value: 'saving',        label: 'Saving for something',   icon: 'trending-up-outline'  as const },
  { value: 'better_self',   label: 'Becoming a better me',   icon: 'star-outline'         as const },
  { value: 'break_free',    label: 'Breaking free for good', icon: 'lock-open-outline'    as const },
];

export default function Q1Screen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const { data, isLoaded, setField, saveStep } = useOnboarding();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    authFlags.googleOAuthInProgress = false;
  }, []);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(onboarding)');
      return true;
    });
    return () => sub.remove();
  }, [router]));

  useEffect(() => {
    if (isLoaded && data.motivation) {
      setSelected(data.motivation.split(',').filter(Boolean));
    }
  }, [isLoaded, data.motivation]);

  const toggle = (value: string) => {
    setSelected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const handleContinue = async () => {
    setField('motivation', selected.join(','));
    await saveStep('q2');
    router.push('/(onboarding)/q2');
  };

  const handleSkip = async () => {
    setField('motivation', '');
    await saveStep('q2');
    router.push('/(onboarding)/q2');
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.replace('/(onboarding)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <View style={s.progressWrapper}>
          <ProgressBar current={1} total={3} />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>What motivates you to quit?</Text>
        <Text style={s.subtitle}>You can choose more than one — pick everything that resonates with you.</Text>

        <View style={s.options}>
          {OPTIONS.map(opt => (
            <OptionCard
              key={opt.value}
              emoji={<Ionicons name={opt.icon} size={24} color={c.primary} />}
              label={opt.label}
              selected={selected.includes(opt.value)}
              onPress={() => toggle(opt.value)}
              compact
            />
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [s.continueBtn, selected.length === 0 && s.continueBtnDisabled, pressed && s.pressed]}
          onPress={handleContinue}
          disabled={selected.length === 0}>
          <Text style={s.continueBtnText}>Continue</Text>
        </Pressable>
        <Pressable style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgCard },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backBtn: { padding: 4, flexShrink: 0 },
  progressWrapper: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: c.textPrimary, marginBottom: 8, lineHeight: 32 },
  subtitle: { fontSize: 14, color: c.textMuted, marginBottom: 24 },
  options: { marginTop: 16, gap: 10 },

  footer: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, gap: 8 },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: c.textMuted },
  continueBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  continueBtnDisabled: { backgroundColor: c.primaryLight },
  continueBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
