import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptic } from '@/lib/haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Linking,
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
const ALL_TAGS = ['All', 'Following', 'Mine', 'Saved', ...COMMUNITY_TAGS] as const;
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
  const [followedUsers, setFollowedUsers] = useState<Record<string, boolean>>({});
  const [profileUser, setProfileUser] = useState<{ userId: string; displayName: string; streak: number } | null>(null);

  const [loadError, setLoadError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportingInFeed, setReportingInFeed] = useState(false);
  const [newPostsCount, setNewPostsCount] = useState(0);

  const currentUserIdRef = useRef<string | null>(null);
  const postsRef = useRef<Post[]>([]);
  const activeFetch = useRef(false);
  const sortByRef = useRef<SortBy>('new');
  const activeTagRef = useRef<FilterTag>('All');
  const reactingRef = useRef<Record<string, boolean>>({});
  const flatListRef = useRef<FlatList<Post>>(null);

  useEffect(() => {
    // Use cached session first so currentUserIdRef is set before useFocusEffect runs
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      currentUserIdRef.current = session.user.id;
    });

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      currentUserIdRef.current = user.id;
      const { data } = await supabase.from('users').select('display_name, is_banned, ban_reason, ban_expires_at, ban_appeal_note').eq('id', user.id).maybeSingle();
      setDisplayName(data?.display_name ?? '');
      if (data) setBanInfo({ is_banned: data.is_banned ?? false, ban_reason: data.ban_reason, ban_expires_at: data.ban_expires_at, ban_appeal_note: data.ban_appeal_note });

      const [bookmarkRes, followRes] = await Promise.all([
        supabase.from('community_bookmarks').select('post_id').eq('user_id', user.id),
        supabase.from('community_follows').select('following_id').eq('follower_id', user.id),
      ]);
      if (bookmarkRes.data) {
        const bm: Record<string, boolean> = {};
        for (const row of bookmarkRes.data as { post_id: string }[]) bm[row.post_id] = true;
        setUserBookmarks(bm);
      }
      if (followRes.data) {
        const fm: Record<string, boolean> = {};
        for (const row of followRes.data as { following_id: string }[]) fm[row.following_id] = true;
        setFollowedUsers(fm);
      }
    });

    AsyncStorage.getItem(COMMUNITY_GUIDELINES_SEEN_KEY).then(val => {
      if (val !== 'true') setGuidelinesVisible(true);
    });
  }, []);

  // Live feed — subscribe to new posts and show a banner when others post
  useEffect(() => {
    const channel = supabase
      .channel('community_feed_live')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'community_posts' },
        (payload: any) => {
          if (payload.new?.user_id === currentUserIdRef.current) return;
          if (activeTagRef.current === 'All' && sortByRef.current === 'new') {
            setNewPostsCount(prev => prev + 1);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[community] realtime error:', err.message);
      });
    return () => { supabase.removeChannel(channel); };
  }, []);

  const dismissGuidelines = async () => {
    await AsyncStorage.setItem(COMMUNITY_GUIDELINES_SEEN_KEY, 'true');
    setGuidelinesVisible(false);
  };

  const changeSort = (sort: SortBy) => {
    sortByRef.current = sort;
    setSortBy(sort);
    setNewPostsCount(0);
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
      if (!r.post_id || !r.emoji) continue;
      if (uid && r.user_id === uid) userMap[r.post_id] = r.emoji;
      if (!countMap[r.post_id]) countMap[r.post_id] = {};
      countMap[r.post_id][r.emoji] = (countMap[r.post_id][r.emoji] ?? 0) + 1;
    }

    setUserReactions(replace ? userMap : prev => ({ ...prev, ...userMap }));
    setAllEmojiCounts(replace ? countMap : prev => ({ ...prev, ...countMap }));
  };

  const load = useCallback(async (tag: FilterTag, sort: SortBy = 'new', isRefresh = false) => {
    if (!isRefresh) { setLoading(true); reactingRef.current = {}; }
    setLoadError(false);
    try {
      if (tag === 'Following') {
        const uid = currentUserIdRef.current;
        if (!uid) { setPosts([]); setHasMore(false); return; }
        const { data: followRows } = await supabase
          .from('community_follows').select('following_id').eq('follower_id', uid);
        const ids = (followRows ?? []).map((r: { following_id: string }) => r.following_id);
        if (ids.length === 0) { postsRef.current = []; setPosts([]); setHasMore(false); return; }
        let q: any = supabase.from('community_posts').select(POST_SELECT).in('user_id', ids);
        if (sort === 'popular') q = q.order('reactions_count', { ascending: false }).order('comments_count', { ascending: false });
        else q = q.order('created_at', { ascending: false });
        q = q.range(0, PAGE_SIZE - 1);
        const { data, error } = await q;
        if (error) console.warn('[community] following load error:', error.message);
        const items = (data as Post[]) ?? [];
        postsRef.current = items;
        setPosts(items);
        setHasMore(items.length === PAGE_SIZE);
        fetchReactions(items.map(p => p.id), true);
        return;
      }

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
        const { data, error } = await q;
        if (error) console.warn('[community] saved load error:', error.message);
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

      const { data, error } = await q;
      if (error) {
        console.warn('[community] feed load error:', error.message);
        setLoadError(true);
      }
      const items = (data as Post[]) ?? [];
      postsRef.current = items;
      setPosts(items);
      setHasMore(items.length === PAGE_SIZE);
      fetchReactions(items.map(p => p.id), true);
    } catch (e) {
      console.warn('[community] load exception:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore || activeFetch.current) return;
    if (activeTag === 'Saved' || activeTag === 'Following') return;
    activeFetch.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
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
      const { data, error } = await q;
      if (error) {
        console.warn('[community] loadMore error:', error.message);
        setLoadMoreError(true);
        return;
      }
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

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setNewPostsCount(0);
    load(activeTag, sortByRef.current, true);
    const uid = currentUserIdRef.current;
    if (uid) {
      supabase.from('community_follows').select('following_id').eq('follower_id', uid)
        .then(({ data }) => {
          if (cancelled || !data) return;
          const fm: Record<string, boolean> = {};
          for (const row of data as { following_id: string }[]) fm[row.following_id] = true;
          setFollowedUsers(fm);
        }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [activeTag, load]));

  const changeTag = (tag: FilterTag) => {
    activeTagRef.current = tag;
    setActiveTag(tag);
    setNewPostsCount(0);
    load(tag, sortByRef.current);
  };

  const toggleFeedReaction = async (postId: string, emoji: string) => {
    const uid = currentUserIdRef.current;
    if (!uid || reactingRef.current[postId]) return;
    haptic();
    reactingRef.current[postId] = true;
    const current = userReactions[postId];
    const prevReactions = userReactions;
    const prevCounts = allEmojiCounts;
    const prevPosts = posts;

    try {
      if (current === emoji) {
        setUserReactions(prev => { const next = { ...prev }; delete next[postId]; return next; });
        setAllEmojiCounts(prev => ({
          ...prev,
          [postId]: { ...prev[postId], [emoji]: Math.max(0, (prev[postId]?.[emoji] ?? 1) - 1) },
        }));
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: Math.max(0, p.reactions_count - 1) } : p));
        const { error } = await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', uid);
        if (error) { setUserReactions(prevReactions); setAllEmojiCounts(prevCounts); setPosts(prevPosts); }
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
        const { error: delErr } = await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', uid);
        if (delErr) { setUserReactions(prevReactions); setAllEmojiCounts(prevCounts); setPosts(prevPosts); return; }
        const { error } = await supabase.from('community_reactions').insert({ post_id: postId, user_id: uid, emoji });
        if (error) { setUserReactions(prevReactions); setAllEmojiCounts(prevCounts); setPosts(prevPosts); }
      } else {
        setUserReactions(prev => ({ ...prev, [postId]: emoji }));
        setAllEmojiCounts(prev => ({
          ...prev,
          [postId]: { ...prev[postId], [emoji]: (prev[postId]?.[emoji] ?? 0) + 1 },
        }));
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: p.reactions_count + 1 } : p));
        const { error } = await supabase.from('community_reactions').insert({ post_id: postId, user_id: uid, emoji });
        if (error) { setUserReactions(prevReactions); setAllEmojiCounts(prevCounts); setPosts(prevPosts); }
      }
    } finally {
      reactingRef.current[postId] = false;
    }
  };

  const toggleBookmark = async (postId: string) => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    haptic();
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

  const toggleFollow = async (userId: string) => {
    const uid = currentUserIdRef.current;
    if (!uid || uid === userId) return;
    haptic();
    const isFollowing = followedUsers[userId] ?? false;
    setFollowedUsers(prev => ({ ...prev, [userId]: !isFollowing }));
    if (isFollowing) {
      await supabase.from('community_follows').delete().eq('follower_id', uid).eq('following_id', userId);
      if (activeTag === 'Following') {
        setPosts(prev => prev.filter(p => p.user_id !== userId));
        postsRef.current = postsRef.current.filter(p => p.user_id !== userId);
      }
    } else {
      await supabase.from('community_follows').insert({ follower_id: uid, following_id: userId });
    }
  };

  const reportPost = (postId: string) => setReportPostId(postId);

  const submitReport = async (reason: string) => {
    const uid = currentUserIdRef.current;
    const postId = reportPostId;
    if (!uid || !postId || reportingInFeed) return;
    setReportingInFeed(true);
    const { error } = await supabase.from('community_reports').insert({
      target_type: 'post', target_id: postId, reporter_id: uid, reason,
    });
    setReportingInFeed(false);
    setReportPostId(null);
    if (error) { Alert.alert('Could not submit report', error.message); return; }
    Alert.alert('Reported', 'Thank you — we will review this shortly.');
  };

  const handleAuthorPress = (item: Post) => {
    if (item.is_anonymous) return;
    if (item.user_id === currentUserIdRef.current) return;
    setProfileUser({
      userId: item.user_id,
      displayName: item.users?.display_name || 'User',
      streak: item.users?.streaks?.[0]?.current_streak ?? 0,
    });
  };

  const renderPost = ({ item }: { item: Post }) => {
    const isAnon = item.is_anonymous ?? false;
    const color = isAnon ? '#aaa' : avatarColor(item.user_id);
    const name = isAnon ? 'Anonymous' : (item.users?.display_name || 'Anonymous');
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
          <Pressable
            onPress={(e) => { e.stopPropagation(); handleAuthorPress(item); }}
            disabled={isAnon || item.user_id === currentUserIdRef.current}
            style={s.authorTapArea}
          >
            <View style={[s.avatar, { backgroundColor: color }]}>
              <Text style={s.avatarTxt}>{name[0].toUpperCase()}</Text>
            </View>
            <View style={s.cardMeta}>
              <View style={s.authorRow}>
                <Text style={s.authorName}>{name}</Text>
                {!isAnon && followedUsers[item.user_id] && (
                  <Text style={s.followingTag}>following</Text>
                )}
                {badge ? (
                  <View style={s.streakPill}>
                    <Text style={s.streakPillTxt}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.timeStr}>{timeAgo(item.created_at)}</Text>
            </View>
          </Pressable>
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!isAnon && item.user_id !== currentUserIdRef.current && (
              <Pressable
                onPress={(e) => { e.stopPropagation(); reportPost(item.id); }}
                hitSlop={8}
              >
                <Ionicons name="flag-outline" size={16} color={c.textFaint} />
              </Pressable>
            )}
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
        </View>
      </Pressable>
    );
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={[c.headerGradDeep, c.headerGradStart, c.headerGradEnd]} style={s.header}>
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
          {!!banInfo.ban_appeal_note && <Text style={s.banNoticeRow}><Text style={s.banNoticeLabel}>Note: </Text>{banInfo.ban_appeal_note}</Text>}
          <Pressable
            style={({ pressed }) => [s.banContactBtn, pressed && { opacity: 0.75 }]}
            onPress={() => {
              const subject = encodeURIComponent(`Ban appeal – ${displayName || 'user'}`);
              Linking.openURL(`mailto:support@cornerday.app?subject=${subject}&body=Hi%2C%20I%20would%20like%20to%20appeal%20my%20community%20ban.`);
            }}
          >
            <Text style={s.banContactTxt}>Contact Support</Text>
          </Pressable>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={s.skeletonList}>
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={posts}
            keyExtractor={i => i.id}
            renderItem={renderPost}
            contentContainerStyle={s.list}
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); setNewPostsCount(0); load(activeTag, sortByRef.current, true); }}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={s.loadingMore} color={c.primary} /> :
              loadMoreError ? (
                <View style={s.loadMoreErr}>
                  <Text style={s.loadMoreErrText}>Couldn't load more posts.</Text>
                  <Pressable onPress={loadMore} style={s.loadMoreRetry}>
                    <Text style={s.loadMoreRetryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : null
            }
            ListEmptyComponent={loadError ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>⚠️</Text>
                <Text style={s.emptyTitle}>Couldn't load posts</Text>
                <Text style={s.emptyBody}>Check your connection and try again.</Text>
                <Pressable
                  style={s.retryBtn}
                  onPress={() => load(activeTag, sortByRef.current)}>
                  <Text style={s.retryBtnTxt}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>{activeTag === 'Saved' ? '🔖' : activeTag === 'Following' ? '👥' : '🌱'}</Text>
                <Text style={s.emptyTitle}>
                  {activeTag === 'Mine' ? 'No stories yet'
                    : activeTag === 'Saved' ? 'No saved posts'
                    : activeTag === 'Following' ? (Object.keys(followedUsers).length === 0 ? 'Not following anyone yet' : 'No posts yet')
                    : 'Be the first to share'}
                </Text>
                <Text style={s.emptySubtitle}>
                  {activeTag === 'Mine'
                    ? 'Your shared stories will appear here.'
                    : activeTag === 'Saved'
                    ? 'Tap the bookmark icon on any post to save it here.'
                    : activeTag === 'Following'
                    ? (Object.keys(followedUsers).length === 0
                        ? 'Tap any author\'s name or avatar to follow them — their posts will appear here.'
                        : 'People you follow haven\'t posted recently.')
                    : 'This community is just getting started.\nShare your story and inspire someone today.'}
                </Text>
              </View>
            )}
          />
        )}

        {newPostsCount > 0 && (
          <Pressable
            style={s.newPostsBanner}
            onPress={() => {
              setNewPostsCount(0);
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              load('All', 'new', true);
              activeTagRef.current = 'All';
              setActiveTag('All');
            }}
            accessibilityLabel={`${newPostsCount} new ${newPostsCount === 1 ? 'post' : 'posts'}, tap to refresh`}
            accessibilityRole="button"
          >
            <Text style={s.newPostsBannerTxt}>
              ↑ {newPostsCount} new {newPostsCount === 1 ? 'post' : 'posts'}
            </Text>
          </Pressable>
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

      {/* Author profile sheet */}
      <Modal visible={!!profileUser} transparent animationType="fade" onRequestClose={() => setProfileUser(null)}>
        <Pressable style={s.profileOverlay} onPress={() => setProfileUser(null)}>
          <Pressable onPress={() => {}} style={s.profileSheet}>
            {profileUser && (
              <>
                <View style={[s.profileAvatar, { backgroundColor: avatarColor(profileUser.userId) }]}>
                  <Text style={s.profileAvatarTxt}>{profileUser.displayName[0].toUpperCase()}</Text>
                </View>
                <Text style={s.profileName}>{profileUser.displayName}</Text>
                {streakBadge(profileUser.streak) && (
                  <View style={s.profileStreakPill}>
                    <Text style={s.profileStreakTxt}>{streakBadge(profileUser.streak)}</Text>
                  </View>
                )}
                <Pressable
                  style={({ pressed }) => [
                    s.followBtn,
                    followedUsers[profileUser.userId] && s.followBtnActive,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => toggleFollow(profileUser.userId)}
                >
                  <Text style={[s.followBtnTxt, followedUsers[profileUser.userId] && s.followBtnTxtActive]}>
                    {followedUsers[profileUser.userId] ? '✓ Following' : 'Follow'}
                  </Text>
                </Pressable>
                <Pressable style={({ pressed }) => [s.profileClose, pressed && { opacity: 0.6 }]} onPress={() => setProfileUser(null)}>
                  <Text style={s.profileCloseTxt}>Close</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report story modal */}
      <Modal visible={!!reportPostId} transparent animationType="fade" onRequestClose={() => setReportPostId(null)}>
        <Pressable style={s.glOverlay} onPress={() => setReportPostId(null)}>
          <Pressable style={s.reportSheet} onPress={() => {}}>
            <View style={s.reportIconRow}>
              <View style={s.reportIconCircle}>
                <Ionicons name="flag-outline" size={24} color={c.error} />
              </View>
            </View>
            <Text style={s.reportTitle}>Report story</Text>
            <Text style={s.reportSubtitle}>Why are you reporting this?</Text>
            {(['Spam', 'Harmful content', 'Misinformation'] as const).map((reason, i, arr) => (
              <View key={reason} style={{ width: '100%' }}>
                <Pressable
                  style={({ pressed }) => [s.reportReasonRow, pressed && { opacity: 0.6 }]}
                  onPress={() => submitReport(reason)}
                  disabled={reportingInFeed}>
                  <Text style={s.reportReasonTxt}>{reason}</Text>
                  {reportingInFeed ? null : <Ionicons name="chevron-forward" size={16} color={c.textFaint} />}
                </Pressable>
                {i < arr.length - 1 && <View style={s.reportDivider} />}
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [s.reportCancelBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setReportPostId(null)}>
              <Text style={s.reportCancelTxt}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  newPostsBanner: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: c.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
  },
  newPostsBannerTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  loadMoreErr: { paddingVertical: 16, alignItems: 'center', gap: 8 },
  loadMoreErrText: { fontSize: 13, color: c.textMuted },
  loadMoreRetry: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: c.primary, borderRadius: 16 },
  loadMoreRetryText: { color: '#fff', fontWeight: '600', fontSize: 13 },

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
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: c.white, fontWeight: '700', fontSize: 15 },
  cardMeta: { flex: 1 },
  authorTapArea: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  followingTag: { fontSize: 10, color: c.primary, fontWeight: '700', backgroundColor: c.bgTeal, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
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
  banContactBtn: { marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#b91c1c', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  banContactTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyBody: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginTop: 6 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: c.primary, borderRadius: 20 },
  retryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Report modal
  reportSheet: {
    backgroundColor: c.bgCard, borderRadius: 22, padding: 20, width: '100%',
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  reportIconRow: { alignItems: 'center', marginBottom: 12 },
  reportIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: c.bgError, borderWidth: 1.5, borderColor: c.borderError,
    alignItems: 'center', justifyContent: 'center',
  },
  reportTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 4 },
  reportSubtitle: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginBottom: 16 },
  reportReasonRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 4,
  },
  reportReasonTxt: { fontSize: 15, color: c.textPrimary, fontWeight: '500' },
  reportDivider: { height: 1, backgroundColor: c.borderSubtle },
  reportCancelBtn: {
    marginTop: 16, width: '100%', paddingVertical: 13,
    borderRadius: 12, backgroundColor: c.bgElement, alignItems: 'center',
  },
  reportCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },

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

  // Author profile sheet
  profileOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center', padding: 32 },
  profileSheet: {
    backgroundColor: c.bgCard, borderRadius: 24, padding: 28, width: '100%',
    alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 20,
  },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  profileAvatarTxt: { fontSize: 26, fontWeight: '800', color: c.white },
  profileName: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  profileStreakPill: { backgroundColor: c.bgTeal, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  profileStreakTxt: { fontSize: 13, fontWeight: '600', color: c.primary },
  followBtn: {
    marginTop: 8, paddingVertical: 13, paddingHorizontal: 48, borderRadius: 14,
    backgroundColor: c.primary,
  },
  followBtnActive: { backgroundColor: c.bgTeal, borderWidth: 1.5, borderColor: c.primary },
  followBtnTxt: { fontSize: 15, fontWeight: '700', color: c.white },
  followBtnTxtActive: { color: c.primary },
  profileClose: { marginTop: 4, paddingVertical: 8 },
  profileCloseTxt: { fontSize: 14, color: c.textFaint, fontWeight: '600' },
});
