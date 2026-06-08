import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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

const PAGE_SIZE = 15;
const ALL_TAGS = ['All', 'Mine', ...COMMUNITY_TAGS] as const;
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

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[s.skeletonCard, { opacity }]}>
      <View style={s.skeletonHeader}>
        <View style={s.skeletonAvatar} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={s.skeletonLine} />
          <View style={[s.skeletonLine, { width: '45%' }]} />
        </View>
      </View>
      <View style={[s.skeletonLine, { height: 13, marginTop: 2 }]} />
      <View style={[s.skeletonLine, { height: 13, width: '88%' }]} />
      <View style={[s.skeletonLine, { height: 13, width: '65%' }]} />
      <View style={[s.skeletonLine, { width: '40%', height: 12, marginTop: 4 }]} />
    </Animated.View>
  );
}

export default function CommunityFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTag, setActiveTag] = useState<FilterTag>('All');
  const [displayName, setDisplayName] = useState('');
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});

  const currentUserIdRef = useRef<string | null>(null);
  const postsRef = useRef<Post[]>([]);
  const activeFetch = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      currentUserIdRef.current = user.id;
      const { data } = await supabase.from('users').select('display_name').eq('id', user.id).single();
      setDisplayName(data?.display_name ?? '');
    });
  }, []);

  const fetchReactions = async (postIds: string[], replace: boolean) => {
    const uid = currentUserIdRef.current;
    if (!uid || postIds.length === 0) return;
    const { data } = await supabase
      .from('community_reactions')
      .select('post_id, emoji')
      .eq('user_id', uid)
      .in('post_id', postIds);
    const map: Record<string, string> = {};
    for (const r of (data ?? []) as { post_id: string; emoji: string }[]) map[r.post_id] = r.emoji;
    setUserReactions(replace ? map : prev => ({ ...prev, ...map }));
  };

  const load = useCallback(async (tag: FilterTag, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    let q = supabase
      .from('community_posts')
      .select('id, user_id, content, tag, reactions_count, comments_count, created_at, users(display_name)')
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (tag === 'Mine' && currentUserIdRef.current) q = (q as any).eq('user_id', currentUserIdRef.current);
    else if (tag !== 'All') q = (q as any).eq('tag', tag);
    const { data } = await q;
    const items = (data as Post[]) ?? [];
    postsRef.current = items;
    setPosts(items);
    setHasMore(items.length === PAGE_SIZE);
    setLoading(false);
    setRefreshing(false);
    fetchReactions(items.map(p => p.id), true);
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore || activeFetch.current) return;
    activeFetch.current = true;
    setLoadingMore(true);
    const offset = postsRef.current.length;
    let q = supabase
      .from('community_posts')
      .select('id, user_id, content, tag, reactions_count, comments_count, created_at, users(display_name)')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (activeTag === 'Mine' && currentUserIdRef.current) q = (q as any).eq('user_id', currentUserIdRef.current);
    else if (activeTag !== 'All') q = (q as any).eq('tag', activeTag);
    const { data } = await q;
    const items = (data as Post[]) ?? [];
    const next = [...postsRef.current, ...items];
    postsRef.current = next;
    setPosts(next);
    setHasMore(items.length === PAGE_SIZE);
    setLoadingMore(false);
    activeFetch.current = false;
    fetchReactions(items.map(p => p.id), false);
  };

  useFocusEffect(useCallback(() => { load(activeTag); }, [activeTag, load]));

  const changeTag = (tag: FilterTag) => {
    setActiveTag(tag);
    load(tag);
  };

  const toggleFeedReaction = async (postId: string) => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    const current = userReactions[postId];
    if (current) {
      setUserReactions(prev => { const next = { ...prev }; delete next[postId]; return next; });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: Math.max(0, p.reactions_count - 1) } : p));
      await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', uid);
    } else {
      setUserReactions(prev => ({ ...prev, [postId]: '🤝' }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: p.reactions_count + 1 } : p));
      await supabase.from('community_reactions').insert({ post_id: postId, user_id: uid, emoji: '🤝' });
    }
  };

  const renderPost = ({ item }: { item: Post }) => {
    const color = avatarColor(item.user_id);
    const name = item.users?.display_name ?? '?';
    const reacted = !!userReactions[item.id];
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
        {item.content.length > 120 && <Text style={s.readMore}>Read more</Text>}

        <View style={s.cardFooter}>
          <Pressable
            style={[s.reactBtn, reacted && s.reactBtnActive]}
            onPress={() => toggleFeedReaction(item.id)}
          >
            <Text style={[s.reactBtnTxt, reacted && { color: '#0F6E6E' }]}>
              {userReactions[item.id] ?? '🤝'}{item.reactions_count > 0 ? ` ${item.reactions_count}` : ''}
            </Text>
          </Pressable>
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
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tagRow}>
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
        <View style={s.skeletonList}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          contentContainerStyle={s.list}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(activeTag, true); }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <Pressable
              style={({ pressed }) => [s.promptCard, pressed && { opacity: 0.93 }]}
              onPress={() => router.push('/(tabs)/community/new-post' as any)}
            >
              <View style={s.promptTop}>
                <View style={[s.avatar, { backgroundColor: currentUserIdRef.current ? avatarColor(currentUserIdRef.current) : '#0F6E6E' }]}>
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
                <Text style={s.promptBtnTxt}>Write a Post</Text>
              </LinearGradient>
            </Pressable>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={s.loadingMore} color="#0F6E6E" /> : null}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🌱</Text>
              <Text style={s.emptyTitle}>
                {activeTag === 'Mine' ? 'No stories yet' : 'Be the first to share'}
              </Text>
              <Text style={s.emptySubtitle}>
                {activeTag === 'Mine'
                  ? 'Your shared stories will appear here.'
                  : 'This community is just getting started.\nShare your story and inspire someone today.'}
              </Text>
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

  tagRow: { paddingHorizontal: 16, paddingVertical: 9, gap: 8, alignItems: 'center' },
  tagChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  tagChipActive: { backgroundColor: '#0F6E6E', borderColor: '#0F6E6E' },
  tagChipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  tagChipTxtActive: { color: '#fff' },

  skeletonList: { padding: 16, gap: 12 },
  skeletonCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeletonAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e8e8e8' },
  skeletonLine: { height: 12, backgroundColor: '#e8e8e8', borderRadius: 6, width: '75%' },

  list: { padding: 16, gap: 12, paddingBottom: 40 },
  loadingMore: { paddingVertical: 16 },

  promptCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 14, marginBottom: 4 },
  promptTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptPlaceholder: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#ebebeb',
  },
  promptPlaceholderTxt: { fontSize: 14, color: '#aaa' },
  promptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  promptBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardMeta: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '600', color: '#111' },
  timeStr: { fontSize: 12, color: '#999', marginTop: 1 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  tagTxt: { fontSize: 11, fontWeight: '700' },

  content: { fontSize: 14, color: '#333', lineHeight: 21 },
  readMore: { fontSize: 13, color: '#0F6E6E', fontWeight: '600', marginTop: -4 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 2 },
  reactBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ebebeb',
  },
  reactBtnActive: { backgroundColor: '#e6f7f7', borderColor: '#0F6E6E' },
  reactBtnTxt: { fontSize: 13, color: '#666', fontWeight: '600' },
  stat: { fontSize: 13, color: '#666' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#444', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 21 },
});
