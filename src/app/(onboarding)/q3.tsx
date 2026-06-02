import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { useOnboarding } from '@/context/onboarding';

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
];

const CHIP_RANGES = [
  { value: 'under_20', label: (s: string) => `Under ${s}20` },
  { value: '20_50', label: (s: string) => `${s}20–${s}50` },
  { value: '50_100', label: (s: string) => `${s}50–${s}100` },
  { value: '100_200', label: (s: string) => `${s}100–${s}200` },
  { value: '200_500', label: (s: string) => `${s}200–${s}500` },
  { value: '500_plus', label: (s: string) => `${s}500+` },
];

export default function Q3Screen() {
  const router = useRouter();
  const { setField } = useOnboarding();
  const [currency, setCurrency] = useState('USD');
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');

  const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? '$';

  const hasValue = !!selected || !!custom.trim();

  const handleContinue = () => {
    const value = custom.trim() ? custom.trim() : selected || null;
    setField('weeklyBet', value);
    setField('currency', currency);
    router.push('/(onboarding)/q4');
  };

  const handleSkip = () => {
    setField('weeklyBet', null);
    setField('currency', currency);
    router.push('/(onboarding)/q4');
  };

  const handleChipPress = (value: string) => {
    setSelected(prev => prev === value ? '' : value);
    setCustom('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.progressWrapper}>
          <ProgressBar current={3} total={5} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>How much do you bet per week?</Text>
        <Text style={styles.subtitle}>
          We'll use this to show how much you're saving as your streak grows.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.currencyScroll}
          contentContainerStyle={styles.currencyRow}>
          {CURRENCIES.map(c => (
            <Pressable
              key={c.code}
              style={[styles.currencyChip, currency === c.code && styles.currencyChipSelected]}
              onPress={() => setCurrency(c.code)}>
              <Text style={[styles.currencyText, currency === c.code && styles.currencyTextSelected]}>
                {c.code}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.chips}>
          {CHIP_RANGES.map(chip => (
            <Pressable
              key={chip.value}
              style={({ pressed }) => [
                styles.chip,
                selected === chip.value && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
              onPress={() => handleChipPress(chip.value)}>
              <Text style={[
                styles.chipText,
                selected === chip.value && styles.chipTextSelected,
              ]}>
                {chip.label(symbol)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.customLabel}>Or enter your exact weekly amount:</Text>
        <View style={styles.customInputRow}>
          <Text style={styles.dollarSign}>{symbol}</Text>
          <TextInput
            style={styles.customInput}
            value={custom}
            onChangeText={text => {
              setCustom(text);
              if (text.trim()) setSelected('');
            }}
            placeholder="0"
            placeholderTextColor="#bbb"
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.privacy}>
          🔒 This is used only to calculate your savings. Only you can see it.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.continueBtn,
            !hasValue && styles.continueBtnDisabled,
            pressed && styles.pressed,
          ]}
          onPress={handleContinue}
          disabled={!hasValue}>
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
  backBtn: { flexShrink: 0, paddingRight: 4 },
  backText: { fontSize: 15, color: '#0F6E6E', fontWeight: '500' },
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
    marginBottom: 28,
    lineHeight: 20,
  },
  currencyScroll: {
    marginBottom: 20,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  currencyChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#d0e8e8',
    backgroundColor: '#f8fdfd',
  },
  currencyChipSelected: {
    borderColor: '#0F6E6E',
    backgroundColor: '#e6f7f7',
  },
  currencyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  currencyTextSelected: {
    color: '#0F6E6E',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  chip: {
    width: '30.5%',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d0e8e8',
    backgroundColor: '#f8fdfd',
    alignItems: 'center',
  },
  chipSelected: {
    borderColor: '#0F6E6E',
    backgroundColor: '#e6f7f7',
  },
  chipPressed: { opacity: 0.8 },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  chipTextSelected: {
    color: '#0F6E6E',
  },
  customLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
    marginBottom: 20,
  },
  dollarSign: {
    fontSize: 16,
    color: '#555',
    marginRight: 6,
  },
  customInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
  privacy: {
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
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
  continueBtnDisabled: { backgroundColor: '#b0d4d4' },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: '#888' },
  pressed: { opacity: 0.8 },
});
