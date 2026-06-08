import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarColor, COMMUNITY_TAGS, TAG_COLORS, timeAgo } from '@/constants/community';
import { supabase } from '@/lib/supabase';

const ALL_TAGS = ['All', ...COMMUNITY_TAGS] as const;
type FilterTag = typeof ALL_TAGS[number];

interface Post {
  id: string;
  user_id: string;
  content: string;
  tag: string | null;
  reactions_count: number;
  comments_count: number;
  created_at: string;
  users: { display_name: string } | null;
}

export default function CommunityFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTag, setActiveTag] = useState<FilterTag>('All');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('users').select('display_name').eq('id', user.id).single();
      setDisplayName(data?.display_name ?? '');
    });
  }, []);

  const load = useCallback(async (tag: FilterTag, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    let q = supabase
      .from('community_posts')
      .select('id, user_id, content, tag, reactions_count, comments_count, created_at, users(display_name)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (tag !== 'All') q = q.eq('tag', tag);
    const { data } = await q;
    setPosts((data as Post[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(activeTag); }, [activeTag, load]));

  const changeTag = (tag: FilterTag) => {
    setActiveTag(tag);
    load(tag);
  };

  const renderPost = ({ item }: { item: Post }) => {
    const color = avatarColor(item.user_id);
    const name = item.users?.display_name ?? '?';
    return (
      <Pressable
        style={({ pressed }) => [s.card, pressed && { opacity: 0.92 }]}
        onPress={() => router.push(`/(tabs)/community/${item.id}` as any)}
      >
        <View style={s.cardHeader}>
          <View style={[s.avatar, { backgroundColor: color }]}>
            <Text style={s.avatarTxt}>{name[0].toUpperCase()}</Text>
          </View>
          <View style={s.cardMeta}>
            <Text style={s.authorName}>{name}</Text>
            <Text style={s.timeStr}>{timeAgo(item.created_at)}</Text>
          </View>
          {item.tag ? (
            <View style={[s.tagPill, { backgroundColor: (TAG_COLORS[item.tag] ?? '#0F6E6E') + '20' }]}>
              <Text style={[s.tagTxt, { color: TAG_COLORS[item.tag] ?? '#0F6E6E' }]}>{item.tag}</Text>
            </View>
          ) : null}
        </View>
        <Text style={s.content} numberOfLines={3}>{item.content}</Text>
        <View style={s.cardFooter}>
          <Text style={s.stat}>🤝 {item.reactions_count}</Text>
          <Text style={s.stat}>💬 {item.comments_count}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <Text style={s.headerTitle}>Community</Text>
            <Pressable onPress={() => router.push('/(tabs)/community/new-post' as any)} style={s.writeBtn}>
              <Ionicons name="create-outline" size={22} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tagRow}
      >
        {ALL_TAGS.map(t => (
          <Pressable
            key={t}
            style={[s.tagChip, activeTag === t && s.tagChipActive]}
            onPress={() => changeTag(t)}
          >
            <Text style={[s.tagChipTxt, activeTag === t && s.tagChipTxtActive]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#0F6E6E" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          contentContainerStyle={s.list}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(activeTag, true); }}
          ListHeaderComponent={
            <Pressable
              style={({ pressed }) => [s.promptCard, pressed && { opacity: 0.93 }]}
              onPress={() => router.push('/(tabs)/community/new-post' as any)}
            >
              <View style={s.promptTop}>
                <View style={[s.avatar, { backgroundColor: displayName ? avatarColor(displayName) : '#0F6E6E' }]}>
                  <Text style={s.avatarTxt}>{(displayName[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={s.promptPlaceholder}>
                  <Text style={s.promptPlaceholderTxt}>What's on your mind?</Text>
                </View>
              </View>
              <LinearGradient
                colors={['#0F6E6E', '#1a9a9a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.promptBtn}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={s.promptBtnTxt}>Share Your Story</Text>
              </LinearGradient>
            </Pressable>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No stories yet</Text>
              <Text style={s.emptySubtitle}>Be the first to share yours.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },

  header: { paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  writeBtn: { padding: 4 },

  tagRow: { paddingHorizontal: 16, paddingVertical: 7, gap: 8, alignItems: 'center' },
  tagChip: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  tagChipActive: { backgroundColor: '#0F6E6E', borderColor: '#0F6E6E' },
  tagChipTxt: { fontSize: 12, fontWeight: '600', color: '#555' },
  tagChipTxtActive: { color: '#fff' },

  list: { padding: 16, gap: 12, paddingBottom: 40 },

  promptCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 14,
    marginBottom: 4,
  },
  promptTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptPlaceholder: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: '#ebebeb',
  },
  promptPlaceholderTxt: { fontSize: 14, color: '#aaa' },
  promptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  promptBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardMeta: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '600', color: '#111' },
  timeStr: { fontSize: 12, color: '#999', marginTop: 1 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  tagTxt: { fontSize: 11, fontWeight: '700' },

  content: { fontSize: 14, color: '#333', lineHeight: 21 },

  cardFooter: { flexDirection: 'row', gap: 16, paddingTop: 2 },
  stat: { fontSize: 13, color: '#666' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#555' },
  emptySubtitle: { fontSize: 14, color: '#999' },
});
