import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarColor, COMMUNITY_TAGS, streakBadge, TAG_COLORS, timeAgo } from '@/constants/community';
import { COMMUNITY_GUIDELINES_SEEN_KEY } from '@/constants/storage-keys';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

const PAGE_SIZE = 15;
const ALL_TAGS = ['All', 'Mine', 'Saved', ...COMMUNITY_TAGS] as const;
type FilterTag = typeof ALL_TAGS[number];
type SortBy = 'new' | 'popular';

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
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
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
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTag, setActiveTag] = useState<FilterTag>('All');
  const [sortBy, setSortBy] = useState<SortBy>('new');
  const { isAdmin } = useUser();
  const [displayName, setDisplayName] = useState('');
  const [banInfo, setBanInfo] = useState<{ is_banned: boolean; ban_reason: string | null; ban_expires_at: string | null; ban_appeal_note: string | null } | null>(null);
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [allEmojiCounts, setAllEmojiCounts] = useState<Record<string, Record<string, number>>>({});
  const [userBookmarks, setUserBookmarks] = useState<Record<string, boolean>>({});
  const [guidelinesVisible, setGuidelinesVisible] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const currentUserIdRef = useRef<string | null>(null);
  const postsRef = useRef<Post[]>([]);
  const activeFetch = useRef(false);
  const sortByRef = useRef<SortBy>('new');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      currentUserIdRef.current = user.id;
      const { data } = await supabase.from('users').select('display_name, is_banned, ban_reason, ban_expires_at, ban_appeal_note').eq('id', user.id).single();
      setDisplayName(data?.display_name ?? '');
      if (data) setBanInfo({ is_banned: data.is_banned ?? false, ban_reason: data.ban_reason, ban_expires_at: data.ban_expires_at, ban_appeal_note: data.ban_appeal_note });

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

    AsyncStorage.getItem(COMMUNITY_GUIDELINES_SEEN_KEY).then(val => {
      if (val !== 'true') setGuidelinesVisible(true);
    });
  }, []);

  const dismissGuidelines = async () => {
    await AsyncStorage.setItem(COMMUNITY_GUIDELINES_SEEN_KEY, 'true');
    setGuidelinesVisible(false);
  };

  const changeSort = (sort: SortBy) => {
    sortByRef.current = sort;
    setSortBy(sort);
    load(activeTag, sort);
  };

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

  const load = useCallback(async (tag: FilterTag, sort: SortBy = 'new', isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      if (tag === 'Saved') {
        const uid = currentUserIdRef.current;
        if (!uid) {
          setPosts([]);
          setHasMore(false);
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
          return;
        }
        let q: any = supabase.from('community_posts').select(POST_SELECT).in('id', ids);
        if (sort === 'popular') {
          q = q.order('reactions_count', { ascending: false }).order('comments_count', { ascending: false });
        } else {
          q = q.order('created_at', { ascending: false });
        }
        q = q.range(0, PAGE_SIZE - 1);
        const { data } = await q;
        const items = (data as Post[]) ?? [];
        postsRef.current = items;
        setPosts(items);
        setHasMore(items.length === PAGE_SIZE);
        fetchReactions(items.map(p => p.id), true);
        return;
      }

      let q: any = supabase.from('community_posts').select(POST_SELECT);
      if (sort === 'popular') {
        q = q.order('reactions_count', { ascending: false }).order('comments_count', { ascending: false });
      } else {
        q = q.order('created_at', { ascending: false });
      }
      q = q.range(0, PAGE_SIZE - 1);
      if (tag === 'Mine' && currentUserIdRef.current) {
        q = q.eq('user_id', currentUserIdRef.current).eq('is_anonymous', false);
      } else if (tag !== 'All') q = q.eq('tag', tag);

      const { data } = await q;
      const items = (data as Post[]) ?? [];
      postsRef.current = items;
      setPosts(items);
      setHasMore(items.length === PAGE_SIZE);
      fetchReactions(items.map(p => p.id), true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore || activeFetch.current) return;
    if (activeTag === 'Saved') return;
    activeFetch.current = true;
    setLoadingMore(true);
    try {
      const offset = postsRef.current.length;
      const sort = sortByRef.current;
      let q: any = supabase.from('community_posts').select(POST_SELECT);
      if (sort === 'popular') {
        q = q.order('reactions_count', { ascending: false }).order('comments_count', { ascending: false });
      } else {
        q = q.order('created_at', { ascending: false });
      }
      q = q.range(offset, offset + PAGE_SIZE - 1);
      if (activeTag === 'Mine' && currentUserIdRef.current) {
        q = q.eq('user_id', currentUserIdRef.current).eq('is_anonymous', false);
      } else if (activeTag !== 'All') q = q.eq('tag', activeTag);
      const { data } = await q;
      const items = (data as Post[]) ?? [];
      const next = [...postsRef.current, ...items];
      postsRef.current = next;
      setPosts(next);
      setHasMore(items.length === PAGE_SIZE);
      fetchReactions(items.map(p => p.id), false);
    } finally {
      setLoadingMore(false);
      activeFetch.current = false;
    }
  };

  useFocusEffect(useCallback(() => { load(activeTag, sortByRef.current); }, [activeTag, load]));

  const changeTag = (tag: FilterTag) => {
    setActiveTag(tag);
    load(tag, sortByRef.current);
  };

  const toggleFeedReaction = async (postId: string, emoji: string) => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    const current = userReactions[postId];

    if (current === emoji) {
      setUserReactions(prev => { const next = { ...prev }; delete next[postId]; return next; });
      setAllEmojiCounts(prev => ({
        ...prev,
        [postId]: { ...prev[postId], [emoji]: Math.max(0, (prev[postId]?.[emoji] ?? 1) - 1) },
      }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: Math.max(0, p.reactions_count - 1) } : p));
      await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', uid);
    } else if (current) {
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
    setUserBookmarks(prev => ({ ...prev, [postId]: !isBookmarked }));
    if (isBookmarked) {
      await supabase.from('community_bookmarks').delete().eq('post_id', postId).eq('user_id', uid);
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
                    <Text style={[s.reactBtnTxt, isMyReaction && { color: c.primary }]}>
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
              color={isBookmarked ? c.primary : c.textFaint}
            />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={[c.headerGradStart, c.headerGradEnd]} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <Text style={s.headerTitle}>Community</Text>
            {isAdmin && (
              <Pressable
                onPress={() => router.push('/moderation' as any)}
                hitSlop={10}
                style={({ pressed }) => [s.moderateBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="shield-outline" size={20} color={c.white} />
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={s.tagBar}>
        {/* Sort button */}
        <View style={s.sortBtnWrap}>
          <Pressable
            style={[s.sortCircle, sortOpen && s.sortCircleActive]}
            onPress={() => setSortOpen(v => !v)}
            hitSlop={6}
          >
            <Ionicons name="swap-vertical-outline" size={16} color={sortOpen ? '#fff' : c.textBody} />
          </Pressable>

          {sortOpen && (
            <>
              {/* Tap-outside overlay */}
              <Pressable style={s.sortOverlay} onPress={() => setSortOpen(false)} />
              <View style={s.sortDropdown}>
                {(['new', 'popular'] as SortBy[]).map(opt => (
                  <Pressable
                    key={opt}
                    style={[s.sortOption, sortBy === opt && s.sortOptionActive]}
                    onPress={() => { changeSort(opt); setSortOpen(false); }}
                  >
                    <Text style={[s.sortOptionTxt, sortBy === opt && s.sortOptionTxtActive]}>
                      {opt === 'new' ? '✨  New' : '🔥  Popular'}
                    </Text>
                    {sortBy === opt && (
                      <Ionicons name="checkmark" size={15} color={c.primary} />
                    )}
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Vertical divider */}
        <View style={s.tagBarDivider} />

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

      {banInfo?.is_banned && (
        <View style={s.banNotice}>
          <Text style={s.banNoticeTitle}>⛔ Community access restricted</Text>
          {!!banInfo.ban_reason && <Text style={s.banNoticeRow}><Text style={s.banNoticeLabel}>Reason: </Text>{banInfo.ban_reason}</Text>}
          <Text style={s.banNoticeRow}>
            <Text style={s.banNoticeLabel}>Duration: </Text>
            {banInfo.ban_expires_at
              ? (() => {
                  const ms = new Date(banInfo.ban_expires_at).getTime() - Date.now();
                  const days = Math.floor(ms / 86400000);
                  const hours = Math.floor((ms % 86400000) / 3600000);
                  const remaining = days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : hours > 0 ? `${hours} hour${hours !== 1 ? 's' : ''}` : '< 1 hour';
                  return `${remaining} remaining (until ${new Date(banInfo.ban_expires_at).toLocaleDateString([], { day: 'numeric', month: 'long' })})`;
                })()
              : 'Permanent'}
          </Text>
          {!!banInfo.ban_appeal_note && <Text style={s.banNoticeRow}><Text style={s.banNoticeLabel}>To appeal: </Text>{banInfo.ban_appeal_note}</Text>}
        </View>
      )}

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
            onRefresh={() => { setRefreshing(true); load(activeTag, sortByRef.current, true); }}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={s.loadingMore} color={c.primary} /> : null}
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
            <Ionicons name="add" size={30} color={c.white} />
          </LinearGradient>
        </Pressable>
      </View>

      {/* Community guidelines — shown once on first visit */}
      <Modal
        visible={guidelinesVisible}
        transparent
        animationType="fade"
        onRequestClose={dismissGuidelines}
      >
        <View style={s.glOverlay}>
          <View style={s.glSheet}>
            <View style={s.glIconRow}>
              <View style={s.glIconCircle}>
                <Text style={s.glIconEmoji}>🤝</Text>
              </View>
            </View>
            <Text style={s.glTitle}>Welcome to the Community</Text>
            <Text style={s.glSubtitle}>A safe space built on respect and shared experience.</Text>

            <View style={s.glRules}>
              {[
                { emoji: '💙', text: 'Be kind — everyone here is fighting their own battle' },
                { emoji: '🔒', text: 'You can post or comment anonymously any time' },
                { emoji: '🚫', text: 'No judgement, no shaming, ever' },
                { emoji: '🆘', text: 'If you\'re in crisis, the Support tab has free helpline numbers' },
              ].map(r => (
                <View key={r.emoji} style={s.glRuleRow}>
                  <Text style={s.glRuleEmoji}>{r.emoji}</Text>
                  <Text style={s.glRuleTxt}>{r.text}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [s.glBtn, pressed && { opacity: 0.85 }]}
              onPress={dismissGuidelines}
            >
              <Text style={s.glBtnTxt}>I understand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },

  header: { paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.white },
  moderateBtn: { padding: 4 },

  tagBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, backgroundColor: c.bgCard,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderMid,
  },

  sortBtnWrap: { paddingLeft: 14, zIndex: 10 },
  sortCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: c.bgElement, borderWidth: 1, borderColor: c.borderMid,
    alignItems: 'center', justifyContent: 'center',
  },
  sortCircleActive: { backgroundColor: c.primary, borderColor: c.primary },

  sortOverlay: { position: 'absolute', top: -200, left: -200, right: -9999, bottom: -9999 },
  sortDropdown: {
    position: 'absolute', top: 40, left: 0,
    backgroundColor: c.bgCard, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 10,
    minWidth: 140, overflow: 'hidden',
    borderWidth: 1, borderColor: c.borderSubtle,
  },
  sortOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  sortOptionActive: { backgroundColor: c.bgTealDeep },
  sortOptionTxt: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  sortOptionTxtActive: { color: c.primary },

  tagBarDivider: { width: 1, height: 22, backgroundColor: c.borderLight, marginHorizontal: 10 },
  tagRow: { flexDirection: 'row', alignItems: 'center' },
  tagChip: {
    paddingHorizontal: 16, paddingVertical: 8, marginRight: 8,
    borderRadius: 20, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.borderMid,
    flexShrink: 0,
  },
  tagChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  tagChipTxt: { fontSize: 14, fontWeight: '600', color: c.textBody },
  tagChipTxtActive: { color: c.white },

  skeletonList: { padding: 16, gap: 12 },
  skeletonCard: { backgroundColor: c.bgCard, borderRadius: 16, padding: 16, gap: 10 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeletonAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.bgElement },
  skeletonLine: { height: 12, backgroundColor: c.bgElement, borderRadius: 6, width: '75%' },

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

  card: { backgroundColor: c.bgCard, borderRadius: 16, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: c.white, fontWeight: '700', fontSize: 15 },
  cardMeta: { flex: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  streakPill: {
    backgroundColor: c.bgTeal, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  streakPillTxt: { fontSize: 11, fontWeight: '600', color: c.primary },
  timeStr: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  tagTxt: { fontSize: 11, fontWeight: '700' },

  content: { fontSize: 14, color: c.textSecondary, lineHeight: 21 },
  readMore: { fontSize: 13, color: c.primary, fontWeight: '600', marginTop: -4 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  reactBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: c.bgElement, borderWidth: 1, borderColor: c.borderSubtle,
  },
  reactBtnActive: { backgroundColor: c.bgTeal, borderColor: c.primary },
  reactBtnTxt: { fontSize: 13, color: c.textBody, fontWeight: '600' },
  stat: { fontSize: 13, color: c.textBody },
  bookmarkBtn: { paddingLeft: 8 },

  banNotice: { margin: 12, backgroundColor: '#fef2f2', borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: '#fca5a5' },
  banNoticeTitle: { fontSize: 14, fontWeight: '700', color: '#b91c1c', marginBottom: 2 },
  banNoticeRow: { fontSize: 13, color: '#7f1d1d', lineHeight: 19 },
  banNoticeLabel: { fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21 },

  glOverlay: {
    flex: 1, backgroundColor: c.overlay,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  glSheet: {
    backgroundColor: c.bgCard, borderRadius: 24, padding: 24, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 24,
  },
  glIconRow: { alignItems: 'center', marginBottom: 14 },
  glIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center',
  },
  glIconEmoji: { fontSize: 30 },
  glTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 6 },
  glSubtitle: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  glRules: { gap: 14, marginBottom: 24 },
  glRuleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  glRuleEmoji: { fontSize: 18, width: 24 },
  glRuleTxt: { flex: 1, fontSize: 14, color: c.textSecondary, lineHeight: 20 },
  glBtn: {
    backgroundColor: c.primary, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  glBtnTxt: { color: c.white, fontSize: 16, fontWeight: '700' },
});
