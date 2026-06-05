import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
    saveStep('q4');
    router.push('/(onboarding)/q4');
  };

  const handleSkip = () => {
    setField('weeklyBet', null);
    setField('currency', currency);
    setField('quitDate', null);
    saveStep('q4');
    router.push('/(onboarding)/q4');
  };

  const handleChipPress = (value: string) => {
    setSelected(prev => prev === value ? '' : value);
    setCustom('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/q2')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F6E6E" />
        </Pressable>
        <View style={styles.progressWrapper}>
          <ProgressBar current={3} total={5} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Let's set up your journey</Text>
        <Text style={styles.sectionLabel}>When did you stop betting?</Text>
        <Pressable style={styles.dateBtn} onPress={openDatePicker}>
          <Text style={styles.dateBtnTxt}>
            {quitDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} @ {quitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.dateEditTxt}>Change</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>How much did you bet per week?</Text>
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
          {CHIP_AMOUNTS.map(chip => (
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

      {Platform.OS === 'ios' && (
        <Modal visible={showIOSPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <DateTimePicker
                value={quitDate}
                mode="datetime"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_evt, d) => d && (setQuitDate(new Date(d.getTime())), setUserChangedDate(true))}
                style={{ height: 200 }}
              />
              <Pressable style={styles.modalDone} onPress={() => setShowIOSPicker(false)}>
                <Text style={styles.modalDoneTxt}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

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
    marginBottom: 20,
    lineHeight: 32,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  dateBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0F6E6E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#e6f7f7',
    marginBottom: 28,
  },
  dateBtnTxt: { fontSize: 15, fontWeight: '600', color: '#0F6E6E' },
  dateEditTxt: { fontSize: 13, color: '#0F6E6E' },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalDone: { backgroundColor: '#0F6E6E', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  modalDoneTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
