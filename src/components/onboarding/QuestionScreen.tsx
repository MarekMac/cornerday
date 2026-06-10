import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';
import { OptionCard } from './OptionCard';
import { ProgressBar } from './ProgressBar';

export interface Option {
  value: string;
  label: string;
  emoji: string;
}

interface Props {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
  onContinue: () => void;
  skippable?: boolean;
  onSkip?: () => void;
}

export function QuestionScreen({
  step,
  total,
  title,
  subtitle,
  options,
  selected,
  onSelect,
  onContinue,
  skippable,
  onSkip,
}: Props) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/signup')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <View style={s.progressWrapper}>
          <ProgressBar current={step} total={total} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}

        <View style={s.options}>
          {options.map(opt => (
            <OptionCard
              key={opt.value}
              emoji={opt.emoji}
              label={opt.label}
              selected={selected === opt.value}
              onPress={() => onSelect(opt.value)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        {skippable && (
          <Pressable style={s.skipBtn} onPress={onSkip}>
            <Text style={s.skipText}>Skip for now</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            s.continueBtn,
            !selected && s.continueBtnDisabled,
            pressed && s.pressed,
          ]}
          onPress={onContinue}
          disabled={!selected}>
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
  backBtn: {
    padding: 4,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrapper: {
    flex: 1,
  },
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
  options: {
    marginTop: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  continueBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: c.primaryLight,
  },
  continueBtnText: {
    color: c.white,
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
    color: c.textMuted,
  },
  pressed: { opacity: 0.8 },
});
