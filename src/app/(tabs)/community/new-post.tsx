import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticMedium } from '@/lib/haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COMMUNITY_TAGS, CommunityTag, TAG_COLORS } from '@/constants/community';
import { supabase } from '@/lib/supabase';
import { showInterstitialIfReady } from '@/lib/ads';
import { usePurchases } from '@/context/purchases';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

const MAX = 500;

export default function NewPost() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const params = useLocalSearchParams<{ initialContent?: string; initialTag?: string }>();

  const { isPremium } = usePurchases();
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<CommunityTag | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from params (milestone auto-post)
  useEffect(() => {
    if (params.initialContent) {
      setContent(params.initialContent.slice(0, MAX));
    }
    if (params.initialTag && COMMUNITY_TAGS.includes(params.initialTag as CommunityTag)) {
      setTag(params.initialTag as CommunityTag);
    }
  }, []);

  const handleBack = () => {
    if (content.trim().length > 0) {
      Alert.alert('Discard story?', "You'll lose what you've written.", [
        { text: 'Keep writing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (content.trim().length > 0) {
        handleBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [content]);

  const submit = async () => {
    // Synchronous re-entrancy guard — the `disabled` prop on the submit
    // button alone doesn't block a second tap that lands before React
    // re-renders it as disabled, which could insert a duplicate post and
    // also let a fast double-tap slip a 4th post past the hourly rate
    // limit (both reads of recentCount below would see the same pre-insert
    // count).
    if (submitting) return;
    if (!tag) { Alert.alert('Pick a tag', 'Select a tag that fits your story.'); return; }
    if (!content.trim()) { Alert.alert('Empty story', "Your story can't be empty."); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('users').select('is_banned, ban_reason, ban_expires_at, ban_appeal_note').eq('id', user.id).maybeSingle();
      if (profile?.is_banned && (profile.ban_expires_at === null || new Date(profile.ban_expires_at) > new Date())) {
        const lines = ['Your community access is currently restricted.'];
        if (profile.ban_reason) lines.push(`\nReason: ${profile.ban_reason}`);
        lines.push(profile.ban_expires_at
          ? `Until: ${new Date(profile.ban_expires_at).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}`
          : 'Duration: Permanent');
        if (profile.ban_appeal_note) lines.push(`\nTo appeal: ${profile.ban_appeal_note}`);
        Alert.alert('Posting restricted', lines.join('\n'));
        return;
      }
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { count: recentCount } = await supabase
        .from('community_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', oneHourAgo);
      if ((recentCount ?? 0) >= 3) {
        Alert.alert('Slow down', 'You can post up to 3 stories per hour. Try again shortly.');
        return;
      }
      const { error } = await supabase.from('community_posts').insert({
        user_id: user.id,
        content: content.trim(),
        tag,
        is_anonymous: isAnonymous,
      });
      if (error) { Alert.alert('Error', 'Could not post. Please try again.'); return; }
      hapticMedium();
      showInterstitialIfReady(isPremium);
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!tag && content.trim().length > 0 && !submitting;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.root}>
        <View style={[s.header, { backgroundColor: c.headerBg }]}>
          <SafeAreaView edges={['top']}>
            <View style={s.headerRow}>
              <Pressable onPress={handleBack} style={s.backBtn}>
                <Ionicons name="arrow-back" size={22} color={c.white} />
              </Pressable>
              <Text style={s.headerTitle}>Share Your Story</Text>
              <View style={{ width: 30 }} />
            </View>
          </SafeAreaView>
        </View>

        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Pick a tag</Text>
          <View style={s.tagRow}>
            {COMMUNITY_TAGS.map(t => {
              const selected = tag === t;
              return (
                <Pressable
                  key={t}
                  style={[s.tagChip, selected && { backgroundColor: TAG_COLORS[t], borderColor: TAG_COLORS[t] }]}
                  onPress={() => setTag(t)}
                >
                  <Text style={[s.tagChipTxt, selected && { color: c.white }]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[s.label, { marginTop: 8 }]}>Your story</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              multiline
              autoFocus={!params.initialContent}
              placeholder="Share what's on your mind — a win, a struggle, or where you are today..."
              placeholderTextColor={c.textFaint}
              value={content}
              onChangeText={t => setContent(t.slice(0, MAX))}
              textAlignVertical="top"
            />
            <Text style={[s.charCount, content.length > MAX * 0.9 && { color: '#ea580c' }]}>
              {content.length}/{MAX}
            </Text>
          </View>

          {/* Anonymous toggle */}
          <View style={s.anonRow}>
            <View style={s.anonLeft}>
              <Ionicons name="eye-off-outline" size={20} color={c.textBody} />
              <View style={s.anonTextWrap}>
                <Text style={s.anonLabel}>Post anonymously</Text>
                <Text style={s.anonSub}>Your name won&apos;t appear on this post</Text>
              </View>
            </View>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ false: c.borderMid, true: c.primary }}
              thumbColor={c.white}
            />
          </View>

          <Pressable
            style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
            onPress={submit}
            disabled={!canSubmit}
          >
            <Text style={s.submitTxt}>{submitting ? 'Sharing...' : 'Share Story'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },

  header: { paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: c.white },
  backBtn: { padding: 4 },

  body: { padding: 20, gap: 10, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: c.textBody },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.borderMid,
  },
  tagChipTxt: { fontSize: 13, fontWeight: '600', color: c.textBody },

  inputWrap: { backgroundColor: c.bgCard, borderRadius: 16, padding: 14, marginTop: 2 },
  input: {
    fontSize: 15, color: c.textPrimary, lineHeight: 22,
    minHeight: 160, maxHeight: 300,
  },
  charCount: { fontSize: 12, color: c.textDisabled, textAlign: 'right', marginTop: 8 },

  anonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.bgCard, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    marginTop: 4,
  },
  anonLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  anonTextWrap: { flex: 1 },
  anonLabel: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  anonSub: { fontSize: 12, color: c.textFaint, marginTop: 1 },

  submitBtn: {
    backgroundColor: c.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: c.textFaint },
  submitTxt: { color: c.white, fontWeight: '700', fontSize: 16 },
});
