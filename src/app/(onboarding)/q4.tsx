import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';
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
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const { data, isLoaded, setField, saveStep } = useOnboarding();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (isLoaded && data.goal) {
      setSelected(data.goal.split(',').filter(Boolean));
    }
  }, [isLoaded, data.goal]);

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
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/q3')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <View style={s.progressWrapper}>
          <ProgressBar current={4} total={5} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={s.title}>What is your main goal?</Text>
        <Text style={s.subtitle}>Choose as many as apply to you.</Text>

        <View style={s.options}>
          {OPTIONS.map(opt => {
            const isSelected = selected.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                onPress={() => toggle(opt.value)}
                style={({ pressed }) => [
                  s.card,
                  isSelected && s.cardSelected,
                  pressed && s.cardPressed,
                ]}>
                <Text style={s.emoji}>{opt.emoji}</Text>
                <Text style={[s.label, isSelected && s.labelSelected]}>
                  {opt.label}
                </Text>
                <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                  {isSelected && <Text style={s.checkmark}>✓</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Skip for now</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.continueBtn,
            selected.length === 0 && s.continueBtnDisabled,
            pressed && s.pressed,
          ]}
          onPress={handleContinue}
          disabled={selected.length === 0}>
          <Text style={s.continueBtnText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bgCard },
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
    color: c.textPrimary,
    marginBottom: 8,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: c.textMuted,
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
    borderColor: c.bgTealMid,
    backgroundColor: c.bgElement,
  },
  cardSelected: {
    borderColor: c.primary,
    backgroundColor: c.bgTeal,
  },
  cardPressed: { opacity: 0.8 },
  emoji: { fontSize: 22 },
  label: {
    flex: 1,
    fontSize: 15,
    color: c.textSecondary,
    fontWeight: '500',
  },
  labelSelected: {
    color: c.primary,
    fontWeight: '600',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: c.borderMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  checkmark: {
    fontSize: 13,
    color: c.white,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
    gap: 8,
  },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: c.textMuted },
  continueBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: { backgroundColor: c.primaryLight },
  continueBtnText: { color: c.white, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
