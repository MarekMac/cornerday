import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
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

import { type GameKey, GAMES, renderGame } from '@/lib/games';
import { GAME_SCORE_FMT, useGameBests } from '@/lib/useGameBests';
import { type ExerciseKey, EXERCISES, renderExercise } from '@/lib/exercises';

const { width: SCREEN_W } = Dimensions.get('window');
const PICKER_TILE_W = Math.floor((SCREEN_W - 88 - 10) / 2);
const TIMER_TOTAL = 20 * 60;

const INTENSITY_COLORS = ['#27ae60', '#8bc34a', '#f39c12', '#e67e22', '#c0392b'];
const INTENSITY_LABELS = ['Mild', 'Building', 'Strong', 'Intense', 'Overwhelming'];

import AsyncStorage from '@react-native-async-storage/async-storage';

import { TRUSTED_CONTACT_KEY, MOTIVATION_PHOTO_KEY, MILESTONE_NOTIFS_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { DEFAULT_NOTIF_PREFS, scheduleAllNotifications } from '@/lib/notifications';

const MOTIVATION_MAP: Record<string, { label: string; emoji: string }> = {
  family:        { label: 'My family',              emoji: '👨‍👩‍👧' },
  finances:      { label: 'My finances',            emoji: '💰' },
  mental_health: { label: 'My mental health',       emoji: '🧠' },
  saving:        { label: 'Saving for something',   emoji: '🎯' },
  better_self:   { label: 'Becoming a better me',   emoji: '✨' },
  break_free:    { label: 'Breaking free for good', emoji: '🔓' },
};

const THERAPY_RESOURCES = [
  {
    region: '🌍 International',
    items: [
      { name: 'Gambling Therapy', desc: 'Free online support in multiple languages', web: 'https://www.gamblingtherapy.org' },
      { name: 'Gamblers Anonymous', desc: 'Worldwide peer support meetings', web: 'https://www.gamblersanonymous.org' },
    ],
  },
  {
    region: '🇺🇸 United States',
    items: [
      { name: 'National Council on Problem Gambling', desc: 'Helpline, treatment locator, and resources', phone: '18005224700', web: 'https://www.ncpgambling.org' },
      { name: 'SAMHSA Treatment Locator', desc: 'Find local addiction treatment centers', web: 'https://findtreatment.gov' },
    ],
  },
  {
    region: '🇬🇧 United Kingdom',
    items: [
      { name: 'GamCare', desc: 'Free counselling and support, 24/7', phone: '08088020133', web: 'https://www.gamcare.org.uk' },
      { name: 'BeGambleAware', desc: 'Information, advice and support', web: 'https://www.begambleaware.org' },
      { name: 'Gordon Moody', desc: 'Residential and online treatment programmes', web: 'https://www.gordonmoody.org.uk' },
      { name: 'Gamblers Anonymous UK', desc: 'Peer support meetings across the UK', web: 'https://www.gamblersanonymous.org.uk' },
    ],
  },
  {
    region: '🇮🇪 Ireland',
    items: [
      { name: 'Gambling Care Ireland', desc: 'Free counselling and support services', web: 'https://www.gamblingcare.ie' },
      { name: 'Gamblers Anonymous Ireland', desc: 'Peer support meetings nationwide', web: 'https://www.gamblersanonymous.ie' },
    ],
  },
  {
    region: '🇦🇺 Australia',
    items: [
      { name: 'Gambling Help Online', desc: 'Free counselling, available 24/7', phone: '1800858858', web: 'https://www.gamblinghelponline.org.au' },
      { name: 'Lifeline Australia', desc: 'Crisis support and mental health help', phone: '131114', web: 'https://www.lifeline.org.au' },
    ],
  },
  {
    region: '🇨🇦 Canada',
    items: [
      { name: 'ConnexOntario', desc: 'Mental health and addiction support', phone: '18665312600', web: 'https://www.connexontario.ca' },
      { name: 'CAMH', desc: 'Gambling treatment and research (Toronto)', web: 'https://www.camh.ca' },
      { name: 'Gambling Support BC', desc: 'Free treatment for BC residents', phone: '18886868223', web: 'https://www.bcresponsiblegambling.ca' },
    ],
  },
  {
    region: '🇩🇪 Germany',
    items: [
      { name: 'BZgA Spielsucht', desc: 'Federal Centre helpline and referrals', phone: '08001372700', web: 'https://www.bzga.de' },
    ],
  },
  {
    region: '🇫🇷 France',
    items: [
      { name: 'Joueurs Info Service', desc: 'Free helpline and support', phone: '0974751313', web: 'https://www.joueurs-info-service.fr' },
    ],
  },
  {
    region: '🇪🇸 Spain',
    items: [
      { name: 'FEJAR', desc: 'Federation of Rehabilitated Gamblers', web: 'https://www.fejar.org' },
    ],
  },
];

const CONGRATS_VARIANTS = [
  { emoji: '🏆', title: 'You did it!',           note: 'Every urge you resist makes the next one easier. You\'re proving to yourself that you\'re in control.' },
  { emoji: '💪', title: 'That\'s willpower.',     note: 'Willpower is a muscle — you just used it. It grows stronger every time.' },
  { emoji: '⚡', title: 'You held your ground.',  note: 'The urge came, and you didn\'t move. That\'s exactly what recovery looks like.' },
  { emoji: '🌊', title: 'You rode it out.',       note: 'Urges are waves. You didn\'t fight it — you let it pass. That\'s a skill.' },
  { emoji: '🔥', title: 'Real strength.',         note: 'Not many people could do what you just did. Take a moment to feel proud.' },
  { emoji: '🌱', title: 'One more win.',           note: 'Recovery is built one moment at a time. This was your moment — and you nailed it.' },
  { emoji: '🛡️', title: 'You\'re in control.',    note: 'The urge doesn\'t own you. You just proved that again.' },
  { emoji: '✨', title: 'You resisted.',           note: 'That choice — right there — is the thing that changes everything over time.' },
  { emoji: '🎯', title: 'Stronger than the urge.',note: 'It tried. It failed. You win today.' },
  { emoji: '🌟', title: 'Look at you go.',        note: 'You showed up for yourself when it was hard. That\'s the whole game.' },
] as const;

const SLIP_VARIANTS = [
  { emoji: '💙', title: 'That\'s okay.',          body: 'Slips are part of recovery — not the end of it. The fact you\'re still here, still trying, says everything.' },
  { emoji: '🤍', title: 'You\'re still here.',    body: 'Coming back after a slip takes more courage than never slipping at all. You came back.' },
  { emoji: '🌿', title: 'This doesn\'t define you.', body: 'One moment doesn\'t cancel out your effort. Your recovery is still real and still yours.' },
  { emoji: '🔄', title: 'Recovery isn\'t linear.', body: 'Every person in recovery has been exactly where you are now. What matters is what you do next.' },
  { emoji: '💛', title: 'Be kind to yourself.',   body: 'You wouldn\'t judge a friend this harshly. Give yourself the same grace you\'d give them.' },
  { emoji: '🌅', title: 'A new start.',           body: 'Every moment is a chance to begin again. You don\'t have to wait until tomorrow.' },
  { emoji: '🧭', title: 'Still on the path.',     body: 'A slip is a detour, not a dead end. The path back is right here.' },
  { emoji: '💪', title: 'You\'re still fighting.', body: 'The fact that you\'re facing this — not hiding from it — shows how serious you are about change.' },
  { emoji: '🌊', title: 'Ride the wave.',         body: 'This feeling will pass. Shame fades. What lasts is what you choose to do right now.' },
  { emoji: '🕊️', title: 'Forgive yourself.',     body: 'Guilt won\'t help — but a reset will. You\'ve got this. One breath, one step.' },
] as const;

const DISTRACTIONS = [
  {
    emoji: '🚶', label: 'Go for a walk', sub: 'Step outside for 5–10 minutes',
    tip: 'Movement breaks the mental loop. Even a short walk around the block shifts your mood.',
    action: 'expand' as const,
  },
  {
    emoji: '📞', label: 'Call someone you trust', sub: 'Hear a familiar voice',
    action: 'call' as const,
  },
  {
    emoji: '🎵', label: 'Listen to music', sub: 'Put on something you love',
    action: 'music' as const,
  },
  {
    emoji: '🍵', label: 'Make a hot drink', sub: 'Slow down with a warm cup',
    tip: 'Make it intentionally — boil the kettle, pick your drink, and focus on the warmth in your hands.',
    action: 'expand' as const,
  },
  {
    emoji: '🎮', label: 'Play a focus game', sub: 'Engage your mind for a few minutes',
    action: 'game' as const,
  },
];

const TRIGGERS = [
  { key: 'betting_ads', label: 'Betting ads' },
  { key: 'live_sport',  label: 'Live sport' },
  { key: 'social',      label: 'Friends/social' },
  { key: 'stress',      label: 'Stress' },
  { key: 'boredom',     label: 'Boredom' },
  { key: 'financial',   label: 'Financial pressure' },
  { key: 'other',       label: 'Other' },
];

export default function UrgeScreen() {
  const [motivation, setMotivation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline log (replaces modal)
  const [logExpanded, setLogExpanded] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [customTrigger, setCustomTrigger] = useState('');
  const [outcome, setOutcome] = useState<'overcame' | 'slipped' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logCardY, setLogCardY] = useState(0);
  const [showCongrats, setShowCongrats] = useState(false);
  const [congratsElapsed, setCongratsElapsed] = useState(0);
  const [congratsVariant, setCongratsVariant] = useState(0);
  const [showSlip, setShowSlip] = useState(false);
  const [slipVariant, setSlipVariant] = useState(0);
  const [slipResetting, setSlipResetting] = useState(false);
  const [slipReset, setSlipReset] = useState(false);

  const [urgeIntensityBefore, setUrgeIntensityBefore] = useState<number | null>(null);
  const [urgeIntensityAfter, setUrgeIntensityAfter] = useState<number | null>(null);
  const [therapyModalVisible, setTherapyModalVisible] = useState(false);
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const { personalBests, globalBests, handleScore } = useGameBests();
  const [trustedContact, setTrustedContact] = useState<{ name: string; phone: string } | null>(null);
  const [motivationPhoto, setMotivationPhoto] = useState<string | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseKey | null>(null);
  const [pickerVisible, setPickerVisible] = useState<'games' | 'exercises' | null>(null);
  const [activeDistraction, setActiveDistraction] = useState<typeof DISTRACTIONS[0] | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSecsLeft, setTimerSecsLeft] = useState(TIMER_TOTAL);
  const [timerPointsEarned, setTimerPointsEarned] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const isMounted = useRef(true);

  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  const fetchMotivation = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data }, rawContact, rawPhoto] = await Promise.all([
      supabase.from('users').select('motivation').eq('id', user.id).single(),
      AsyncStorage.getItem(TRUSTED_CONTACT_KEY),
      AsyncStorage.getItem(MOTIVATION_PHOTO_KEY),
    ]);
    setMotivation(data?.motivation ?? null);
    if (rawContact) setTrustedContact(JSON.parse(rawContact));
    if (rawPhoto) setMotivationPhoto(rawPhoto);
  }, []);

  useFocusEffect(useCallback(() => { fetchMotivation().finally(() => setLoading(false)); }, [fetchMotivation]));

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimerSecsLeft(prev => {
        if (prev <= 1) {
          setTimerRunning(false);
          awardTimerPoint();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const awardTimerPoint = async () => {
    setTimerPointsEarned(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const key = `urge_timer_${today}`;
    const already = await AsyncStorage.getItem(key);
    if (already) return;
    await AsyncStorage.setItem(key, '1');
    await supabase.from('urge_journal').insert({
      user_id: user.id,
      trigger: 'timer_completed',
      outcome: 'overcame',
      note: 'Completed 20-minute urge timer',
    });
  };

  const openLog = (presetOutcome?: 'overcame' | 'slipped') => {
    setOutcome(presetOutcome ?? null);
    setSelectedTrigger(null);
    setCustomTrigger('');
    const intensityNote = urgeIntensityBefore !== null
      ? urgeIntensityAfter !== null
        ? `Intensity: ${urgeIntensityBefore}/5 → ${urgeIntensityAfter}/5`
        : `Intensity: ${urgeIntensityBefore}/5`
      : '';
    setNote(intensityNote);
    setSaved(false);
    setLogExpanded(true);
  };

  const closeLog = () => {
    setLogExpanded(false);
    setSelectedTrigger(null);
    setCustomTrigger('');
    setOutcome(null);
    setNote('');
    setSaved(false);
  };

  const saveEntry = async () => {
    if (!selectedTrigger || !outcome) return;
    const triggerValue = selectedTrigger === 'other'
      ? (customTrigger.trim() || 'other')
      : selectedTrigger;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from('urge_journal').insert({
        user_id: user.id, trigger: triggerValue, outcome,
        note: note.trim() || null,
      });
      if (error) {
        setSaving(false);
        Alert.alert('Could not save', error.message);
        return;
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(closeLog, 1500);
  };

  const canSave = selectedTrigger !== null && outcome !== null &&
    (selectedTrigger !== 'other' || customTrigger.trim().length > 0);

  const pickMotivationPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access in your device settings to add a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (result.canceled) return;
    const src = result.assets[0].uri;
    const destFile = new File(Paths.document, 'motivation_photo.jpg');
    await new File(src).copy(destFile);
    await AsyncStorage.setItem(MOTIVATION_PHOTO_KEY, destFile.uri);
    setMotivationPhoto(destFile.uri);
  };

  const handleDistraction = (d: typeof DISTRACTIONS[0]) => {
    setActiveDistraction(d);
  };

  const motivations = (motivation ?? '').split(',').filter(Boolean)
    .map(m => MOTIVATION_MAP[m] ?? { label: m, emoji: '💪' });

  const timerDone = !timerRunning && timerSecsLeft === 0;
  const timerPct = ((TIMER_TOTAL - timerSecsLeft) / TIMER_TOTAL) * 100;
  const timerMins = Math.floor(timerSecsLeft / 60);
  const timerSecs = timerSecsLeft % 60;
  const timerDisplay = `${String(timerMins).padStart(2, '0')}:${String(timerSecs).padStart(2, '0')}`;
  const startTimer = () => { setTimerSecsLeft(TIMER_TOTAL); setTimerRunning(true); setTimerPointsEarned(false); };
  const stopTimer  = () => {
    const elapsed = TIMER_TOTAL - timerSecsLeft;
    setTimerRunning(false);
    setTimerSecsLeft(TIMER_TOTAL);
    setTimerPointsEarned(false);
    setCongratsElapsed(elapsed);
    setCongratsVariant(Math.floor(Math.random() * CONGRATS_VARIANTS.length));
    setShowCongrats(true);
  };
  const hadASlip = () => {
    setTimerRunning(false);
    setTimerSecsLeft(TIMER_TOTAL);
    setTimerPointsEarned(false);
    setSlipReset(false);
    setSlipVariant(Math.floor(Math.random() * SLIP_VARIANTS.length));
    setShowSlip(true);
  };

  const doStreakReset = async () => {
    setSlipResetting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const newQuitTimestamp = new Date().toISOString();
      await Promise.all([
        supabase.from('users').update({ quit_date: today, quit_timestamp: newQuitTimestamp }).eq('id', user.id),
        supabase.from('streaks').update({ current_streak: 0, streak_start_date: today }).eq('user_id', user.id),
        supabase.from('badges').delete().eq('user_id', user.id),
        AsyncStorage.removeItem(MILESTONE_NOTIFS_KEY),
      ]);
      const { data: prefsRow } = await supabase
        .from('users')
        .select('notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching')
        .eq('id', user.id).single();
      const prefs = {
        notif_milestone:             prefsRow?.notif_milestone             ?? DEFAULT_NOTIF_PREFS.notif_milestone,
        notif_daily_streak:          prefsRow?.notif_daily_streak          ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
        notif_daily_checkin:         prefsRow?.notif_daily_checkin         ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
        notif_weekly_summary:        prefsRow?.notif_weekly_summary        ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
        notif_milestone_approaching: prefsRow?.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
      };
      await scheduleAllNotifications(prefs, newQuitTimestamp);
    }
    setSlipResetting(false);
    setSlipReset(true);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#0F6E6E" /></View>;
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Support</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">

          {/* Red urge hero button */}
          <Pressable
            style={({ pressed }) => [
              s.urgeBtn,
              timerRunning && s.urgeBtnRunning,
              timerDone && s.urgeBtnDone,
              pressed && !timerRunning && !timerDone && { opacity: 0.9 },
            ]}
            onPress={() => { if (!timerRunning && !timerDone) startTimer(); }}>
            <Text style={[s.urgeBtnTxt, (timerRunning || timerDone) && s.urgeBtnTxtAlt]}>
              {timerDone
                ? '🎉  You made it through the urge'
                : timerRunning
                  ? '⏱  Timer running — hold on 💪'
                  : "I'm feeling the urge right now"}
            </Text>
            {!timerRunning && !timerDone && (
              <Text style={s.urgeBtnSub}>Tap to start your 20-minute urge timer</Text>
            )}
          </Pressable>

          {/* Urge delay timer */}
          <View style={[s.timerCard, timerDone && s.timerCardDone]}>
            <View style={s.timerTop}>
              <View style={{ flex: 1 }}>
                <Text style={[s.timerTitle, timerDone && { color: '#27ae60' }]}>
                  {timerDone ? 'You made it! 🎉' : timerRunning ? 'Holding on...' : 'Hold on for 20 minutes'}
                </Text>
                <Text style={s.timerSub}>
                  {timerDone ? 'The urge has passed. That took strength.' : 'Most urges fade within 20 minutes'}
                </Text>
              </View>
              <Text style={[s.timerDigits, timerDone && { color: '#27ae60' }]}>{timerDisplay}</Text>
            </View>
            <View style={s.timerTrack}>
              <View style={[s.timerFill, { width: `${timerPct}%` as any }, timerDone && s.timerFillDone]} />
            </View>
            {timerDone && (
              <View style={s.timerReward}>
                <Text style={s.timerRewardEmoji}>⭐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.timerRewardTitle}>+1 point earned</Text>
                  <Text style={s.timerRewardSub}>
                    {timerPointsEarned ? 'Logged to your journal automatically' : 'Already earned one today — keep going!'}
                  </Text>
                </View>
              </View>
            )}
            {!timerRunning && !timerDone && (
              <View style={s.intensityWrap}>
                <Text style={s.intensityLbl}>How strong is the urge?</Text>
                <View style={s.intensityRow}>
                  {[1,2,3,4,5].map(n => (
                    <Pressable
                      key={n}
                      style={[s.intensityDot, urgeIntensityBefore === n && { backgroundColor: INTENSITY_COLORS[n-1], borderColor: INTENSITY_COLORS[n-1] }]}
                      onPress={() => setUrgeIntensityBefore(prev => prev === n ? null : n)}>
                      <Text style={[s.intensityDotTxt, urgeIntensityBefore === n && { color: '#fff' }]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                {urgeIntensityBefore !== null && (
                  <Text style={[s.intensityHint, { color: INTENSITY_COLORS[urgeIntensityBefore - 1] }]}>
                    {INTENSITY_LABELS[urgeIntensityBefore - 1]}
                  </Text>
                )}
              </View>
            )}
            <View style={s.timerBtns}>
              {!timerRunning && !timerDone && (
                <Pressable style={({ pressed }) => [s.timerStartBtn, pressed && { opacity: 0.88 }]} onPress={startTimer}>
                  <Text style={s.timerStartBtnTxt}>Start timer</Text>
                </Pressable>
              )}
              {timerRunning && (
                <>
                  <Pressable style={({ pressed }) => [s.timerPastBtn, pressed && { opacity: 0.88 }]} onPress={stopTimer}>
                    <Text style={s.timerPastBtnTxt}>I'm past it  ✓</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.timerSlipBtn, pressed && { opacity: 0.7 }]} onPress={hadASlip}>
                    <Text style={s.timerSlipBtnTxt}>Had a slip</Text>
                  </Pressable>
                </>
              )}
              {timerDone && (
                <Pressable style={({ pressed }) => [s.timerStartBtn, pressed && { opacity: 0.88 }]} onPress={() => { setTimerRunning(false); setTimerSecsLeft(TIMER_TOTAL); setTimerPointsEarned(false); setUrgeIntensityBefore(null); setUrgeIntensityAfter(null); }}>
                  <Text style={s.timerStartBtnTxt}>Go again</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Quick actions */}
          <View style={s.iconRowWrap}>
          <View style={s.iconSeparator} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconRow}>
            <Pressable style={({ pressed }) => [s.iconPill, pressed && { opacity: 0.7 }]} onPress={() => setPickerVisible('games')}>
              <Text style={s.iconPillEmoji}>🎮</Text>
              <Text style={s.iconPillLabel}>Games</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [s.iconPill, pressed && { opacity: 0.7 }]} onPress={() => setPickerVisible('exercises')}>
              <Text style={s.iconPillEmoji}>🧘</Text>
              <Text style={s.iconPillLabel}>Exercises</Text>
            </Pressable>
            {DISTRACTIONS.filter(d => d.action === 'call').map(d => {
              const label = trustedContact?.name ? `Call ${trustedContact.name}` : d.label;
              return (
                <Pressable key={d.label} style={({ pressed }) => [s.iconPill, pressed && { opacity: 0.7 }]} onPress={() => handleDistraction(d)}>
                  <Text style={s.iconPillEmoji}>{d.emoji}</Text>
                  <Text style={s.iconPillLabel}>{label}</Text>
                </Pressable>
              );
            })}
            {DISTRACTIONS.filter(d => d.action !== 'game' && d.action !== 'call').map(d => (
              <Pressable key={d.label} style={({ pressed }) => [s.iconPill, pressed && { opacity: 0.7 }]} onPress={() => handleDistraction(d)}>
                <Text style={s.iconPillEmoji}>{d.emoji}</Text>
                <Text style={s.iconPillLabel}>{d.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={s.iconSeparator} />
          </View>
          <Pressable
            style={({ pressed }) => [s.logQuickBtn, pressed && { opacity: 0.6 }]}
            onPress={() => openLog()}>
            <Text style={s.logQuickBtnTxt}>📝  Log this moment</Text>
          </Pressable>

          {/* Your why */}
          <View style={s.whyCard}>
            <View style={s.whyInner}>
              <View style={s.whyText}>
                <Text style={s.whyLbl}>Remember your why</Text>
                {motivations.map((m, i) => (
                  <View key={i} style={s.whyRow}>
                    <Text style={s.whyEmoji}>{m.emoji}</Text>
                    <Text style={s.whyVal}>{m.label}</Text>
                  </View>
                ))}
              </View>
              <Pressable onPress={pickMotivationPhoto} style={s.whyPhotoBtn}>
                {motivationPhoto ? (
                  <View>
                    <Image source={{ uri: motivationPhoto }} style={s.whyPhoto} />
                    <View style={s.whyPhotoBadge}>
                      <Text style={s.whyPhotoBadgeIcon}>📷</Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.whyPhotoEmpty}>
                    <Text style={{ fontSize: 20 }}>📷</Text>
                    <Text style={s.whyPhotoEmptyTxt}>Add photo</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>


          {/* Crisis resources */}
          <View style={s.crisisCard}>
            <Text style={s.crisisTitle}>Need more help?</Text>
            <Text style={s.crisisDesc}>
              National Problem Gambling Helpline — free, confidential, available 24/7
            </Text>
            <Pressable
              style={({ pressed }) => [s.crisisBtn, pressed && { opacity: 0.85 }]}
              onPress={() => Linking.openURL('tel:18005224700')}>
              <Text style={s.crisisBtnTxt}>📞  1-800-522-4700</Text>
            </Pressable>
            <Text style={s.crisisNote}>Text HOME to 741741 — Crisis Text Line</Text>
          </View>

          {/* Professional help */}
          <Pressable
            style={({ pressed }) => [s.therapyBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setTherapyModalVisible(true)}>
            <Text style={s.therapyBtnIcon}>🏥</Text>
            <View style={s.therapyBtnText}>
              <Text style={s.therapyBtnTitle}>Find professional help</Text>
              <Text style={s.therapyBtnSub}>Official therapy &amp; treatment resources by region</Text>
            </View>
            <Text style={s.therapyBtnChevron}>›</Text>
          </Pressable>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Log this moment modal */}
      <Modal visible={logExpanded} transparent animationType="fade" onRequestClose={closeLog}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.logModalOverlay} onPress={closeLog}>
            <Pressable style={s.logModalSheet} onPress={() => {}}>
              <View style={s.logModalHandle} />
              {saved ? (
                <View style={s.savedWrap}>
                  <Text style={s.savedIcon}>✓</Text>
                  <Text style={s.savedTxt}>Entry saved</Text>
                  <Text style={s.savedSub}>Logged to your journal</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={s.logExpandedTitle}>Log this moment</Text>
                  <View style={s.outcomeRow}>
                    <Pressable
                      style={[s.outcomeBtn, outcome === 'overcame' && s.outcomeBtnGreen]}
                      onPress={() => setOutcome('overcame')}>
                      <Text style={[s.outcomeBtnTxt, outcome === 'overcame' && s.outcomeBtnTxtActive]}>Overcame it ✓</Text>
                    </Pressable>
                    <Pressable
                      style={[s.outcomeBtn, outcome === 'slipped' && s.outcomeBtnRed]}
                      onPress={() => setOutcome('slipped')}>
                      <Text style={[s.outcomeBtnTxt, outcome === 'slipped' && s.outcomeBtnTxtActive]}>Had a slip</Text>
                    </Pressable>
                  </View>
                  <Text style={s.fieldLabel}>What triggered it?</Text>
                  <View style={s.chipsWrap}>
                    {TRIGGERS.map(t => (
                      <Pressable
                        key={t.key}
                        style={[s.chip, selectedTrigger === t.key && s.chipActive]}
                        onPress={() => setSelectedTrigger(t.key)}>
                        <Text style={[s.chipTxt, selectedTrigger === t.key && s.chipTxtActive]}>{t.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedTrigger === 'other' && (
                    <TextInput
                      style={s.customInput}
                      placeholder="Describe the trigger…"
                      placeholderTextColor="#aaa"
                      value={customTrigger}
                      onChangeText={setCustomTrigger}
                      maxLength={120}
                    />
                  )}
                  <Text style={s.fieldLabel}>
                    How are you feeling? <Text style={s.optional}>(optional)</Text>
                  </Text>
                  <TextInput
                    style={s.noteInput}
                    placeholder="Add a note…"
                    placeholderTextColor="#aaa"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    textAlignVertical="top"
                  />
                  <View style={[s.sheetActions, { marginBottom: 8 }]}>
                    <Pressable style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7 }]} onPress={closeLog}>
                      <Text style={s.cancelBtnTxt}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [s.saveBtn, !canSave && s.saveBtnDisabled, pressed && canSave && { opacity: 0.85 }]}
                      onPress={saveEntry}
                      disabled={!canSave || saving}>
                      {saving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.saveBtnTxt}>Save entry</Text>}
                    </Pressable>
                  </View>
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Had a slip overlay */}
      <Modal visible={showSlip} transparent animationType="fade" onRequestClose={() => setShowSlip(false)}>
        <Pressable style={s.slipOverlay} onPress={() => setShowSlip(false)}>
          <Pressable style={s.slipContent} onPress={e => e.stopPropagation()}>
            <Text style={s.slipEmoji}>{SLIP_VARIANTS[slipVariant].emoji}</Text>
            <Text style={s.slipTitle}>{SLIP_VARIANTS[slipVariant].title}</Text>
            <Text style={s.slipBody}>{SLIP_VARIANTS[slipVariant].body}</Text>
            {slipReset ? (
              <View style={s.slipResetDone}>
                <Text style={s.slipResetDoneTxt}>✓ Streak reset. A new start begins now.</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [s.slipResetBtn, pressed && { opacity: 0.8 }]}
                onPress={doStreakReset}
                disabled={slipResetting}>
                {slipResetting
                  ? <ActivityIndicator size="small" color="#c0392b" />
                  : <Text style={s.slipResetBtnTxt}>Reset my streak</Text>}
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [s.slipLogBtn, pressed && { opacity: 0.85 }]}
              onPress={() => { setShowSlip(false); openLog('slipped'); }}>
              <Text style={s.slipLogBtnTxt}>Log this moment  →</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.slipClose, pressed && { opacity: 0.6 }]}
              onPress={() => setShowSlip(false)}>
              <Text style={s.slipCloseTxt}>Skip for now</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Congrats overlay */}
      <Modal visible={showCongrats} transparent animationType="fade" onRequestClose={() => setShowCongrats(false)}>
        <Pressable style={s.slipOverlay} onPress={() => setShowCongrats(false)}>
          <Pressable style={s.slipContent} onPress={e => e.stopPropagation()}>
            <Text style={s.congratsEmoji}>{CONGRATS_VARIANTS[congratsVariant].emoji}</Text>
            <Text style={s.congratsTitle}>{CONGRATS_VARIANTS[congratsVariant].title}</Text>
            <Text style={s.congratsSub}>
              You held on for{' '}
              <Text style={s.congratsTime}>
                {congratsElapsed >= 60
                  ? `${Math.floor(congratsElapsed / 60)} min${Math.floor(congratsElapsed / 60) !== 1 ? 's' : ''}`
                  : `${congratsElapsed} sec${congratsElapsed !== 1 ? 's' : ''}`}
              </Text>
              {'. That takes real strength.'}
            </Text>
            <Text style={s.congratsNote}>{CONGRATS_VARIANTS[congratsVariant].note}</Text>
            <View style={s.intensityAfterWrap}>
              <Text style={s.intensityLbl}>How strong is it now?</Text>
              <View style={s.intensityRow}>
                {[1,2,3,4,5].map(n => (
                  <Pressable
                    key={n}
                    style={[s.intensityDot, urgeIntensityAfter === n && { backgroundColor: INTENSITY_COLORS[n-1], borderColor: INTENSITY_COLORS[n-1] }]}
                    onPress={() => setUrgeIntensityAfter(prev => prev === n ? null : n)}>
                    <Text style={[s.intensityDotTxt, urgeIntensityAfter === n && { color: '#fff' }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              {urgeIntensityBefore !== null && urgeIntensityAfter !== null && (
                <Text style={s.intensityCompare}>
                  {urgeIntensityAfter < urgeIntensityBefore
                    ? `Was ${urgeIntensityBefore} → now ${urgeIntensityAfter}  ↓ dropped ${urgeIntensityBefore - urgeIntensityAfter}`
                    : urgeIntensityAfter === urgeIntensityBefore
                    ? `Still at ${urgeIntensityAfter} — keep going`
                    : `Was ${urgeIntensityBefore} → now ${urgeIntensityAfter}`}
                </Text>
              )}
            </View>
            <Pressable
              style={({ pressed }) => [s.slipLogBtn, pressed && { opacity: 0.85 }]}
              onPress={() => { setShowCongrats(false); openLog('overcame'); }}>
              <Text style={s.slipLogBtnTxt}>Log this moment  →</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.slipClose, pressed && { opacity: 0.6 }]}
              onPress={() => setShowCongrats(false)}>
              <Text style={s.slipCloseTxt}>Skip for now</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Games / Exercises picker sheet */}
      <Modal
        visible={pickerVisible !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(null)}>
        <View style={s.pickerOverlay}>
          <Pressable style={s.modalBackdrop} onPress={() => setPickerVisible(null)} />
          <View style={s.pickerSheet}>
            <Text style={s.pickerTitle}>
              {pickerVisible === 'games' ? '🎮  Focus games' : '🧘  Guided exercises'}
            </Text>
            <Text style={s.pickerSub}>
              {pickerVisible === 'games' ? 'Engage your mind to ease the urge' : 'Breathe, ground, and reset'}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }}>
              <View style={s.pickerGrid}>
                {pickerVisible === 'games'
                  ? GAMES.map(game => (
                      <Pressable
                        key={game.key}
                        style={({ pressed }) => [s.pickerTile, pressed && { opacity: 0.75 }]}
                        onPress={() => { setPickerVisible(null); setActiveGame(game.key); }}>
                        <Text style={s.pickerTileEmoji}>{game.emoji}</Text>
                        <Text style={s.pickerTileTitle}>{game.title}</Text>
                        {GAME_SCORE_FMT[game.key] && (personalBests[game.key] !== undefined || globalBests[game.key] !== undefined) && (
                          <View style={s.pickerTileBests}>
                            {personalBests[game.key] !== undefined && (
                              <Text style={s.pickerTilePB}>🏅 {GAME_SCORE_FMT[game.key]!(personalBests[game.key]!)}</Text>
                            )}
                            {globalBests[game.key] !== undefined && (
                              <Text style={s.pickerTileGB}>🌍 {GAME_SCORE_FMT[game.key]!(globalBests[game.key]!)}</Text>
                            )}
                          </View>
                        )}
                      </Pressable>
                    ))
                  : EXERCISES.map(ex => (
                      <Pressable
                        key={ex.key}
                        style={({ pressed }) => [s.pickerTile, pressed && { opacity: 0.75 }]}
                        onPress={() => { setPickerVisible(null); setActiveExercise(ex.key); }}>
                        <Text style={s.pickerTileEmoji}>{ex.emoji}</Text>
                        <Text style={s.pickerTileTitle}>{ex.title}</Text>
                      </Pressable>
                    ))
                }
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Distraction info card */}
      <Modal
        visible={activeDistraction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveDistraction(null)}>
        <View style={s.pickerOverlay}>
          <Pressable style={s.modalBackdrop} onPress={() => setActiveDistraction(null)} />
          {activeDistraction && (
            <View style={s.pickerSheet}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <Text style={{ fontSize: 36 }}>{activeDistraction.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pickerTitle}>{activeDistraction.label}</Text>
                  <Text style={s.pickerSub}>{activeDistraction.sub}</Text>
                </View>
              </View>

              {'tip' in activeDistraction && activeDistraction.tip ? (
                <View style={s.distractionTipBox}>
                  <Text style={s.distractionTipTxt}>{activeDistraction.tip}</Text>
                </View>
              ) : null}

              {activeDistraction.action === 'call' && (
                trustedContact ? (
                  <View style={s.distractionTipBox}>
                    <Text style={s.distractionTipTxt}>
                      Reach out to {trustedContact.name} — they're in your corner.
                    </Text>
                    <Pressable
                      style={({ pressed }) => [s.distractionCallBtn, pressed && { opacity: 0.85 }]}
                      onPress={() => { setActiveDistraction(null); Linking.openURL(`tel:${trustedContact.phone}`); }}>
                      <Text style={s.distractionCallBtnTxt}>📞  Call {trustedContact.name}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={s.distractionTipBox}>
                    <Text style={s.distractionTipTxt}>
                      No trusted contact saved yet. Add one in Account settings for quick access.
                    </Text>
                    <Pressable
                      style={({ pressed }) => [s.distractionCallBtn, pressed && { opacity: 0.85 }]}
                      onPress={() => { setActiveDistraction(null); router.push('/(tabs)/account'); }}>
                      <Text style={s.distractionCallBtnTxt}>Go to Account settings</Text>
                    </Pressable>
                  </View>
                )
              )}

              {activeDistraction.action === 'music' && (
                <View style={s.distractionTipBox}>
                  <Text style={s.distractionTipTxt}>
                    Music shifts your mood fast. Put on something familiar — upbeat or calming, whatever feels right.
                  </Text>
                  <Pressable
                    style={({ pressed }) => [s.distractionCallBtn, pressed && { opacity: 0.85 }]}
                    onPress={() => {
                      setActiveDistraction(null);
                      if (Platform.OS === 'android') {
                        Linking.openURL('intent:#Intent;action=android.intent.action.MUSIC_PLAYER;end')
                          .catch(() => Linking.openURL('spotify://').catch(() => {}));
                      } else {
                        Linking.openURL('music://').catch(() => Linking.openURL('spotify://').catch(() => {}));
                      }
                    }}>
                    <Text style={s.distractionCallBtnTxt}>🎵  Open music app</Text>
                  </Pressable>
                </View>
              )}

              <Pressable
                style={({ pressed }) => [s.distractionDismissBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setActiveDistraction(null)}>
                <Text style={s.distractionDismissTxt}>Got it</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* Game overlay */}
      {activeGame !== null && (
        <View style={StyleSheet.absoluteFill}>
          <SafeAreaView style={s.gameOverlay} edges={['top', 'bottom']}>
            <View style={s.gameOverlayHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>{GAMES.find(g => g.key === activeGame)?.emoji}</Text>
                <View>
                  <Text style={s.gameOverlayTitle}>{GAMES.find(g => g.key === activeGame)?.title}</Text>
                  {GAME_SCORE_FMT[activeGame] && (
                    <Text style={s.gameOverlayBests}>
                      {personalBests[activeGame] !== undefined ? `🏅 ${GAME_SCORE_FMT[activeGame]!(personalBests[activeGame]!)}` : '🏅 —'}
                      {'  '}
                      {globalBests[activeGame] !== undefined ? `🌍 ${GAME_SCORE_FMT[activeGame]!(globalBests[activeGame]!)}` : '🌍 —'}
                    </Text>
                  )}
                </View>
              </View>
              <Pressable style={s.gameCloseBtn} onPress={() => setActiveGame(null)}>
                <Text style={s.gameCloseBtnTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {renderGame(activeGame, (score) => handleScore(activeGame, score))}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Exercise overlay */}
      {activeExercise !== null && (
        <View style={StyleSheet.absoluteFill}>
          <SafeAreaView style={s.gameOverlay} edges={['top', 'bottom']}>
            <View style={s.gameOverlayHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>{EXERCISES.find(e => e.key === activeExercise)?.emoji}</Text>
                <Text style={s.gameOverlayTitle}>{EXERCISES.find(e => e.key === activeExercise)?.title}</Text>
              </View>
              <Pressable style={s.gameCloseBtn} onPress={() => setActiveExercise(null)}>
                <Text style={s.gameCloseBtnTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {renderExercise(activeExercise)}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Professional help modal */}
      <Modal
        visible={therapyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTherapyModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={s.modalBackdrop} onPress={() => setTherapyModalVisible(false)} />
          <View style={[s.sheet, { maxHeight: '90%' }]}>
            <View style={s.therapyHandle} />
            <Text style={s.therapyModalTitle}>Professional Help</Text>
            <Text style={s.therapyModalSub}>Official treatment resources by region</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              {THERAPY_RESOURCES.map(section => (
                <View key={section.region} style={s.therapySection}>
                  <Text style={s.therapyRegion}>{section.region}</Text>
                  {section.items.map((item, idx) => (
                    <View
                      key={item.name}
                      style={[s.therapyItem, idx < section.items.length - 1 && s.therapyItemBorder]}>
                      <Text style={s.therapyItemName}>{item.name}</Text>
                      <Text style={s.therapyItemDesc}>{item.desc}</Text>
                      <View style={s.therapyItemBtns}>
                        {'phone' in item && item.phone ? (
                          <Pressable
                            style={({ pressed }) => [s.therapyCallBtn, pressed && { opacity: 0.7 }]}
                            onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                            <Text style={s.therapyCallBtnTxt}>📞 Call</Text>
                          </Pressable>
                        ) : null}
                        {'web' in item && item.web ? (
                          <Pressable
                            style={({ pressed }) => [s.therapyWebBtn, pressed && { opacity: 0.7 }]}
                            onPress={() => Linking.openURL(item.web!)}>
                            <Text style={s.therapyWebBtnTxt}>🌐 Website</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 22 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 3 },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  // ── Urge hero button ──────────────────────────────────────────────────────────
  urgeBtn: {
    backgroundColor: '#c0392b', borderRadius: 18,
    paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center', gap: 4,
    shadowColor: '#c0392b', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  urgeBtnRunning: {
    backgroundColor: '#0F6E6E',
    shadowColor: '#0F6E6E',
  },
  urgeBtnDone: {
    backgroundColor: '#27ae60',
    shadowColor: '#27ae60',
  },
  urgeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  urgeBtnTxtAlt: { fontWeight: '700' },
  urgeBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center' },

  // ── Urge delay timer ─────────────────────────────────────────────────────────
  timerCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 20,
    shadowColor: '#0F6E6E', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
    borderWidth: 1, borderColor: '#e0f0f0',
  },
  timerCardDone: {
    borderColor: '#27ae60', borderWidth: 1.5,
    shadowColor: '#27ae60', shadowOpacity: 0.15,
  },
  timerReward: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f0fdf4', borderRadius: 12,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  timerRewardEmoji: { fontSize: 26 },
  timerRewardTitle: { fontSize: 15, fontWeight: '700', color: '#166534' },
  timerRewardSub: { fontSize: 12, color: '#16a34a', marginTop: 1 },
  timerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  timerTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 3 },
  timerSub: { fontSize: 13, color: '#888', lineHeight: 18 },
  timerDigits: { fontSize: 34, fontWeight: '800', color: '#0F6E6E', fontVariant: ['tabular-nums'] as any },
  timerTrack: { height: 6, backgroundColor: '#e6f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 16 },
  timerFill: { height: 6, backgroundColor: '#0F6E6E', borderRadius: 3 },
  timerFillDone: { backgroundColor: '#27ae60' },
  timerBtns: { flexDirection: 'row', gap: 10 },
  timerStartBtn: {
    flex: 1, backgroundColor: '#0F6E6E', borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  timerStartBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  timerPastBtn: {
    flex: 2, backgroundColor: '#e6f7f0', borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#27ae60',
  },
  timerPastBtnTxt: { color: '#27ae60', fontWeight: '700', fontSize: 15 },
  timerCancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f5f5f5' },
  timerCancelBtnTxt: { color: '#888', fontWeight: '600', fontSize: 14 },
  timerSlipBtn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#e0a0a0' },
  timerSlipBtnTxt: { color: '#c0392b', fontWeight: '600', fontSize: 14 },

  // ── Urge intensity ────────────────────────────────────────────────────────────
  intensityWrap: { paddingTop: 14, paddingBottom: 4, alignItems: 'center', gap: 8 },
  intensityAfterWrap: { alignItems: 'center', gap: 8, width: '100%' },
  intensityLbl: { fontSize: 12, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  intensityRow: { flexDirection: 'row', gap: 10 },
  intensityDot: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#d0d0d0',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  intensityDotTxt: { fontSize: 15, fontWeight: '700', color: '#888' },
  intensityHint: { fontSize: 12, fontWeight: '600', marginTop: -2 },
  intensityCompare: { fontSize: 13, fontWeight: '600', color: '#27ae60', textAlign: 'center' },

  // ── Always-visible log link ───────────────────────────────────────────────────
  logQuickBtn: { alignItems: 'center', paddingVertical: 10 },
  logQuickBtnTxt: { fontSize: 13, color: '#aaa', fontWeight: '500' },

  // ── Icon rows (quick actions / games / exercises) ─────────────────────────────
  iconRowWrap: { marginHorizontal: -20 },
  iconSeparator: { height: 1, backgroundColor: '#e8eef0', marginHorizontal: 20 },
  iconRow: { paddingHorizontal: 20, gap: 10, paddingVertical: 14 },
  iconPill: {
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
    alignItems: 'center', gap: 6, minWidth: 84,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  iconPillEmoji: { fontSize: 26 },
  iconPillLabel: { fontSize: 12, fontWeight: '600', color: '#333', textAlign: 'center' },
  pickerOverlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  pickerSheet: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '100%', maxHeight: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  pickerSub: { fontSize: 13, color: '#999', marginTop: 2, marginBottom: 12 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pickerTile: {
    width: PICKER_TILE_W, backgroundColor: '#f7fdfd', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#d8eeee',
  },
  pickerTileEmoji: { fontSize: 28 },
  pickerTileTitle: { fontSize: 12, fontWeight: '700', color: '#111', textAlign: 'center', lineHeight: 15 },
  pickerTileBests: { marginTop: 4, alignItems: 'center', gap: 1 },
  pickerTilePB: { fontSize: 10, color: '#0F6E6E', fontWeight: '600' },
  pickerTileGB: { fontSize: 10, color: '#888' },

  // ── Distraction info card ─────────────────────────────────────────────────────
  distractionTipBox: {
    backgroundColor: '#f4fafa', borderRadius: 12, padding: 14,
    marginBottom: 14, gap: 12,
  },
  distractionTipTxt: { fontSize: 14, color: '#444', lineHeight: 21 },
  distractionCallBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  distractionCallBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  distractionDismissBtn: {
    backgroundColor: '#f0f0f0', borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  distractionDismissTxt: { fontSize: 14, fontWeight: '600', color: '#555' },

  // ── Your why ──────────────────────────────────────────────────────────────────
  whyCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
  },
  whyInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  whyText: { flex: 1, gap: 6 },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whyLbl: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  whyEmoji: { fontSize: 18 },
  whyVal: { fontSize: 15, color: '#111', fontWeight: '600' },
  whyPhotoBtn: { alignItems: 'center' },
  whyPhoto: { width: 120, height: 120, borderRadius: 14 },
  whyPhotoBadge: {
    position: 'absolute', bottom: -4, right: -4,
    backgroundColor: '#fff', borderRadius: 8, padding: 2,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  whyPhotoBadgeIcon: { fontSize: 11 },
  whyPhotoEmpty: {
    width: 120, height: 120, borderRadius: 14,
    backgroundColor: '#f0fafa', borderWidth: 1.5, borderColor: '#a8d8d0',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  whyPhotoEmptyTxt: { fontSize: 10, color: '#0F6E6E', fontWeight: '600' },

  // ── Log modal ─────────────────────────────────────────────────────────────────
  logModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  logModalSheet: {
    backgroundColor: '#fff', borderRadius: 24,
    padding: 20, paddingBottom: 24, width: '100%', maxHeight: '88%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 24,
  },
  logModalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0',
    alignSelf: 'center', marginBottom: 16,
  },
  logTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  logExpandedTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 },
  logSub: { fontSize: 13, color: '#888', marginTop: -4 },

  // ── Had a slip overlay ────────────────────────────────────────────────────────
  slipOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', padding: 28,
  },
  slipContent: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    alignItems: 'center', gap: 14, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  slipEmoji: { fontSize: 52 },
  slipTitle: { fontSize: 28, fontWeight: '800', color: '#111', textAlign: 'center' },
  slipBody: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },
  slipResetBtn: {
    borderWidth: 1.5, borderColor: '#e0a0a0', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 24, width: '100%', alignItems: 'center',
    backgroundColor: '#fff8f8',
  },
  slipResetBtnTxt: { fontSize: 14, fontWeight: '600', color: '#c0392b' },
  slipResetDone: {
    backgroundColor: '#f0faf5', borderRadius: 14, paddingVertical: 12,
    paddingHorizontal: 24, width: '100%', alignItems: 'center',
  },
  slipResetDoneTxt: { fontSize: 14, fontWeight: '600', color: '#27ae60' },
  slipLogBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center',
  },
  slipLogBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  slipClose: { marginTop: 16 },
  slipCloseTxt: { fontSize: 14, color: '#bbb' },

  // ── Legacy inline log card (kept for style refs) ──────────────────────────────
  logCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, gap: 10 },
  logCardExpanded: {},
  logBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  logBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5 },
  logBtnGreen: { backgroundColor: '#e6f7f0', borderColor: '#0a7a4e' },
  logBtnRed: { backgroundColor: '#fff5f5', borderColor: '#c0392b' },
  logBtnTxtGreen: { fontSize: 14, fontWeight: '700', color: '#0a7a4e' },
  logBtnTxtRed: { fontSize: 14, fontWeight: '700', color: '#c0392b' },

  // ── Checklist + therapy nav rows ─────────────────────────────────────────────
  checklistBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#d8eeee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  checklistBtnIcon: { fontSize: 24 },
  checklistBtnText: { flex: 1, gap: 2 },
  checklistBtnTitle: { fontSize: 15, fontWeight: '700', color: '#0F6E6E' },
  checklistBtnSub: { fontSize: 12, color: '#888' },
  checklistBtnChevron: { fontSize: 22, color: '#a8d8d0', fontWeight: '300' },

  therapyBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#d8eeee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  therapyBtnIcon: { fontSize: 24 },
  therapyBtnText: { flex: 1, gap: 2 },
  therapyBtnTitle: { fontSize: 15, fontWeight: '700', color: '#0F6E6E' },
  therapyBtnSub: { fontSize: 12, color: '#888' },
  therapyBtnChevron: { fontSize: 22, color: '#a8d8d0', fontWeight: '300' },

  // ── Crisis ────────────────────────────────────────────────────────────────────
  crisisCard: {
    backgroundColor: '#fff8f8', borderRadius: 18, padding: 18, gap: 10,
  },
  crisisTitle: { fontSize: 16, fontWeight: '700', color: '#c0392b' },
  crisisDesc: { fontSize: 14, color: '#555', lineHeight: 20 },
  crisisBtn: { backgroundColor: '#c0392b', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  crisisBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  crisisNote: { fontSize: 12, color: '#888', textAlign: 'center' },

  // ── Game overlay ─────────────────────────────────────────────────────────────
  gameOverlay: { flex: 1, backgroundColor: '#f7f7f7' },
  gameOverlayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  gameOverlayTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  gameOverlayBests: { fontSize: 11, color: '#888', marginTop: 1 },
  gameCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  gameCloseBtnTxt: { fontSize: 15, color: '#555', fontWeight: '600' },

  // ── Inline log form fields ────────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%',
  },
  outcomeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  outcomeBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  outcomeBtnGreen: { backgroundColor: '#e6f7f0', borderColor: '#0a7a4e' },
  outcomeBtnRed: { backgroundColor: '#fff5f5', borderColor: '#c0392b' },
  outcomeBtnTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
  outcomeBtnTxtActive: { color: '#111' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 10 },
  optional: { fontWeight: '400', color: '#aaa' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14,
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  chipActive: { backgroundColor: '#e6f7f7', borderColor: '#0F6E6E' },
  chipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  chipTxtActive: { color: '#0F6E6E' },
  customInput: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111', marginBottom: 16,
  },
  noteInput: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111', minHeight: 80, marginBottom: 16,
  },
  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f5f5f5' },
  cancelBtnTxt: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0F6E6E' },
  saveBtnDisabled: { backgroundColor: '#b0cece' },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // ── Congrats overlay ─────────────────────────────────────────────────────────
  congratsEmoji: { fontSize: 52 },
  congratsTitle: { fontSize: 28, fontWeight: '800', color: '#111', textAlign: 'center' },
  congratsSub: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },
  congratsTime: { fontWeight: '800', color: '#0F6E6E' },
  congratsNote: {
    fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 21,
    backgroundColor: '#f0fafa', borderRadius: 14, padding: 16, width: '100%',
  },

  savedWrap: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  savedIcon: { fontSize: 36, color: '#0a7a4e' },
  savedTxt: { fontSize: 18, fontWeight: '700', color: '#0a7a4e' },
  savedSub: { fontSize: 13, color: '#888' },

  // ── Professional help modal ───────────────────────────────────────────────────
  therapyHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginBottom: 16,
  },
  therapyModalTitle: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' },
  therapyModalSub: { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 4 },
  therapySection: { marginBottom: 8 },
  therapyRegion: { fontSize: 14, fontWeight: '700', color: '#0F6E6E', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 4 },
  therapyItem: { paddingVertical: 12, gap: 4 },
  therapyItemBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  therapyItemName: { fontSize: 14, fontWeight: '700', color: '#111' },
  therapyItemDesc: { fontSize: 12, color: '#888' },
  therapyItemBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  therapyCallBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#ffcdd2' },
  therapyCallBtnTxt: { fontSize: 12, fontWeight: '700', color: '#c0392b' },
  therapyWebBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#e6f7f7', borderWidth: 1, borderColor: '#a8d8d0' },
  therapyWebBtnTxt: { fontSize: 12, fontWeight: '700', color: '#0F6E6E' },
});
