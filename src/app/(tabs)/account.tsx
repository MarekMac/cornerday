import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

import { ONBOARDED_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user';

interface Profile {
  displayName: string | null;
  email: string | null;
  quitTimestamp: string | null;
  motivation: string | null;
  trigger: string | null;
  goal: string | null;
  supportType: string | null;
  weeklyBet: string | null;
  currency: string;
  isPremium: boolean;
  avatarUrl: string | null;
}

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

type FieldKey = 'motivation' | 'trigger' | 'goal' | 'support';

const MOTIVATION_OPTIONS = [
  { value: 'family', label: 'My family', emoji: '👨‍👩‍👧' },
  { value: 'finances', label: 'My finances', emoji: '💰' },
  { value: 'mental_health', label: 'My mental health', emoji: '🧠' },
  { value: 'saving', label: 'Saving for something', emoji: '🎯' },
  { value: 'better_self', label: 'Becoming a better me', emoji: '✨' },
  { value: 'break_free', label: 'Breaking free for good', emoji: '🔓' },
];

const TRIGGER_OPTIONS = [
  { value: 'financial_pressure', label: 'Financial pressure', emoji: '💸' },
  { value: 'betting_ads', label: 'Betting ads', emoji: '📱' },
  { value: 'social_pressure', label: 'Friends or social pressure', emoji: '👥' },
  { value: 'live_sport', label: 'Watching live sport', emoji: '⚽' },
  { value: 'stress', label: 'Stress', emoji: '😰' },
  { value: 'boredom', label: 'Boredom', emoji: '😶' },
];

const GOAL_OPTIONS = [
  { value: 'break_free', label: 'Break free from gambling', emoji: '🔓' },
  { value: 'pay_back', label: 'Pay back what I lost', emoji: '💳' },
  { value: 'save', label: 'Save for something important', emoji: '🏠' },
  { value: 'mental_health', label: 'Feel better mentally', emoji: '🌱' },
  { value: 'family', label: 'Be there for my family', emoji: '❤️' },
  { value: 'one_day', label: 'One day at a time', emoji: '🌅' },
];

const SUPPORT_OPTIONS = [
  { value: 'private', label: 'Keep this private', emoji: '🔒' },
  { value: 'partner', label: 'My partner', emoji: '💑' },
  { value: 'family', label: 'A family member', emoji: '👨‍👩‍👧' },
  { value: 'friend', label: 'A friend', emoji: '👋' },
  { value: 'therapist', label: 'A therapist', emoji: '🏥' },
];

const FIELD_CONFIG: Record<FieldKey, {
  title: string;
  options: { value: string; label: string; emoji: string }[];
  multi: boolean;
  dbField: string;
  label: string;
}> = {
  motivation: { title: 'What motivates you to quit?', options: MOTIVATION_OPTIONS, multi: true, dbField: 'motivation', label: 'Why you quit' },
  trigger: { title: 'What is your biggest trigger?', options: TRIGGER_OPTIONS, multi: false, dbField: 'trigger', label: 'Biggest trigger' },
  goal: { title: 'What is your main goal?', options: GOAL_OPTIONS, multi: true, dbField: 'goal', label: 'Main goal' },
  support: { title: 'Who is in your corner?', options: SUPPORT_OPTIONS, multi: false, dbField: 'support_type', label: 'Support' },
};

function getDisplayLabel(options: { value: string; label: string }[], raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(',').filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map(v => options.find(o => o.value === v)?.label ?? v).join(', ');
}

function formatQuitDate(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date} @ ${time}`;
}

export default function AccountScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editDate, setEditDate] = useState<Date | null>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { setAvatarUrl: setGlobalAvatarUrl } = useUser();

  const [editField, setEditField] = useState<FieldKey | null>(null);
  const [editModalSelections, setEditModalSelections] = useState<string[]>([]);
  const [savingField, setSavingField] = useState(false);

  const [showSpendingModal, setShowSpendingModal] = useState(false);
  const [spendingCurrency, setSpendingCurrency] = useState('USD');
  const [spendingChip, setSpendingChip] = useState('');
  const [spendingCustom, setSpendingCustom] = useState('');
  const [savingSpending, setSavingSpending] = useState(false);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('display_name, quit_timestamp, quit_date, motivation, trigger, goal, support_type, weekly_bet, currency, is_premium, avatar_url')
      .eq('id', user.id)
      .single();
    const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
    let resolvedAvatar = data?.avatar_url ?? null;
    if (!resolvedAvatar && googleAvatar) {
      resolvedAvatar = googleAvatar;
      await supabase.from('users').update({ avatar_url: googleAvatar }).eq('id', user.id);
    }

    setProfile({
      displayName: data?.display_name ?? null,
      email: user.email ?? null,
      quitTimestamp: data?.quit_timestamp ?? data?.quit_date ?? null,
      motivation: data?.motivation ?? null,
      trigger: data?.trigger ?? null,
      goal: data?.goal ?? null,
      supportType: data?.support_type ?? null,
      weeklyBet: data?.weekly_bet ?? null,
      currency: data?.currency ?? 'USD',
      isPremium: data?.is_premium ?? false,
      avatarUrl: resolvedAvatar,
    });
    setGlobalAvatarUrl(resolvedAvatar);
  }, []);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

  const openFieldModal = (field: FieldKey) => {
    const config = FIELD_CONFIG[field];
    const rawValue = field === 'motivation' ? profile?.motivation
      : field === 'trigger' ? profile?.trigger
      : field === 'goal' ? profile?.goal
      : profile?.supportType;
    if (config.multi) {
      setEditModalSelections(rawValue ? rawValue.split(',').filter(Boolean) : []);
    } else {
      setEditModalSelections(rawValue ? [rawValue] : []);
    }
    setEditField(field);
  };

  const saveFieldModal = async () => {
    if (!editField) return;
    const config = FIELD_CONFIG[editField];
    setSavingField(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const value = config.multi ? editModalSelections.join(',') : (editModalSelections[0] ?? '');
      await supabase.from('users').update({ [config.dbField]: value }).eq('id', user.id);
      setProfile(prev => {
        if (!prev) return prev;
        if (editField === 'motivation') return { ...prev, motivation: value };
        if (editField === 'trigger') return { ...prev, trigger: value };
        if (editField === 'goal') return { ...prev, goal: value };
        return { ...prev, supportType: value };
      });
    }
    setSavingField(false);
    setEditField(null);
  };

  const openSpendingModal = () => {
    setSpendingCurrency(profile?.currency ?? 'USD');
    const wb = profile?.weeklyBet ?? '';
    const isChip = CHIP_AMOUNTS.some(c => c.value === wb);
    setSpendingChip(isChip ? wb : '');
    setSpendingCustom(isChip || !wb ? '' : wb);
    setShowSpendingModal(true);
  };

  const saveSpending = async () => {
    const value = spendingCustom.trim() ? spendingCustom.trim() : spendingChip || null;
    setSavingSpending(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ weekly_bet: value, currency: spendingCurrency }).eq('id', user.id);
      setProfile(prev => prev ? { ...prev, weeklyBet: value, currency: spendingCurrency } : prev);
    }
    setSavingSpending(false);
    setShowSpendingModal(false);
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const uri = result.assets[0].uri;
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const path = `${user.id}-${Date.now()}.${ext}`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, { contentType: mimeType });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Delete old avatar file if one exists
      const oldUrl = profile?.avatarUrl;
      if (oldUrl) {
        const oldPath = oldUrl.split('/avatars/')[1]?.split('?')[0];
        if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
      }

      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id);
      setProfile(prev => prev ? { ...prev, avatarUrl: publicUrl } : prev);
      setGlobalAvatarUrl(publicUrl);
    } catch (err) {
      console.error('Avatar upload error:', err);
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
    }
    setUploadingAvatar(false);
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ display_name: trimmed }).eq('id', user.id);
      setProfile(prev => prev ? { ...prev, displayName: trimmed } : prev);
    }
    setSavingName(false);
    setEditingName(false);
  };

  const openEdit = () => {
    const parsed = profile?.quitTimestamp ? new Date(profile.quitTimestamp) : null;
    const current = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
    setEditDate(current);

    if (Platform.OS === 'ios') {
      setShowIOSModal(true);
      return;
    }

    // Android: imperative two-step date → time
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      maximumDate: new Date(),
      onValueChange: (_evt: any, rawDate?: Date) => {
        if (!rawDate) return;
        const selectedDate = new Date(rawDate.getTime());
        if (isNaN(selectedDate.getTime())) return;
        setTimeout(() => DateTimePickerAndroid.open({
          value: selectedDate,
          mode: 'time',
          is24Hour: true,
          onValueChange: (_tevt: any, rawTime?: Date) => {
            if (!rawTime) return;
            const selectedTime = new Date(rawTime.getTime());
            if (isNaN(selectedTime.getTime())) return;
            const merged = new Date(selectedDate.getTime());
            merged.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            Alert.alert(
              'Update start date?',
              `Set to ${formatQuitDate(merged.toISOString())}?\n\nThis will reset your current streak counter.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Save', onPress: () => saveQuitDate(merged) },
              ],
            );
            },
          }), 500);
      },
    });
  };

  const saveQuitDate = async (date: Date) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const iso = date.toISOString();
      const dateOnly = iso.split('T')[0];
      await supabase.from('users').update({
        quit_timestamp: iso,
        quit_date: dateOnly,
      }).eq('id', user.id);
      await supabase.from('streaks').update({
        streak_start_date: dateOnly,
        current_streak: 0,
      }).eq('user_id', user.id);
      setProfile(prev => prev ? { ...prev, quitTimestamp: iso } : prev);
    }
    setSaving(false);
  };


  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data — streaks, losses, badges, mood history, and journal entries. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Delete all user data
              await Promise.all([
                supabase.from('losses').delete().eq('user_id', user.id),
                supabase.from('streaks').delete().eq('user_id', user.id),
                supabase.from('badges').delete().eq('user_id', user.id),
                supabase.from('mood_checkins').delete().eq('user_id', user.id),
                supabase.from('urge_journal').delete().eq('user_id', user.id),
              ]);
              // Delete avatar from storage
              if (profile?.avatarUrl) {
                const oldPath = profile.avatarUrl.split('/avatars/')[1]?.split('?')[0];
                if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
              }
              await supabase.from('users').delete().eq('id', user.id);
              await supabase.functions.invoke('delete-account');
              await AsyncStorage.removeItem(ONBOARDED_KEY);
              await supabase.auth.signOut();
            }
            setSigningOut(false);
          },
        },
      ],
    );
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            await AsyncStorage.removeItem(ONBOARDED_KEY);
            await supabase.auth.signOut();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0F6E6E" />
      </View>
    );
  }

  const initials = (profile?.displayName ?? profile?.email ?? '?')[0].toUpperCase();
  const quitFormatted = formatQuitDate(profile?.quitTimestamp ?? null);

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Account</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>

        {/* Profile card */}
        <View style={s.profileCard}>
          <Pressable onPress={pickAvatar} style={({ pressed }) => [s.avatar, pressed && { opacity: 0.8 }]}>
            {profile?.avatarUrl
              ? <Image source={{ uri: profile.avatarUrl }} style={s.avatarImg} />
              : <Text style={s.avatarTxt}>{initials}</Text>}
            {uploadingAvatar && (
              <View style={s.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <View style={s.avatarEditBadge}>
              <Text style={s.avatarEditBadgeTxt}>✎</Text>
            </View>
          </Pressable>
          {editingName ? (
            <View style={s.nameEditRow}>
              <TextInput
                style={s.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your name"
                placeholderTextColor="#aaa"
                autoFocus
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <Pressable onPress={saveName} disabled={savingName} style={({ pressed }) => [s.nameSaveBtn, pressed && { opacity: 0.7 }]}>
                {savingName
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.nameSaveTxt}>Save</Text>}
              </Pressable>
              <Pressable onPress={() => setEditingName(false)} style={({ pressed }) => [s.nameCancelBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.nameCancelTxt}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={s.nameRow}
              onPress={() => { setNameInput(profile?.displayName ?? profile?.email?.split('@')[0] ?? ''); setEditingName(true); }}>
              <Text style={s.displayName}>{profile?.displayName ?? profile?.email?.split('@')[0] ?? 'Anonymous'}</Text>
              <View style={s.nameEditHint}><Text style={s.nameEditHintTxt}>Edit</Text></View>
            </Pressable>
          )}
          <Text style={s.email}>{profile?.email}</Text>
          {profile?.isPremium && (
            <View style={s.premiumBadge}>
              <Text style={s.premiumBadgeTxt}>✨ Premium</Text>
            </View>
          )}
        </View>

        {/* Journey */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>Your journey</Text>
          {quitFormatted && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Started</Text>
              <View style={s.infoValueRow}>
                <Text style={s.infoValue}>{quitFormatted}</Text>
                <Pressable
                  onPress={openEdit}
                  disabled={saving}
                  style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.6 }]}>
                  {saving
                    ? <ActivityIndicator size="small" color="#0F6E6E" />
                    : <Text style={s.editBtnTxt}>Edit</Text>}
                </Pressable>
              </View>
            </View>
          )}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Weekly spending</Text>
            <View style={s.infoValueRow}>
              <Text style={[s.infoValue, !profile?.weeklyBet && s.infoValueEmpty]}>
                {profile?.weeklyBet
                  ? `${CURRENCIES.find(c => c.code === profile.currency)?.symbol ?? ''}${profile.weeklyBet}/wk`
                  : 'Not set'}
              </Text>
              <Pressable
                onPress={openSpendingModal}
                style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.6 }]}>
                <Text style={s.editBtnTxt}>{profile?.weeklyBet ? 'Edit' : 'Add'}</Text>
              </Pressable>
            </View>
          </View>

          {(['motivation', 'trigger', 'goal', 'support'] as FieldKey[]).map(field => {
            const config = FIELD_CONFIG[field];
            const raw = field === 'motivation' ? profile?.motivation
              : field === 'trigger' ? profile?.trigger
              : field === 'goal' ? profile?.goal
              : profile?.supportType;
            const display = getDisplayLabel(config.options, raw ?? null);
            return (
              <View key={field} style={s.infoRow}>
                <Text style={s.infoLabel}>{config.label}</Text>
                <View style={s.infoValueRow}>
                  <Text style={[s.infoValue, !display && s.infoValueEmpty]}>
                    {display ?? 'Not set'}
                  </Text>
                  <Pressable
                    onPress={() => openFieldModal(field)}
                    style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.6 }]}>
                    <Text style={s.editBtnTxt}>{display ? 'Edit' : 'Add'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        {/* Subscription */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Subscription</Text>
          <Text style={s.subStatus}>
            {profile?.isPremium ? '✨ Premium — active' : 'Free plan'}
          </Text>
          {!profile?.isPremium && (
            <Pressable style={({ pressed }) => [s.upgradeBtn, pressed && { opacity: 0.85 }]}>
              <Text style={s.upgradeBtnTxt}>Upgrade to Premium</Text>
            </Pressable>
          )}
        </View>

        {/* Privacy Policy */}
        <Pressable
          style={({ pressed }) => [s.privacyBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/privacy-policy')}>
          <Text style={s.privacyBtnTxt}>Privacy Policy</Text>
        </Pressable>

        {/* Sign out */}
        <Pressable
          style={({ pressed }) => [s.signOutBtn, pressed && { opacity: 0.7 }]}
          onPress={confirmSignOut}
          disabled={signingOut}>
          {signingOut
            ? <ActivityIndicator color="#c0392b" size="small" />
            : <Text style={s.signOutTxt}>Sign out</Text>}
        </Pressable>

        {/* Delete account */}
        <Pressable
          style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }]}
          onPress={confirmDeleteAccount}
          disabled={signingOut}>
          <Text style={s.deleteBtnTxt}>Delete account</Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Weekly spending modal */}
      <Modal visible={showSpendingModal} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setShowSpendingModal(false)}>
          <Pressable style={s.editFieldSheet} onPress={() => {}}>
            <View style={s.editFieldHandle} />
            <Text style={s.editFieldTitle}>Weekly spending</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
              {CURRENCIES.map(c => (
                <Pressable
                  key={c.code}
                  style={[s.currencyChip, spendingCurrency === c.code && s.currencyChipSelected]}
                  onPress={() => setSpendingCurrency(c.code)}>
                  <Text style={[s.currencyChipTxt, spendingCurrency === c.code && s.currencyChipTxtSelected]}>
                    {c.code}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={s.spendingChips}>
              {CHIP_AMOUNTS.map(chip => {
                const sym = CURRENCIES.find(c => c.code === spendingCurrency)?.symbol ?? '';
                const isSelected = spendingChip === chip.value;
                return (
                  <Pressable
                    key={chip.value}
                    style={[s.spendingChip, isSelected && s.spendingChipSelected]}
                    onPress={() => { setSpendingChip(prev => prev === chip.value ? '' : chip.value); setSpendingCustom(''); }}>
                    <Text style={[s.spendingChipTxt, isSelected && s.spendingChipTxtSelected]}>
                      {chip.label(sym)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.spendingCustomLabel}>Or enter your exact amount:</Text>
            <View style={s.spendingInputRow}>
              <Text style={s.spendingSymbol}>{CURRENCIES.find(c => c.code === spendingCurrency)?.symbol ?? ''}</Text>
              <TextInput
                style={s.spendingInput}
                value={spendingCustom}
                onChangeText={t => { setSpendingCustom(t); if (t.trim()) setSpendingChip(''); }}
                placeholder="0"
                placeholderTextColor="#bbb"
                keyboardType="numeric"
              />
              <Text style={s.spendingPerWk}>/week</Text>
            </View>

            <View style={[s.modalActions, { marginTop: 16 }]}>
              <Pressable
                style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                onPress={() => setShowSpendingModal(false)}>
                <Text style={s.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                onPress={saveSpending}
                disabled={savingSpending}>
                {savingSpending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalBtnSaveTxt}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit profile field modal */}
      <Modal visible={!!editField} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setEditField(null)}>
          <Pressable style={s.editFieldSheet} onPress={() => {}}>
            <View style={s.editFieldHandle} />
            <Text style={s.editFieldTitle}>
              {editField ? FIELD_CONFIG[editField].title : ''}
            </Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {editField && FIELD_CONFIG[editField].options.map(opt => {
                const isSelected = editModalSelections.includes(opt.value);
                const isMulti = FIELD_CONFIG[editField].multi;
                return (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [s.editFieldOption, isSelected && s.editFieldOptionSelected, pressed && { opacity: 0.7 }]}
                    onPress={() => {
                      if (isMulti) {
                        setEditModalSelections(prev =>
                          prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                        );
                      } else {
                        setEditModalSelections([opt.value]);
                      }
                    }}>
                    <Text style={s.editFieldEmoji}>{opt.emoji}</Text>
                    <Text style={[s.editFieldLabel, isSelected && s.editFieldLabelSelected]}>{opt.label}</Text>
                    {isMulti ? (
                      <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                        {isSelected && <Text style={s.checkmark}>✓</Text>}
                      </View>
                    ) : (
                      <View style={[s.radio, isSelected && s.radioSelected]}>
                        {isSelected && <View style={s.radioDot} />}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={s.modalActions}>
              <Pressable
                style={({ pressed }) => [s.modalBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                onPress={() => setEditField(null)}>
                <Text style={s.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.modalBtn, s.modalBtnSave, { flex: 2 }, pressed && { opacity: 0.85 }]}
                onPress={saveFieldModal}
                disabled={savingField}>
                {savingField
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalBtnSaveTxt}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* iOS date/time picker modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showIOSModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Set start date & time</Text>
              </View>
              {editDate && (
                <DateTimePicker
                  value={editDate}
                  mode="datetime"
                  display="spinner"
                  onValueChange={(_evt, d) => d && setEditDate(new Date(d.getTime()))}
                  maximumDate={new Date()}
                  style={{ height: 200 }}
                />
              )}
              <View style={s.modalActions}>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setShowIOSModal(false)}>
                  <Text style={s.modalBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.modalBtn, s.modalBtnSave, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    setShowIOSModal(false);
                    if (!editDate) return;
                    Alert.alert(
                      'Update start date?',
                      `Set to ${formatQuitDate(editDate.toISOString())}?\n\nThis will reset your current streak counter.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Save', onPress: () => saveQuitDate(editDate) },
                      ],
                    );
                  }}>
                  <Text style={s.modalBtnSaveTxt}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f7f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 16 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  profileCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    alignItems: 'center', gap: 6,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#e6f7f7', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#0F6E6E', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarEditBadgeTxt: { fontSize: 11, color: '#fff' },
  avatarTxt: { fontSize: 32, fontWeight: '700', color: '#0F6E6E' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayName: { fontSize: 18, fontWeight: '700', color: '#111' },
  nameEditHint: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#e6f7f7' },
  nameEditHintTxt: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#111', minWidth: 120,
  },
  nameSaveBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#0F6E6E' },
  nameSaveTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  nameCancelBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  nameCancelTxt: { color: '#aaa', fontSize: 12 },
  email: { fontSize: 13, color: '#888' },
  premiumBadge: {
    backgroundColor: '#e6f7f7', paddingVertical: 4, paddingHorizontal: 12,
    borderRadius: 12, marginTop: 4,
  },
  premiumBadgeTxt: { fontSize: 13, color: '#0F6E6E', fontWeight: '600' },

  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  infoCardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 14, color: '#888' },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  infoValue: { fontSize: 14, color: '#111', fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  editBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#e6f7f7' },
  editBtnTxt: { fontSize: 12, color: '#0F6E6E', fontWeight: '700' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  subStatus: { fontSize: 15, color: '#555' },
  upgradeBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  upgradeBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  privacyBtn: { alignItems: 'center', paddingVertical: 12 },
  privacyBtnTxt: { fontSize: 13, color: '#aaa', textDecorationLine: 'underline' },

  signOutBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#ffcdd2',
  },
  signOutTxt: { fontSize: 15, color: '#c0392b', fontWeight: '600' },
  deleteBtn: { alignItems: 'center', paddingVertical: 12 },
  deleteBtnTxt: { fontSize: 13, color: '#bbb' },

  infoValueEmpty: { color: '#bbb', fontStyle: 'italic', fontWeight: '400' },

  // Spending modal
  currencyChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#d0e8e8', backgroundColor: '#f8fdfd' },
  currencyChipSelected: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  currencyChipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  currencyChipTxtSelected: { color: '#0F6E6E' },
  spendingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  spendingChip: { width: '30.5%', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#d0e8e8', backgroundColor: '#f8fdfd', alignItems: 'center' },
  spendingChipSelected: { borderColor: '#0F6E6E', backgroundColor: '#e6f7f7' },
  spendingChipTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
  spendingChipTxtSelected: { color: '#0F6E6E' },
  spendingCustomLabel: { fontSize: 13, color: '#666', marginBottom: 10 },
  spendingInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fafafa' },
  spendingSymbol: { fontSize: 16, color: '#555', marginRight: 6 },
  spendingInput: { flex: 1, fontSize: 15, color: '#111' },
  spendingPerWk: { fontSize: 13, color: '#999', marginLeft: 6 },

  // Edit field modal
  editFieldSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  editFieldHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginBottom: 16,
  },
  editFieldTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 16 },
  editFieldOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  editFieldOptionSelected: { backgroundColor: '#f0fafa' },
  editFieldEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  editFieldLabel: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },
  editFieldLabelSelected: { color: '#0F6E6E', fontWeight: '600' },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#0F6E6E', borderColor: '#0F6E6E' },
  checkmark: { fontSize: 13, color: '#fff', fontWeight: '700' },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: '#0F6E6E' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0F6E6E' },

  // iOS modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f0f0f0' },
  modalBtnCancel: { fontSize: 15, color: '#555', fontWeight: '600' },
  modalBtnSave: { backgroundColor: '#0F6E6E' },
  modalBtnSaveTxt: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
