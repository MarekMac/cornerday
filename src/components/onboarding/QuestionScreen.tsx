import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

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
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/signup')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F6E6E" />
        </Pressable>
        <View style={styles.progressWrapper}>
          <ProgressBar current={step} total={total} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        <View style={styles.options}>
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

      <View style={styles.footer}>
        {skippable && (
          <Pressable style={styles.skipBtn} onPress={onSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.continueBtn,
            !selected && styles.continueBtnDisabled,
            pressed && styles.pressed,
          ]}
          onPress={onContinue}
          disabled={!selected}>
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
    color: '#111',
    marginBottom: 8,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
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
    borderTopColor: '#f0f0f0',
  },
  continueBtn: {
    backgroundColor: '#0F6E6E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: '#b0d4d4',
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
    color: '#888',
  },
  pressed: { opacity: 0.8 },
});
