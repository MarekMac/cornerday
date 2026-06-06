import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type GameKey, GAMES, renderGame } from './games';
import { type ExerciseKey, EXERCISES, renderExercise } from './exercises';

const { width: SCREEN_W } = Dimensions.get('window');
// body padding (16×2=32) + section padding (16×2=32) + 2 gaps (8×2=16) + 4px buffer = 84
const GAME_TILE_W = Math.floor((SCREEN_W - 84) / 3);
// picker overlay has only its own padding (16×2=32) + 2 gaps (8×2=16) + 4px buffer = 52
const PICKER_TILE_W = Math.floor((SCREEN_W - 52) / 3);

import AsyncStorage from '@react-native-async-storage/async-storage';

import { TRUSTED_CONTACT_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';

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
  {
    region: '🌍 International',
    items: [
      { name: 'Gambling Therapy', desc: 'Free online support in multiple languages', web: 'https://www.gamblingtherapy.org' },
      { name: 'Gamblers Anonymous', desc: 'Worldwide peer support meetings', web: 'https://www.gamblersanonymous.org' },
    ],
  },
];

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

  // Log urge modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [customTrigger, setCustomTrigger] = useState('');
  const [outcome, setOutcome] = useState<'overcame' | 'slipped' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [therapyModalVisible, setTherapyModalVisible] = useState(false);
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [trustedContact, setTrustedContact] = useState<{ name: string; phone: string } | null>(null);
  const [expandedDistraction, setExpandedDistraction] = useState<string | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseKey | null>(null);
  const [showGamePicker, setShowGamePicker] = useState(false);

  const isMounted = useRef(true);

  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  const fetchMotivation = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data }, rawContact] = await Promise.all([
      supabase.from('users').select('motivation').eq('id', user.id).single(),
      AsyncStorage.getItem(TRUSTED_CONTACT_KEY),
    ]);
    setMotivation(data?.motivation ?? null);
    if (rawContact) setTrustedContact(JSON.parse(rawContact));
  }, []);

  useEffect(() => { fetchMotivation().finally(() => setLoading(false)); }, [fetchMotivation]);

  const openLog = (presetOutcome: 'overcame' | 'slipped') => {
    setOutcome(presetOutcome);
    setSelectedTrigger(null);
    setCustomTrigger('');
    setNote('');
    setSaved(false);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
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
      await supabase.from('urge_journal').insert({
        user_id: user.id, trigger: triggerValue, outcome,
        note: note.trim() || null,
      });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(closeModal, 1200);
  };

  const canSave = selectedTrigger !== null && outcome !== null &&
    (selectedTrigger !== 'other' || customTrigger.trim().length > 0);

  const handleDistraction = (d: typeof DISTRACTIONS[0]) => {
    if (d.action === 'expand') {
      setExpandedDistraction(prev => prev === d.label ? null : d.label);
    } else if (d.action === 'call') {
      if (trustedContact?.phone) {
        Linking.openURL(`tel:${trustedContact.phone}`);
      } else {
        Alert.alert(
          'No contact saved',
          'Add a trusted contact in Account settings to enable quick calling.',
          [
            { text: 'Go to Settings', onPress: () => router.push('/(tabs)/account') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } else if (d.action === 'music') {
      Linking.openURL('music://').catch(() =>
        Linking.openURL('spotify://').catch(() =>
          Alert.alert('Open your music app', 'Put on something you love — music shifts your mood fast.')
        )
      );
    } else if (d.action === 'game') {
      setShowGamePicker(true);
    }
  };

  const motivations = (motivation ?? '').split(',').filter(Boolean)
    .map(m => MOTIVATION_MAP[m] ?? { label: m, emoji: '💪' });

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

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>

        {/* Your why */}
        <View style={s.whyCard}>
          <View style={s.whyText}>
            <Text style={s.whyLbl}>Remember your why</Text>
            {motivations.map((m, i) => (
              <View key={i} style={s.whyRow}>
                <Text style={s.whyEmoji}>{m.emoji}</Text>
                <Text style={s.whyVal}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={s.sectionHeader}>Right now</Text>

        {/* Distractions — actionable */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Try a distraction</Text>
          {DISTRACTIONS.map((d, i) => {
            const isLast = i === DISTRACTIONS.length - 1;
            const isExpanded = expandedDistraction === d.label;
            const isCall = d.action === 'call';
            const callLabel = trustedContact?.name ? `📞 Call ${trustedContact.name}` : '📞 Call';
            return (
              <View key={d.label}>
                <Pressable
                  style={[s.distractionRow, !isLast && !isExpanded && s.distractionBorder]}
                  onPress={() => handleDistraction(d)}>
                  <Text style={s.distractionEmoji}>{d.emoji}</Text>
                  <View style={s.distractionText}>
                    <Text style={s.distractionLabel}>{d.label}</Text>
                    <Text style={s.distractionSub}>{d.sub}</Text>
                  </View>
                  {isCall && trustedContact?.phone ? (
                    <View style={s.callBtn}>
                      <Text style={s.callBtnTxt}>{callLabel}</Text>
                    </View>
                  ) : isCall && !trustedContact?.phone ? (
                    <Text style={s.distractionLink}>Set up ›</Text>
                  ) : (
                    <Text style={s.distractionArrow}>{isExpanded ? '∨' : '›'}</Text>
                  )}
                </Pressable>
                {isExpanded && 'tip' in d && (
                  <Text style={[s.distractionTip, !isLast && s.distractionBorder]}>
                    {d.tip}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Focus games grid */}
        <View style={s.gamesSection}>
          <Text style={s.gamesSectionTitle}>Focus Games</Text>
          <Text style={s.gamesSectionSub}>Engage your mind, ease the urge</Text>
          <View style={s.gamesGrid}>
            {GAMES.map(game => (
              <Pressable
                key={game.key}
                style={({ pressed }) => [s.gameTile, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}
                onPress={() => setActiveGame(game.key)}>
                <Text style={s.gameTileEmoji}>{game.emoji}</Text>
                <Text style={s.gameTileTitle}>{game.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Exercises grid */}
        <View style={s.gamesSection}>
          <Text style={s.gamesSectionTitle}>Guided Exercises</Text>
          <Text style={s.gamesSectionSub}>Mindfulness and grounding techniques</Text>
          <View style={s.gamesGrid}>
            {EXERCISES.map(ex => (
              <Pressable
                key={ex.key}
                style={({ pressed }) => [s.gameTile, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}
                onPress={() => setActiveExercise(ex.key)}>
                <Text style={s.gameTileEmoji}>{ex.emoji}</Text>
                <Text style={s.gameTileTitle}>{ex.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={s.sectionHeader}>When you're ready</Text>

        {/* Log a moment */}
        <View style={s.logCard}>
          <Text style={s.logTitle}>Log a moment</Text>
          <Text style={s.logSub}>Record how you handled it</Text>
          <View style={s.logBtns}>
            <Pressable
              style={({ pressed }) => [s.logBtn, s.logBtnGreen, pressed && { opacity: 0.85 }]}
              onPress={() => openLog('overcame')}>
              <Text style={s.logBtnTxtGreen}>Overcame it ✓</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.logBtn, s.logBtnRed, pressed && { opacity: 0.85 }]}
              onPress={() => openLog('slipped')}>
              <Text style={s.logBtnTxtRed}>Had a slip</Text>
            </Pressable>
          </View>
        </View>

        {/* Prevention checklist */}
        <Pressable
          style={({ pressed }) => [s.checklistBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(tabs)/urge/checklist')}>
          <Text style={s.checklistBtnIcon}>✅</Text>
          <View style={s.checklistBtnText}>
            <Text style={s.checklistBtnTitle}>Prevention checklist</Text>
            <Text style={s.checklistBtnSub}>Practical steps to protect your recovery</Text>
          </View>
          <Text style={s.checklistBtnChevron}>›</Text>
        </Pressable>

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

      {/* Game + Exercise picker overlay */}
      {showGamePicker && (
        <View style={StyleSheet.absoluteFill}>
          <SafeAreaView style={s.gameOverlay} edges={['top', 'bottom']}>
            <View style={s.gameOverlayHeader}>
              <Text style={s.gameOverlayTitle}>Pick an activity</Text>
              <Pressable style={s.gameCloseBtn} onPress={() => setShowGamePicker(false)}>
                <Text style={s.gameCloseBtnTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.pickerContent}>
              <Text style={s.pickerSectionTitle}>Focus Games</Text>
              <Text style={s.gamesSectionSub}>Engage your mind, ease the urge</Text>
              <View style={s.pickerGrid}>
                {GAMES.map(game => (
                  <Pressable
                    key={game.key}
                    style={({ pressed }) => [s.pickerTile, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}
                    onPress={() => setActiveGame(game.key)}>
                    <Text style={s.gameTileEmoji}>{game.emoji}</Text>
                    <Text style={s.gameTileTitle}>{game.title}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[s.pickerSectionTitle, { marginTop: 8 }]}>Guided Exercises</Text>
              <Text style={s.gamesSectionSub}>Mindfulness and grounding techniques</Text>
              <View style={s.pickerGrid}>
                {EXERCISES.map(ex => (
                  <Pressable
                    key={ex.key}
                    style={({ pressed }) => [s.pickerTile, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}
                    onPress={() => setActiveExercise(ex.key)}>
                    <Text style={s.gameTileEmoji}>{ex.emoji}</Text>
                    <Text style={s.gameTileTitle}>{ex.title}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Game overlay */}
      {activeGame !== null && (
        <View style={StyleSheet.absoluteFill}>
          <SafeAreaView style={s.gameOverlay} edges={['top', 'bottom']}>
            <View style={s.gameOverlayHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>{GAMES.find(g => g.key === activeGame)?.emoji}</Text>
                <Text style={s.gameOverlayTitle}>{GAMES.find(g => g.key === activeGame)?.title}</Text>
              </View>
              <Pressable style={s.gameCloseBtn} onPress={() => setActiveGame(null)}>
                <Text style={s.gameCloseBtnTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {renderGame(activeGame)}
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

      {/* Log moment modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}>
        <View style={s.modalOverlay}>
          <Pressable style={s.modalBackdrop} onPress={closeModal} />
          <View style={s.sheet}>
            
            {saved ? (
              <View style={s.savedWrap}>
                <Text style={s.savedIcon}>✓</Text>
                <Text style={s.savedTxt}>Saved</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.sheetTitle}>What happened?</Text>

                {/* Outcome toggle */}
                <View style={s.outcomeRow}>
                  <Pressable
                    style={[s.outcomeBtn, outcome === 'overcame' && s.outcomeBtnGreen]}
                    onPress={() => setOutcome('overcame')}>
                    <Text style={[s.outcomeBtnTxt, outcome === 'overcame' && s.outcomeBtnTxtActive]}>
                      Overcame it ✓
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[s.outcomeBtn, outcome === 'slipped' && s.outcomeBtnRed]}
                    onPress={() => setOutcome('slipped')}>
                    <Text style={[s.outcomeBtnTxt, outcome === 'slipped' && s.outcomeBtnTxtActive]}>
                      Had a slip
                    </Text>
                  </Pressable>
                </View>

                <Text style={s.fieldLabel}>What triggered it?</Text>
                <View style={s.chipsWrap}>
                  {TRIGGERS.map(t => (
                    <Pressable
                      key={t.key}
                      style={[s.chip, selectedTrigger === t.key && s.chipActive]}
                      onPress={() => setSelectedTrigger(t.key)}>
                      <Text style={[s.chipTxt, selectedTrigger === t.key && s.chipTxtActive]}>
                        {t.label}
                      </Text>
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

                <View style={s.sheetActions}>
                  <Pressable
                    style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7 }]}
                    onPress={closeModal}>
                    <Text style={s.cancelBtnTxt}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      s.saveBtn, !canSave && s.saveBtnDisabled,
                      pressed && canSave && { opacity: 0.85 },
                    ]}
                    onPress={saveEntry}
                    disabled={!canSave || saving}>
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.saveBtnTxt}>Save entry</Text>}
                  </Pressable>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingBottom: 20 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  whyCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#0F6E6E',
  },
  whyEmoji: { fontSize: 18 },
  whyText: { gap: 6 },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whyLbl: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  whyVal: { fontSize: 15, color: '#111', fontWeight: '600' },

  logCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  logTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  logSub: { fontSize: 13, color: '#888', marginTop: -4 },
  logBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  logBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5 },
  logBtnGreen: { backgroundColor: '#e6f7f0', borderColor: '#0a7a4e' },
  logBtnRed: { backgroundColor: '#fff5f5', borderColor: '#c0392b' },
  logBtnTxtGreen: { fontSize: 14, fontWeight: '700', color: '#0a7a4e' },
  logBtnTxtRed: { fontSize: 14, fontWeight: '700', color: '#c0392b' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 6 },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 4, marginBottom: -4, paddingHorizontal: 2,
  },

  distractionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  distractionBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  distractionEmoji: { fontSize: 22 },
  distractionText: { flex: 1, gap: 1 },
  distractionLabel: { fontSize: 15, color: '#333', fontWeight: '600' },
  distractionSub: { fontSize: 12, color: '#aaa' },
  distractionArrow: { fontSize: 20, color: '#ccc', fontWeight: '300' },
  distractionLink: { fontSize: 13, color: '#0F6E6E', fontWeight: '600' },
  distractionTip: {
    fontSize: 13, color: '#555', lineHeight: 19,
    backgroundColor: '#f4fafa', borderRadius: 8, padding: 10, marginBottom: 10,
  },
  callBtn: {
    backgroundColor: '#e6f7f0', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#a8d8c0',
  },
  callBtnTxt: { fontSize: 13, fontWeight: '700', color: '#0a7a4e' },

  crisisCard: {
    backgroundColor: '#fff8f8', borderRadius: 14, padding: 16, gap: 8,
    borderLeftWidth: 4, borderLeftColor: '#c0392b',
  },
  crisisTitle: { fontSize: 16, fontWeight: '700', color: '#c0392b' },
  crisisDesc: { fontSize: 14, color: '#555', lineHeight: 20 },
  crisisBtn: { backgroundColor: '#c0392b', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  crisisBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  crisisNote: { fontSize: 12, color: '#888', textAlign: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, maxHeight: '85%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },

  outcomeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
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
    padding: 12, fontSize: 14, color: '#111', minHeight: 80, marginBottom: 20,
  },
  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f5f5f5' },
  cancelBtnTxt: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0F6E6E' },
  saveBtnDisabled: { backgroundColor: '#b0cece' },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  savedWrap: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  savedIcon: { fontSize: 40, color: '#0a7a4e' },
  savedTxt: { fontSize: 18, fontWeight: '700', color: '#0a7a4e' },

  checklistBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#a8d8d0',
  },
  checklistBtnIcon: { fontSize: 24 },
  checklistBtnText: { flex: 1, gap: 2 },
  checklistBtnTitle: { fontSize: 15, fontWeight: '700', color: '#0F6E6E' },
  checklistBtnSub: { fontSize: 12, color: '#888' },
  checklistBtnChevron: { fontSize: 22, color: '#a8d8d0', fontWeight: '300' },

  therapyBtn: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#a8d8d0',
  },
  therapyBtnIcon: { fontSize: 24 },
  therapyBtnText: { flex: 1, gap: 2 },
  therapyBtnTitle: { fontSize: 15, fontWeight: '700', color: '#0F6E6E' },
  therapyBtnSub: { fontSize: 12, color: '#888' },
  therapyBtnChevron: { fontSize: 22, color: '#a8d8d0', fontWeight: '300' },

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

  // Game/exercise picker
  pickerContent: { padding: 16, paddingBottom: 32, gap: 8 },
  pickerSectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerTile: {
    width: PICKER_TILE_W, backgroundColor: '#f4fafa', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#d4eeee',
  },

  // Focus games
  gamesSection: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  gamesSectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  gamesSectionSub: { fontSize: 12, color: '#888', marginBottom: 14 },
  gamesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gameTile: {
    width: GAME_TILE_W, backgroundColor: '#f4fafa', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#d4eeee',
  },
  gameTileEmoji: { fontSize: 28 },
  gameTileTitle: { fontSize: 10, fontWeight: '700', color: '#0F6E6E', textAlign: 'center', lineHeight: 13 },

  // Game overlay
  gameOverlay: { flex: 1, backgroundColor: '#f5f5f5' },
  gameOverlayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  gameOverlayTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  gameCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  gameCloseBtnTxt: { fontSize: 15, color: '#555', fontWeight: '600' },
});
