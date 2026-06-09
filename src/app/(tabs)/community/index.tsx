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
import { avatarColor, COMMUNITY_TAGS, streakBadge, TAG_COLORS, timeAgo } from '@/constants/community';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 15;
const ALL_TAGS = ['All', 'Mine', 'Saved', ...COMMUNITY_TAGS] as const;
type FilterTag = typeof ALL_TAGS[number];

interface Post {
  id: string;
  user_id: string;
  content: string;
  tag: string | null;
  reactions_count: number;
  comments_count: number;
  created_at: string;
  is_anonymous: boolean;
  users: { display_name: string | null; streaks: Array<{ current_streak: number }> } | null;
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

const POST_SELECT = 'id, user_id, content, tag, reactions_count, comments_count, created_at, is_anonymous, users(display_name, streaks(current_streak))';

export default function CommunityFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTag, setActiveTag] = useState<FilterTag>('All');
  const [displayName, setDisplayName] = useState('');
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [allEmojiCounts, setAllEmojiCounts] = useState<Record<string, Record<string, number>>>({});
  const [userBookmarks, setUserBookmarks] = useState<Record<string, boolean>>({});

  const currentUserIdRef = useRef<string | null>(null);
  const postsRef = useRef<Post[]>([]);
  const activeFetch = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      currentUserIdRef.current = user.id;
      const { data } = await supabase.from('users').select('display_name').eq('id', user.id).single();
      setDisplayName(data?.display_name ?? '');

      // Load all bookmarks for this user
      const { data: bookmarkRows } = await supabase
        .from('community_bookmarks')
        .select('post_id')
        .eq('user_id', user.id);
      if (bookmarkRows) {
        const bm: Record<string, boolean> = {};
        for (const row of bookmarkRows as { post_id: string }[]) {
          bm[row.post_id] = true;
        }
        setUserBookmarks(bm);
      }
    });
  }, []);

  const fetchReactions = async (postIds: string[], replace: boolean) => {
    if (postIds.length === 0) return;
    const uid = currentUserIdRef.current;
    const { data } = await supabase
      .from('community_reactions')
      .select('post_id, emoji, user_id')
      .in('post_id', postIds);

    const userMap: Record<string, string> = {};
    const countMap: Record<string, Record<string, number>> = {};

    for (const r of (data ?? []) as { post_id: string; emoji: string; user_id: string }[]) {
      if (uid && r.user_id === uid) userMap[r.post_id] = r.emoji;
      if (!countMap[r.post_id]) countMap[r.post_id] = {};
      countMap[r.post_id][r.emoji] = (countMap[r.post_id][r.emoji] ?? 0) + 1;
    }

    setUserReactions(replace ? userMap : prev => ({ ...prev, ...userMap }));
    setAllEmojiCounts(replace ? countMap : prev => ({ ...prev, ...countMap }));
  };

  const load = useCallback(async (tag: FilterTag, isRefresh = false) => {
    if (!isRefresh) setLoading(true);

    if (tag === 'Saved') {
      const uid = currentUserIdRef.current;
      if (!uid) {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const { data: bookmarkRows } = await supabase
        .from('community_bookmarks')
        .select('post_id')
        .eq('user_id', uid);
      const ids = (bookmarkRows ?? []).map((r: { post_id: string }) => r.post_id);
      if (ids.length === 0) {
        postsRef.current = [];
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const { data } = await supabase
        .from('community_posts')
        .select(POST_SELECT)
        .in('id', ids)
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);
      const items = (data as Post[]) ?? [];
      postsRef.current = items;
      setPosts(items);
      setHasMore(items.length === PAGE_SIZE);
      setLoading(false);
      setRefreshing(false);
      fetchReactions(items.map(p => p.id), true);
      return;
    }

    let q = supabase
      .from('community_posts')
      .select(POST_SELECT)
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
    if (activeTag === 'Saved') return; // bookmarks: no infinite scroll
    activeFetch.current = true;
    setLoadingMore(true);
    const offset = postsRef.current.length;
    let q = supabase
      .from('community_posts')
      .select(POST_SELECT)
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

  const toggleFeedReaction = async (postId: string, emoji: string) => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    const current = userReactions[postId];

    if (current === emoji) {
      // Remove
      setUserReactions(prev => { const next = { ...prev }; delete next[postId]; return next; });
      setAllEmojiCounts(prev => ({
        ...prev,
        [postId]: { ...prev[postId], [emoji]: Math.max(0, (prev[postId]?.[emoji] ?? 1) - 1) },
      }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: Math.max(0, p.reactions_count - 1) } : p));
      await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', uid);
    } else if (current) {
      // Switch emoji
      setUserReactions(prev => ({ ...prev, [postId]: emoji }));
      setAllEmojiCounts(prev => ({
        ...prev,
        [postId]: {
          ...prev[postId],
          [current]: Math.max(0, (prev[postId]?.[current] ?? 1) - 1),
          [emoji]: (prev[postId]?.[emoji] ?? 0) + 1,
        },
      }));
      await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', uid);
      await supabase.from('community_reactions').insert({ post_id: postId, user_id: uid, emoji });
    } else {
      // Add
      setUserReactions(prev => ({ ...prev, [postId]: emoji }));
      setAllEmojiCounts(prev => ({
        ...prev,
        [postId]: { ...prev[postId], [emoji]: (prev[postId]?.[emoji] ?? 0) + 1 },
      }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: p.reactions_count + 1 } : p));
      await supabase.from('community_reactions').insert({ post_id: postId, user_id: uid, emoji });
    }
  };

  const toggleBookmark = async (postId: string) => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    const isBookmarked = userBookmarks[postId] ?? false;
    // Optimistic update
    setUserBookmarks(prev => ({ ...prev, [postId]: !isBookmarked }));
    if (isBookmarked) {
      await supabase.from('community_bookmarks').delete().eq('post_id', postId).eq('user_id', uid);
      // Remove from list when viewing Saved tab
      if (activeTag === 'Saved') {
        setPosts(prev => prev.filter(p => p.id !== postId));
        postsRef.current = postsRef.current.filter(p => p.id !== postId);
      }
    } else {
      await supabase.from('community_bookmarks').insert({ post_id: postId, user_id: uid });
    }
  };

  const renderPost = ({ item }: { item: Post }) => {
    const isAnon = item.is_anonymous ?? false;
    const color = isAnon ? '#aaa' : avatarColor(item.user_id);
    const name = isAnon ? 'Anonymous' : (item.users?.display_name ?? 'Anonymous');
    const currentStreak = isAnon ? 0 : (item.users?.streaks?.[0]?.current_streak ?? 0);
    const badge = streakBadge(currentStreak);
    const emojiCounts = allEmojiCounts[item.id] ?? {};
    const emojiEntries = Object.entries(emojiCounts).filter(([, c]) => c > 0);
    const isBookmarked = userBookmarks[item.id] ?? false;

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
            <View style={s.authorRow}>
              <Text style={s.authorName}>{name}</Text>
              {badge ? (
                <View style={s.streakPill}>
                  <Text style={s.streakPillTxt}>{badge}</Text>
                </View>
              ) : null}
            </View>
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
          <View style={s.footerLeft}>
            {emojiEntries.length > 0 ? (
              emojiEntries.map(([emoji, count]) => {
                const isMyReaction = userReactions[item.id] === emoji;
                return (
                  <Pressable
                    key={emoji}
                    style={[s.reactBtn, isMyReaction && s.reactBtnActive]}
                    onPress={() => toggleFeedReaction(item.id, emoji)}
                  >
                    <Text style={[s.reactBtnTxt, isMyReaction && { color: '#0F6E6E' }]}>
                      {emoji} {count}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Pressable
                style={s.reactBtn}
                onPress={() => toggleFeedReaction(item.id, '❤️')}
              >
                <Text style={s.reactBtnTxt}>🤝 React</Text>
              </Pressable>
            )}
            <Text style={s.stat}>💬 {item.comments_count}</Text>
          </View>

          <Pressable
            style={s.bookmarkBtn}
            onPress={(e) => { e.stopPropagation(); toggleBookmark(item.id); }}
            hitSlop={8}
          >
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isBookmarked ? '#0F6E6E' : '#bbb'}
            />
          </Pressable>
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

      <View style={s.tagBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tagRow}>
          {ALL_TAGS.map((t, i) => (
            <Pressable
              key={t}
              style={[s.tagChip, activeTag === t && s.tagChipActive, i === ALL_TAGS.length - 1 && { marginRight: 16 }]}
              onPress={() => changeTag(t)}
            >
              <Text style={[s.tagChipTxt, activeTag === t && s.tagChipTxtActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
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
            ListFooterComponent={loadingMore ? <ActivityIndicator style={s.loadingMore} color="#0F6E6E" /> : null}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>{activeTag === 'Saved' ? '🔖' : '🌱'}</Text>
                <Text style={s.emptyTitle}>
                  {activeTag === 'Mine' ? 'No stories yet' : activeTag === 'Saved' ? 'No saved posts' : 'Be the first to share'}
                </Text>
                <Text style={s.emptySubtitle}>
                  {activeTag === 'Mine'
                    ? 'Your shared stories will appear here.'
                    : activeTag === 'Saved'
                    ? 'Tap the bookmark icon on any post to save it here.'
                    : 'This community is just getting started.\nShare your story and inspire someone today.'}
                </Text>
              </View>
            }
          />
        )}

        <Pressable
          style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(tabs)/community/new-post' as any)}
        >
          <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.fabInner}>
            <Ionicons name="add" size={30} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
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

  tagBar: { paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  tagRow: { paddingLeft: 16, flexDirection: 'row', alignItems: 'center' },
  tagChip: {
    paddingHorizontal: 16, paddingVertical: 8, marginRight: 8,
    borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
    flexShrink: 0,
  },
  tagChipActive: { backgroundColor: '#0F6E6E', borderColor: '#0F6E6E' },
  tagChipTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
  tagChipTxtActive: { color: '#fff' },

  skeletonList: { padding: 16, gap: 12 },
  skeletonCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeletonAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e8e8e8' },
  skeletonLine: { height: 12, backgroundColor: '#e8e8e8', borderRadius: 6, width: '75%' },

  list: { padding: 16, gap: 12, paddingBottom: 100 },
  loadingMore: { paddingVertical: 16 },

  fab: {
    position: 'absolute', bottom: 29, right: 25,
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#0F6E6E', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 6,
  },
  fabInner: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardMeta: { flex: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: { fontSize: 14, fontWeight: '600', color: '#111' },
  streakPill: {
    backgroundColor: '#e6f7f7', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  streakPillTxt: { fontSize: 11, fontWeight: '600', color: '#0F6E6E' },
  timeStr: { fontSize: 12, color: '#999', marginTop: 1 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  tagTxt: { fontSize: 11, fontWeight: '700' },

  content: { fontSize: 14, color: '#333', lineHeight: 21 },
  readMore: { fontSize: 13, color: '#0F6E6E', fontWeight: '600', marginTop: -4 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  reactBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ebebeb',
  },
  reactBtnActive: { backgroundColor: '#e6f7f7', borderColor: '#0F6E6E' },
  reactBtnTxt: { fontSize: 13, color: '#666', fontWeight: '600' },
  stat: { fontSize: 13, color: '#666' },
  bookmarkBtn: { paddingLeft: 8 },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#444', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 21 },
});
