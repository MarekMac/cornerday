import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';
import { useOnboarding } from '@/context/onboarding';

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
];

const CHIP_AMOUNTS = [
  { value: '20',  label: (s: string) => `${s}20` },
  { value: '50',  label: (s: string) => `${s}50` },
  { value: '100', label: (s: string) => `${s}100` },
  { value: '200', label: (s: string) => `${s}200` },
];

export default function Q3Screen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const { data, isLoaded, setField, saveStep } = useOnboarding();
  const [currency, setCurrency] = useState('USD');
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const [quitDate, setQuitDate] = useState(new Date());
  const [userChangedDate, setUserChangedDate] = useState(false);
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (data.currency) setCurrency(data.currency);
    if (data.weeklyBet) setSelected(data.weeklyBet);
    if (data.quitDate) { setQuitDate(new Date(data.quitDate)); setUserChangedDate(true); }
  }, [isLoaded, data.currency, data.weeklyBet, data.quitDate]);

  const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? '$';

  const hasValue = !!selected || !!custom.trim();

  const annualSaving = useMemo(() => {
    const raw = custom.trim() || selected;
    const weekly = parseFloat(raw);
    if (!raw || !Number.isFinite(weekly) || weekly <= 0) return null;
    return Math.round(weekly * 52);
  }, [selected, custom]);

  const openDatePicker = () => {
    if (Platform.OS === 'ios') {
      setShowIOSPicker(true);
    } else {
      DateTimePickerAndroid.open({
        value: quitDate,
        mode: 'date',
        maximumDate: new Date(),
        onChange: (_evt, raw) => {
          if (!raw) return;
          const date = new Date(raw.getTime());
          if (isNaN(date.getTime())) return;
          setTimeout(() => {
            DateTimePickerAndroid.open({
              value: date,
              mode: 'time',
              is24Hour: true,
              onChange: (_tevt, rawTime) => {
                if (!rawTime) return;
                const time = new Date(rawTime.getTime());
                if (isNaN(time.getTime())) return;
                const merged = new Date(date.getTime());
                merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
                if (!isNaN(merged.getTime())) { setQuitDate(merged); setUserChangedDate(true); }
              },
            });
          }, 500);
        },
      });
    }
  };

  const handleContinue = async () => {
    const rawCustom = custom.trim();
    // weekly_bet is a numeric column, and Home/Tracker do arithmetic on it —
    // this used to store the raw typed string, so a malformed value (a
    // pasted negative sign, a locale comma like "50,00", trailing junk like
    // "50kk") could pass a bare Number.isFinite(parseFloat(...)) check
    // (parseFloat parses the numeric prefix and ignores the rest) and either
    // break the save entirely or silently produce a negative "money saved"
    // figure later.
    let value: string | null = selected || null;
    if (rawCustom) {
      const parsed = parseFloat(rawCustom);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999_999_999 || String(parsed) !== String(Number(rawCustom))) {
        Alert.alert('Invalid amount', 'Please enter a valid amount between 0 and 999,999,999.');
        return;
      }
      value = String(parsed);
    }
    setField('weeklyBet', value);
    setField('currency', currency);
    setField('quitDate', userChangedDate ? quitDate.toISOString() : null);
    await saveStep('ready');
    router.push('/(onboarding)/ready');
  };

  const handleSkip = async () => {
    setField('weeklyBet', null);
    setField('currency', currency);
    setField('quitDate', null);
    await saveStep('ready');
    router.push('/(onboarding)/ready');
  };

  const handleChipPress = (value: string) => {
    setSelected(prev => prev === value ? '' : value);
    setCustom('');
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/q2')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <View style={s.progressWrapper}>
          <ProgressBar current={3} total={3} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scrollView}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Let&apos;s set up your journey</Text>
        <Text style={[s.sectionLabel, { marginBottom: 10 }]}>When did you stop betting?</Text>
        <Pressable style={s.dateBtn} onPress={openDatePicker}>
          <Text style={s.dateBtnTxt}>
            {quitDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} @ {quitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={s.dateEditTxt}>Change</Text>
        </Pressable>

        <Text style={[s.sectionLabel, { marginBottom: 10 }]}>How much did you bet per week?</Text>
        <Text style={s.subtitle}>
          We&apos;ll use this to show how much you&apos;re saving as your streak grows.
        </Text>

        <View style={s.chips}>
          <Pressable
            style={[s.chip, s.chipSelected]}
            onPress={() => setShowCurrencyPicker(true)}>
            <Text style={[s.chipText, s.chipTextSelected]}>{currency}</Text>
            <Ionicons name="chevron-down" size={10} color={c.primary} />
          </Pressable>
          {CHIP_AMOUNTS.map(chip => (
            <Pressable
              key={chip.value}
              style={({ pressed }) => [
                s.chip,
                selected === chip.value && s.chipSelected,
                pressed && s.chipPressed,
              ]}
              onPress={() => handleChipPress(chip.value)}>
              <Text style={[
                s.chipText,
                selected === chip.value && s.chipTextSelected,
              ]}>
                {chip.label(symbol)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.customLabel}>Or enter your exact weekly amount:</Text>
        <View style={s.customInputRow}>
          <Text style={s.dollarSign}>{symbol}</Text>
          <TextInput
            style={s.customInput}
            value={custom}
            onChangeText={text => {
              setCustom(text);
              if (text.trim()) setSelected('');
            }}
            placeholder="0"
            placeholderTextColor={c.textFaint}
            keyboardType="numeric"
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
          />
        </View>

        <View style={s.savingsCard}>
          <Ionicons name="trending-up-outline" size={28} color={c.primary} />
          <View style={s.savingsTextCol}>
            <Text style={s.savingsHeadline}>
              {symbol}{(annualSaving ?? 0).toLocaleString()} saved per year
            </Text>
            <Text style={s.savingsSubtitle}>if you stay on track — that&apos;s real money back</Text>
          </View>
        </View>

        <Text style={s.privacy}>🔒 Only you can see it.</Text>
      </ScrollView>

      {Platform.OS === 'ios' && (
        <Modal visible={showIOSPicker} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <DateTimePicker
                value={quitDate}
                mode="datetime"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_evt, d) => d && (setQuitDate(new Date(d.getTime())), setUserChangedDate(true))}
                style={{ height: 200 }}
              />
              <Pressable style={s.modalDone} onPress={() => setShowIOSPicker(false)}>
                <Text style={s.modalDoneTxt}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={showCurrencyPicker} transparent animationType="fade">
        <Pressable style={s.currencyModalOverlay} onPress={() => setShowCurrencyPicker(false)}>
          <View style={s.currencyModalCard}>
            <Text style={s.currencyPickerTitle}>Select currency</Text>
            {CURRENCIES.map(cur => (
              <Pressable
                key={cur.code}
                style={[s.currencyOption, currency === cur.code && s.currencyOptionSelected]}
                onPress={() => { setCurrency(cur.code); setShowCurrencyPicker(false); }}>
                <Text style={[s.currencyOptionText, currency === cur.code && s.currencyOptionTextSelected]}>
                  {cur.symbol} — {cur.code}
                </Text>
                {currency === cur.code && <Ionicons name="checkmark" size={18} color={c.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [
            s.continueBtn,
            // Weekly-bet is optional/skippable by design, but a deliberately
            // picked quit date must also unlock Continue on its own —
            // otherwise the only way forward for someone who set a date but
            // left the bet field blank was "Skip for now", which discards
            // the date they just carefully picked.
            !hasValue && !userChangedDate && s.continueBtnDisabled,
            pressed && s.pressed,
          ]}
          onPress={handleContinue}
          disabled={!hasValue && !userChangedDate}>
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
  safe: { flex: 1, backgroundColor: c.bgCard },
  scrollView: { flex: 1 },
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
    marginBottom: 20,
    lineHeight: 32,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textSecondary,
  },
  dateBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: c.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: c.bgTeal,
    marginBottom: 28,
  },
  dateBtnTxt: { fontSize: 15, fontWeight: '600', color: c.primary },
  dateEditTxt: { fontSize: 13, color: c.primary },
  subtitle: {
    fontSize: 14,
    color: c.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.overlay },
  modalSheet: { backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalDone: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  modalDoneTxt: { color: c.white, fontWeight: '700', fontSize: 15 },
  currencyModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.overlay,
    paddingHorizontal: 32,
  },
  currencyModalCard: {
    width: '100%',
    backgroundColor: c.bgCard,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  currencyPickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textPrimary,
    marginBottom: 12,
  },
  currencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  currencyOptionSelected: {
    backgroundColor: c.bgTeal,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  currencyOptionText: {
    fontSize: 15,
    color: c.textBody,
    fontWeight: '500',
  },
  currencyOptionTextSelected: {
    color: c.primary,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 28,
  },
  chip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.bgTealMid,
    backgroundColor: c.bgElement,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  chipSelected: {
    borderColor: c.primary,
    backgroundColor: c.bgTeal,
  },
  chipPressed: { opacity: 0.8 },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textBody,
  },
  chipTextSelected: {
    color: c.primary,
  },
  customLabel: {
    fontSize: 13,
    color: c.textBody,
    marginBottom: 10,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: c.borderMid,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 40,
    backgroundColor: c.bgInput,
    marginBottom: 20,
  },
  dollarSign: {
    fontSize: 16,
    color: c.textBody,
    marginRight: 6,
  },
  customInput: {
    flex: 1,
    fontSize: 15,
    color: c.textPrimary,
    height: 40,
    paddingVertical: 0,
  },
  savingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.bgTeal,
    borderWidth: 1.5,
    borderColor: c.bgTealMid,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  savingsTextCol: { flex: 1 },
  savingsHeadline: {
    fontSize: 15,
    fontWeight: '700',
    color: c.primary,
    marginBottom: 2,
  },
  savingsSubtitle: {
    fontSize: 12,
    color: c.textMuted,
    lineHeight: 17,
  },
  privacy: {
    fontSize: 12,
    color: c.textMuted,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 8,
  },
  continueBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: { backgroundColor: c.primaryLight },
  continueBtnText: { color: c.white, fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: c.textMuted },
  pressed: { opacity: 0.8 },
});
