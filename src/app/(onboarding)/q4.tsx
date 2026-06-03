import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { useOnboarding } from '@/context/onboarding';

const OPTIONS = [
  { value: 'break_free', label: 'Break free from gambling for good', emoji: '🔓' },
  { value: 'pay_back', label: 'Pay back what I lost', emoji: '💳' },
  { value: 'save', label: 'Save for something important', emoji: '🏠' },
  { value: 'mental_health', label: 'Feel better mentally', emoji: '🌱' },
  { value: 'family', label: 'Be there for my family', emoji: '❤️' },
  { value: 'one_day', label: 'One day at a time', emoji: '🌅' },
];

export default function Q4Screen() {
  const router = useRouter();
  const { data, isLoaded, setField, saveStep } = useOnboarding();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (isLoaded && data.goal) {
      setSelected(data.goal.split(',').filter(Boolean));
    }
  }, [isLoaded]);

  const toggle = (value: string) => {
    setSelected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const handleContinue = () => {
    setField('goal', selected.join(','));
    saveStep('q5');
    router.push('/(onboarding)/q5');
  };

  const handleSkip = () => {
    setField('goal', '');
    saveStep('q5');
    router.push('/(onboarding)/q5');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/q3')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F6E6E" />
        </Pressable>
        <View style={styles.progressWrapper}>
          <ProgressBar current={4} total={5} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>What is your main goal?</Text>
        <Text style={styles.subtitle}>Choose as many as apply to you.</Text>

        <View style={styles.options}>
          {OPTIONS.map(opt => {
            const isSelected = selected.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                onPress={() => toggle(opt.value)}
                style={({ pressed }) => [
                  styles.card,
                  isSelected && styles.cardSelected,
                  pressed && styles.cardPressed,
                ]}>
                <Text style={styles.emoji}>{opt.emoji}</Text>
                <Text style={[styles.label, isSelected && styles.labelSelected]}>
                  {opt.label}
                </Text>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.continueBtn,
            selected.length === 0 && styles.continueBtnDisabled,
            pressed && styles.pressed,
          ]}
          onPress={handleContinue}
          disabled={selected.length === 0}>
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { flexShrink: 0, padding: 4, alignItems: 'center', justifyContent: 'center' },
  progressWrapper: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  options: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d0e8e8',
    backgroundColor: '#f8fdfd',
  },
  cardSelected: {
    borderColor: '#0F6E6E',
    backgroundColor: '#e6f7f7',
  },
  cardPressed: { opacity: 0.8 },
  emoji: { fontSize: 22 },
  label: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  labelSelected: {
    color: '#0F6E6E',
    fontWeight: '600',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#0F6E6E',
    borderColor: '#0F6E6E',
  },
  checkmark: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8,
  },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: '#888' },
  continueBtn: {
    backgroundColor: '#0F6E6E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: { backgroundColor: '#b0d4d4' },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
