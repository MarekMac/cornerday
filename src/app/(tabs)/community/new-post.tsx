import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COMMUNITY_TAGS, CommunityTag, TAG_COLORS } from '@/constants/community';
import { supabase } from '@/lib/supabase';

const MAX = 500;

export default function NewPost() {
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<CommunityTag | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (!tag) { Alert.alert('Pick a tag', 'Select a tag that fits your story.'); return; }
    if (!content.trim()) { Alert.alert('Empty story', "Your story can't be empty."); return; }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }
    const { error } = await supabase.from('community_posts').insert({
      user_id: user.id,
      content: content.trim(),
      tag,
    });
    setSubmitting(false);
    if (error) { Alert.alert('Error', 'Could not post. Please try again.'); return; }
    router.back();
  };

  const canSubmit = !!tag && content.trim().length > 0 && !submitting;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.root}>
        <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
          <SafeAreaView edges={['top']}>
            <View style={s.headerRow}>
              <Pressable onPress={handleBack} style={s.backBtn}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </Pressable>
              <Text style={s.headerTitle}>Share Your Story</Text>
              <View style={{ width: 30 }} />
            </View>
          </SafeAreaView>
        </LinearGradient>

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
                  <Text style={[s.tagChipTxt, selected && { color: '#fff' }]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[s.label, { marginTop: 8 }]}>Your story</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              multiline
              autoFocus
              placeholder="Share what's on your mind — a win, a struggle, or where you are today..."
              placeholderTextColor="#aaa"
              value={content}
              onChangeText={t => setContent(t.slice(0, MAX))}
              textAlignVertical="top"
            />
            <Text style={[s.charCount, content.length > MAX * 0.9 && { color: '#ea580c' }]}>
              {content.length}/{MAX}
            </Text>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },

  header: { paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  backBtn: { padding: 4 },

  body: { padding: 20, gap: 10, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: '#555' },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  tagChipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },

  inputWrap: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: 2 },
  input: {
    fontSize: 15, color: '#111', lineHeight: 22,
    minHeight: 160, maxHeight: 300,
  },
  charCount: { fontSize: 12, color: '#bbb', textAlign: 'right', marginTop: 8 },

  submitBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#bbb' },
  submitTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
