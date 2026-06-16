import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
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
  { value: '20',   label: (s: string) => `${s}20` },
  { value: '50',   label: (s: string) => `${s}50` },
  { value: '100',  label: (s: string) => `${s}100` },
  { value: '200',  label: (s: string) => `${s}200` },
  { value: '500',  label: (s: string) => `${s}500` },
  { value: '1000', label: (s: string) => `${s}1000+` },
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

  useEffect(() => {
    if (!isLoaded) return;
    if (data.currency) setCurrency(data.currency);
    if (data.weeklyBet) setSelected(data.weeklyBet);
    if (data.quitDate) { setQuitDate(new Date(data.quitDate)); setUserChangedDate(true); }
  }, [isLoaded]);

  const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? '$';

  const hasValue = !!selected || !!custom.trim();

  const openDatePicker = () => {
    if (Platform.OS === 'ios') {
      setShowIOSPicker(true);
    } else {
      DateTimePickerAndroid.open({
        value: quitDate,
        mode: 'date',
        maximumDate: new Date(),
        onValueChange: (_evt, raw) => {
          if (!raw) return;
          const date = new Date(raw.getTime());
          if (isNaN(date.getTime())) return;
          setTimeout(() => {
            DateTimePickerAndroid.open({
              value: date,
              mode: 'time',
              is24Hour: true,
              onValueChange: (_tevt, rawTime) => {
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

  const handleContinue = () => {
    const value = custom.trim() ? custom.trim() : selected || null;
    setField('weeklyBet', value);
    setField('currency', currency);
    setField('quitDate', userChangedDate ? quitDate.toISOString() : null);
    saveStep('ready');
    router.push('/(onboarding)/ready');
  };

  const handleSkip = () => {
    setField('weeklyBet', null);
    setField('currency', currency);
    setField('quitDate', null);
    saveStep('ready');
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
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Let's set up your journey</Text>
        <Text style={s.sectionLabel}>When did you stop betting?</Text>
        <Pressable style={s.dateBtn} onPress={openDatePicker}>
          <Text style={s.dateBtnTxt}>
            {quitDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} @ {quitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={s.dateEditTxt}>Change</Text>
        </Pressable>

        <Text style={s.sectionLabel}>How much did you bet per week?</Text>
        <Text style={s.subtitle}>
          We'll use this to show how much you're saving as your streak grows.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.currencyScroll}
          contentContainerStyle={s.currencyRow}>
          {CURRENCIES.map(c => (
            <Pressable
              key={c.code}
              style={[s.currencyChip, currency === c.code && s.currencyChipSelected]}
              onPress={() => setCurrency(c.code)}>
              <Text style={[s.currencyText, currency === c.code && s.currencyTextSelected]}>
                {c.code}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.chips}>
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
          />
        </View>

        <Text style={s.privacy}>
          🔒 This is used only to calculate your savings. Only you can see it.
        </Text>
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

      <View style={s.footer}>
        <Pressable style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Skip for now</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.continueBtn,
            !hasValue && s.continueBtnDisabled,
            pressed && s.pressed,
          ]}
          onPress={handleContinue}
          disabled={!hasValue}>
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
    marginBottom: 20,
    lineHeight: 32,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textSecondary,
    marginBottom: 10,
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
    borderColor: c.bgTealMid,
    backgroundColor: c.bgElement,
  },
  currencyChipSelected: {
    borderColor: c.primary,
    backgroundColor: c.bgTeal,
  },
  currencyText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textBody,
  },
  currencyTextSelected: {
    color: c.primary,
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
    borderColor: c.bgTealMid,
    backgroundColor: c.bgElement,
    alignItems: 'center',
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
    paddingVertical: 12,
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
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
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
