import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CHECKLIST_KEY } from '@/constants/storage-keys';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

interface ChecklistItem {
  id: string;
  title: string;
  desc: string;
}

interface ChecklistSection {
  title: string;
  emoji: string;
  items: ChecklistItem[];
}

const SECTIONS: ChecklistSection[] = [
  {
    title: 'Remove access',
    emoji: '🗑️',
    items: [
      { id: 'delete_apps', title: 'Delete gambling & betting apps', desc: 'Remove all gambling apps from your phone and tablet.' },
      { id: 'remove_cards', title: 'Remove saved payment details', desc: 'Delete stored card info from gambling websites and accounts.' },
      { id: 'delete_accounts', title: 'Close gambling accounts', desc: 'Request account closure from operators where possible.' },
    ],
  },
  {
    title: 'Block access',
    emoji: '🔒',
    items: [
      { id: 'website_blocker', title: 'Install a website blocker', desc: 'Use Gamban, Betfilter, or your browser\'s parental controls to block gambling sites.' },
      { id: 'bank_block', title: 'Block gambling transactions at your bank', desc: 'Call or message your bank to block payments to gambling merchants.' },
      { id: 'spending_limit', title: 'Set a daily spending limit', desc: 'Use your bank app to set a daily card spending cap.' },
    ],
  },
  {
    title: 'Self-exclusion',
    emoji: '🚫',
    items: [
      { id: 'self_exclude_operators', title: 'Self-exclude from operators you\'ve used', desc: 'Log in and request self-exclusion from each gambling site or app.' },
      { id: 'national_exclusion', title: 'Join a national self-exclusion scheme', desc: 'GamStop (UK), SENSE (Australia), GameSense (Canada), or your country\'s equivalent.' },
    ],
  },
  {
    title: 'Support network',
    emoji: '🤝',
    items: [
      { id: 'tell_someone', title: 'Tell one trusted person', desc: 'Share your decision to stop with a partner, family member, or friend.' },
      { id: 'save_helpline', title: 'Save the helpline number', desc: 'Add 1-800-522-4700 (US) or your local helpline to your contacts.' },
    ],
  },
  {
    title: 'Clean your environment',
    emoji: '🧹',
    items: [
      { id: 'unsubscribe_emails', title: 'Unsubscribe from promo emails & texts', desc: 'Opt out of all gambling marketing communications.' },
      { id: 'unfollow_social', title: 'Unfollow gambling accounts', desc: 'Mute or unfollow gambling-related accounts on social media.' },
      { id: 'clear_bookmarks', title: 'Clear gambling bookmarks & history', desc: 'Delete saved gambling sites from your browser.' },
    ],
  },
];

const TOTAL = SECTIONS.reduce((acc, s) => acc + s.items.length, 0);

export default function ChecklistScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CHECKLIST_KEY).then(raw => {
      if (raw) setChecked(JSON.parse(raw));
      setLoaded(true);
    });
  }, []);

  const toggle = async (id: string) => {
    const updated = { ...checked, [id]: !checked[id] };
    setChecked(updated);
    await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(updated));
  };

  const completed = Object.values(checked).filter(Boolean).length;
  const pct = TOTAL > 0 ? completed / TOTAL : 0;

  const progressColor =
    pct === 1 ? c.success :
    pct >= 0.5 ? c.primary :
    c.primaryMid;

  if (!loaded) return null;

  return (
    <View style={s.root}>
      <LinearGradient colors={[c.headerGradStart, c.headerGradEnd]} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
              <Ionicons name="chevron-back" size={24} color={c.white} />
            </Pressable>
            <View style={s.headerText}>
              <Text style={s.headerTitle}>Prevention Checklist</Text>
              <Text style={s.headerSub}>Practical steps to protect your recovery</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>

        <View style={s.progressCard}>
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>
              {completed === TOTAL
                ? 'All steps complete 🎉'
                : `${completed} of ${TOTAL} steps completed`}
            </Text>
            <Text style={[s.progressPct, { color: progressColor }]}>
              {Math.round(pct * 100)}%
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct * 100}%` as any, backgroundColor: progressColor }]} />
          </View>
          {completed === TOTAL && (
            <Text style={s.progressDone}>
              You've taken every step. Your recovery environment is solid.
            </Text>
          )}
        </View>

        {SECTIONS.map(section => (
          <View key={section.title} style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionEmoji}>{section.emoji}</Text>
              <Text style={s.sectionTitle}>{section.title}</Text>
            </View>
            {section.items.map((item, idx) => {
              const done = !!checked[item.id];
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    s.item,
                    done && s.itemDone,
                    idx < section.items.length - 1 && s.itemBorder,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => toggle(item.id)}>
                  <View style={[s.checkbox, done && s.checkboxDone]}>
                    {done && <Ionicons name="checkmark" size={14} color={c.white} />}
                  </View>
                  <View style={s.itemText}>
                    <Text style={[s.itemTitle, done && s.itemTitleDone]}>{item.title}</Text>
                    <Text style={s.itemDesc}>{item.desc}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },

  header: { paddingBottom: 20 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: c.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },

  progressCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 10 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  progressPct: { fontSize: 16, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: c.borderSubtle, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressDone: { fontSize: 13, color: c.success, fontWeight: '500', textAlign: 'center', paddingTop: 4 },

  section: { backgroundColor: c.bgCard, borderRadius: 14, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  sectionEmoji: { fontSize: 18 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: c.textSecondary },

  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  itemDone: { backgroundColor: c.bgTeal },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: c.borderMid,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxDone: { backgroundColor: c.primary, borderColor: c.primary },
  itemText: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  itemTitleDone: { color: c.primary, textDecorationLine: 'line-through' },
  itemDesc: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
});
