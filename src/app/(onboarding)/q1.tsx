import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionCard } from '@/components/onboarding/OptionCard';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { useOnboarding } from '@/context/onboarding';

const OPTIONS = [
  { value: 'family',        label: 'My family',            emoji: '👨‍👩‍👧' },
  { value: 'finances',      label: 'My finances',          emoji: '💰' },
  { value: 'mental_health', label: 'My mental health',     emoji: '🧠' },
  { value: 'saving',        label: 'Saving for something', emoji: '🎯' },
  { value: 'better_self',   label: 'Becoming a better me', emoji: '✨' },
  { value: 'break_free',    label: 'Breaking free for good', emoji: '🔓' },
];

export default function Q1Screen() {
  const router = useRouter();
  const { data, isLoaded, setField, saveStep } = useOnboarding();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (isLoaded && data.motivation) {
      setSelected(data.motivation.split(',').filter(Boolean));
    }
  }, [isLoaded]);

  const toggle = (value: string) => {
    setSelected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const handleContinue = () => {
    setField('motivation', selected.join(','));
    saveStep('q2');
    router.push('/(onboarding)/q2');
  };

  const handleSkip = () => {
    setField('motivation', '');
    saveStep('q2');
    router.push('/(onboarding)/q2');
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/signup')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F6E6E" />
        </Pressable>
        <View style={s.progressWrapper}>
          <ProgressBar current={1} total={5} />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>What motivates you to quit?</Text>
        <Text style={s.subtitle}>Choose all that apply — these will be your anchors throughout the app.</Text>
        <View style={s.options}>
          {OPTIONS.map(opt => (
            <OptionCard
              key={opt.value}
              emoji={opt.emoji}
              label={opt.label}
              selected={selected.includes(opt.value)}
              onPress={() => toggle(opt.value)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Skip for now</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.continueBtn, selected.length === 0 && s.continueBtnDisabled, pressed && s.pressed]}
          onPress={handleContinue}
          disabled={selected.length === 0}>
          <Text style={s.continueBtnText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backBtn: { padding: 4, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  progressWrapper: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 8, lineHeight: 32 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  options: { marginTop: 16 },
  footer: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0', gap: 8 },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: '#888' },
  continueBtn: { backgroundColor: '#0F6E6E', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  continueBtnDisabled: { backgroundColor: '#b0d4d4' },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
