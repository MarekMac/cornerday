import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const MOTIVATION_MAP: Record<string, { label: string; emoji: string }> = {
  family:        { label: 'My family',              emoji: '👨‍👩‍👧' },
  finances:      { label: 'My finances',            emoji: '💰' },
  mental_health: { label: 'My mental health',       emoji: '🧠' },
  saving:        { label: 'Saving for something',   emoji: '🎯' },
  better_self:   { label: 'Becoming a better me',   emoji: '✨' },
  break_free:    { label: 'Breaking free for good', emoji: '🔓' },
};

const DISTRACTIONS = [
  { emoji: '🚶', label: 'Go for a walk' },
  { emoji: '📞', label: 'Call someone you trust' },
  { emoji: '🎮', label: 'Play a game' },
  { emoji: '🎵', label: 'Listen to music' },
  { emoji: '🍵', label: 'Make a hot drink' },
];

type BreathPhase = 'idle' | 'inhale' | 'hold' | 'exhale';

export default function UrgeScreen() {
  const [motivation, setMotivation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [breathRunning, setBreathRunning] = useState(false);
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('idle');

  const breathScale = useRef(new Animated.Value(0.5)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchMotivation = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('users').select('motivation').eq('id', user.id).single();
    setMotivation(data?.motivation ?? null);
  }, []);

  useEffect(() => {
    fetchMotivation().finally(() => setLoading(false));
  }, [fetchMotivation]);

  const runCycle = useCallback(() => {
    if (!isMounted.current) return;
    setBreathPhase('inhale');
    Animated.timing(breathScale, {
      toValue: 1, duration: 4000, useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || !isMounted.current) return;
      setBreathPhase('hold');
      holdTimer.current = setTimeout(() => {
        if (!isMounted.current) return;
        setBreathPhase('exhale');
        Animated.timing(breathScale, {
          toValue: 0.5, duration: 4000, useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && isMounted.current) runCycle();
        });
      }, 4000);
    });
  }, [breathScale]);

  const startBreathing = () => {
    breathScale.setValue(0.5);
    setBreathRunning(true);
    runCycle();
  };

  const stopBreathing = () => {
    breathScale.stopAnimation();
    breathScale.setValue(0.5);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setBreathRunning(false);
    setBreathPhase('idle');
  };

  useEffect(() => {
    return () => {
      breathScale.stopAnimation();
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [breathScale]);

  const phaseLabel =
    breathPhase === 'inhale' ? 'Breathe in...' :
    breathPhase === 'hold'   ? 'Hold...' :
    breathPhase === 'exhale' ? 'Breathe out...' :
    'Tap to start';

  const motivations = (motivation ?? '').split(',').filter(Boolean)
    .map(m => MOTIVATION_MAP[m] ?? { label: m, emoji: '💪' });

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0F6E6E" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Urge Support</Text>
            <Text style={s.headerSub}>You've got this. One moment at a time.</Text>
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

        {/* Breathing exercise */}
        <View style={s.breathCard}>
          <Text style={s.cardTitle}>Breathing Exercise</Text>
          <Text style={s.breathDesc}>4 seconds — in, hold, out</Text>
          <View style={s.breathRing}>
            <Animated.View style={[s.breathCircle, { transform: [{ scale: breathScale }] }]} />
            <Text style={s.breathPhaseLabel}>{phaseLabel}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              s.breathBtn,
              breathRunning ? s.breathBtnStop : s.breathBtnStart,
              pressed && { opacity: 0.85 },
            ]}
            onPress={breathRunning ? stopBreathing : startBreathing}>
            <Text style={s.breathBtnTxt}>{breathRunning ? 'Stop' : 'Start breathing'}</Text>
          </Pressable>
        </View>

        {/* Distractions */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Try a distraction</Text>
          {DISTRACTIONS.map((d, i) => (
            <View
              key={d.label}
              style={[s.distractionRow, i < DISTRACTIONS.length - 1 && s.distractionBorder]}>
              <Text style={s.distractionEmoji}>{d.emoji}</Text>
              <Text style={s.distractionLabel}>{d.label}</Text>
            </View>
          ))}
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

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f7f7' },
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

  breathCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center',
  },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 6 },
  breathDesc: { fontSize: 13, color: '#888', marginBottom: 20 },

  breathRing: {
    width: 150, height: 150,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  breathCircle: {
    position: 'absolute',
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: '#e6f7f7',
    borderWidth: 3, borderColor: '#0F6E6E',
  },
  breathPhaseLabel: { fontSize: 15, fontWeight: '600', color: '#0F6E6E', textAlign: 'center' },

  breathBtn: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 24 },
  breathBtnStart: { backgroundColor: '#0F6E6E' },
  breathBtnStop: { backgroundColor: '#888' },
  breathBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  distractionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  distractionBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  distractionEmoji: { fontSize: 22 },
  distractionLabel: { fontSize: 15, color: '#333', fontWeight: '500' },

  crisisCard: {
    backgroundColor: '#fff8f8', borderRadius: 14, padding: 16, gap: 8,
    borderLeftWidth: 4, borderLeftColor: '#c0392b',
  },
  crisisTitle: { fontSize: 16, fontWeight: '700', color: '#c0392b' },
  crisisDesc: { fontSize: 14, color: '#555', lineHeight: 20 },
  crisisBtn: {
    backgroundColor: '#c0392b', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  crisisBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  crisisNote: { fontSize: 12, color: '#888', textAlign: 'center' },
});
