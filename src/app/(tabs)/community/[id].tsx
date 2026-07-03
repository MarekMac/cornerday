import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { haptic, hapticMedium } from '@/lib/haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarColor, REACTION_EMOJIS, streakBadge, TAG_COLORS, timeAgo } from '@/constants/community';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/networkError';
import { showInterstitialIfReady } from '@/lib/ads';
import { usePurchases } from '@/context/purchases';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

interface Post {
  id: string;
  user_id: string | null;
  content: string;
  tag: string | null;
  reactions_count: number;
  comments_count: number;
  created_at: string;
  is_anonymous: boolean;
  author_name: string | null;
  author_streak: number | null;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  helpful_count: number;
  is_anonymous?: boolean;
  author_name: string | null;
}

type MenuTarget = { kind: 'post' } | { kind: 'comment'; id: string };
type ActionTarget = { kind: 'post'; id: string } | { kind: 'comment'; id: string };

export default function PostDetail() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { isPremium } = usePurchases();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isCommentAnonymous, setIsCommentAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // comment helpful reactions: set of comment IDs the current user has reacted to
  const [myHelpfulReactions, setMyHelpfulReactions] = useState<Set<string>>(new Set());

  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [editTarget, setEditTarget] = useState<ActionTarget | null>(null);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ActionTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reportTarget, setReportTarget] = useState<ActionTarget | null>(null);
  const [reporting, setReporting] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [androidKbOffset, setAndroidKbOffset] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);
  const isMountedRef = useRef(true);
  const followInFlightRef = useRef(false);
  const reactingRef = useRef(false);
  const commentReactingRef = useRef<Record<string, boolean>>({});
  // Separate from the `submitting` state below — state updates aren't
  // guaranteed to be applied before a second synchronous call to this
  // closure (Enter-to-submit and a near-simultaneous send-button tap), so
  // the actual re-entrancy guard needs a ref.
  const submittingRef = useRef(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setCurrentUserId(uid);

      const [postRes, commentsRes, reactionsRes, commentReactionsRes] = await Promise.all([
        supabase
          .from('community_posts_public')
          .select('id, user_id, content, tag, reactions_count, comments_count, created_at, is_anonymous, author_name, author_streak')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('community_comments_public')
          .select('id, user_id, content, created_at, helpful_count, is_anonymous, author_name')
          .eq('post_id', id)
          .order('created_at', { ascending: true }),
        supabase
          .from('community_reactions')
          .select('emoji, user_id')
          .eq('post_id', id),
        uid
          ? supabase
              .from('community_comment_reactions')
              .select('comment_id')
              .eq('user_id', uid)
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMountedRef.current) return;
      const loadedPost = postRes.data as Post ?? null;
      setPost(loadedPost);
      setComments((commentsRes.data as Comment[]) ?? []);

      if (uid && loadedPost && loadedPost.user_id && loadedPost.user_id !== uid && !loadedPost.is_anonymous) {
        supabase.from('community_follows').select('id')
          .eq('follower_id', uid).eq('following_id', loadedPost.user_id)
          .maybeSingle().then(({ data }) => { if (isMountedRef.current) setIsFollowing(!!data); }, e => console.warn('[Follow check]', e));
      }

      const counts: Record<string, number> = {};
      let myReaction: string | null = null;
      for (const r of (reactionsRes.data ?? []) as { emoji: string; user_id: string }[]) {
        counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
        if (r.user_id === uid) myReaction = r.emoji;
      }
      setReactionCounts(counts);
      setUserReaction(myReaction);

      const myHelpful = new Set<string>();
      for (const r of ((commentReactionsRes as any).data ?? []) as { comment_id: string }[]) {
        myHelpful.add(r.comment_id);
      }
      setMyHelpfulReactions(myHelpful);
    } catch (e) {
      console.warn('[CornerDay] loadAll error:', e);
      if (isMountedRef.current) setLoadError(true);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadAll();

    const channel = supabase
      .channel(`comments-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_comments', filter: `post_id=eq.${id}` },
        async (payload) => {
          const { data } = await supabase
            .from('community_comments_public')
            .select('id, user_id, content, created_at, helpful_count, is_anonymous, author_name')
            .eq('id', payload.new.id)
            .maybeSingle();
          if (data && isMountedRef.current) {
            setComments(prev => {
              if (prev.some(c => c.id === (data as any).id)) return prev;
              return [...prev, data as Comment];
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
          }
        }
      )
      .subscribe();

    return () => { isMountedRef.current = false; supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setAndroidKbOffset(e.endCoordinates.height));
    const hide  = Keyboard.addListener('keyboardDidHide', () => setAndroidKbOffset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const pickReaction = async (emoji: string) => {
    // Every other toggle in this feature guards re-entry with a ref checked
    // synchronously before any state/await (see followInFlightRef above,
    // and bookmarkingRef/followingInFlightRef in community/index.tsx) —
    // this one didn't, so a fast double-tap could fire twice before the
    // first insert lands, both taking the "insert" branch and violating the
    // UNIQUE(post_id, user_id) constraint on the second one.
    if (!currentUserId || !post || reactingRef.current) return;
    reactingRef.current = true;
    const prevReaction = userReaction;
    const prevCounts = { ...reactionCounts };
    const prevPost = post;

    try {
      if (userReaction === emoji) {
        setUserReaction(null);
        setReactionCounts(prev => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] ?? 1) - 1) }));
        setPost(p => p ? { ...p, reactions_count: Math.max(0, p.reactions_count - 1) } : p);
        const { error } = await supabase.from('community_reactions').delete().eq('post_id', post.id).eq('user_id', currentUserId);
        if (error) { setUserReaction(prevReaction); setReactionCounts(prevCounts); setPost(prevPost); }
      } else if (userReaction) {
        const old = userReaction;
        setUserReaction(emoji);
        setReactionCounts(prev => ({
          ...prev,
          [old]: Math.max(0, (prev[old] ?? 1) - 1),
          [emoji]: (prev[emoji] ?? 0) + 1,
        }));
        const { error: delErr } = await supabase.from('community_reactions').delete().eq('post_id', post.id).eq('user_id', currentUserId);
        if (delErr) { setUserReaction(prevReaction); setReactionCounts(prevCounts); setPost(prevPost); return; }
        const { error: insErr } = await supabase.from('community_reactions').insert({ post_id: post.id, user_id: currentUserId, emoji });
        if (insErr) {
          // The delete already succeeded by this point — the DB now has no
          // reaction row at all for this user on this post. Rolling back to
          // prevReaction (the old emoji) would show it as still active when
          // it's actually gone, invisibly out of sync until a reload. Land
          // on "no reaction" instead, which matches DB truth.
          setUserReaction(null);
          // `old`'s count is already correctly decremented by the optimistic
          // update above (matches the delete that really did succeed) — only
          // undo the `emoji` increment, since the insert that would have
          // earned it never actually landed.
          setReactionCounts(prev => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] ?? 1) - 1) }));
          setPost(p => p ? { ...p, reactions_count: Math.max(0, p.reactions_count - 1) } : p);
        }
      } else {
        setUserReaction(emoji);
        setReactionCounts(prev => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
        setPost(p => p ? { ...p, reactions_count: p.reactions_count + 1 } : p);
        const { error } = await supabase.from('community_reactions').insert({ post_id: post.id, user_id: currentUserId, emoji });
        if (error) { setUserReaction(prevReaction); setReactionCounts(prevCounts); setPost(prevPost); }
      }
    } finally {
      reactingRef.current = false;
    }
  };

  const toggleCommentReaction = async (commentId: string) => {
    if (!currentUserId || commentReactingRef.current[commentId]) return;
    commentReactingRef.current[commentId] = true;
    const hasReacted = myHelpfulReactions.has(commentId);
    const prevReactions = new Set(myHelpfulReactions);
    const prevComments = comments;

    try {
      setMyHelpfulReactions(prev => {
        const next = new Set(prev);
        if (hasReacted) next.delete(commentId);
        else next.add(commentId);
        return next;
      });
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, helpful_count: Math.max(0, c.helpful_count + (hasReacted ? -1 : 1)) }
          : c
      ));

      let error;
      if (hasReacted) {
        ({ error } = await supabase
          .from('community_comment_reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', currentUserId));
      } else {
        ({ error } = await supabase
          .from('community_comment_reactions')
          .insert({ comment_id: commentId, user_id: currentUserId }));
      }
      if (error) { setMyHelpfulReactions(prevReactions); setComments(prevComments); }
    } finally {
      commentReactingRef.current[commentId] = false;
    }
  };

  const submitComment = async () => {
    // Synchronous re-entrancy guard via ref (not just the `submitting`
    // state, which isn't guaranteed to be applied before a second call to
    // this closure) — this is wired to both the send button's onPress and
    // the TextInput's onSubmitEditing, so a fast double-trigger (e.g. Enter
    // then tap) before React re-renders the disabled state could otherwise
    // insert two identical comments.
    if (submittingRef.current) return;
    if (!commentText.trim() || !currentUserId || !post) return;
    submittingRef.current = true;
    setSubmitting(true);
    const text = commentText.trim();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: userData } = isCommentAnonymous
        ? { data: null }
        : await supabase.from('users').select('display_name').eq('id', currentUserId).maybeSingle();

      const { data, error } = await supabase
        .from('community_comments')
        .insert({ post_id: post.id, user_id: currentUserId, content: text, is_anonymous: isCommentAnonymous })
        .select('id, user_id, content, created_at, helpful_count, is_anonymous')
        .maybeSingle();

      if (error) {
        Alert.alert('Could not post comment', friendlyError(error));
      } else if (data) {
        if (!isMountedRef.current) return;
        setCommentText('');
        const newComment: Comment = {
          ...(data as any),
          author_name: isCommentAnonymous ? null : (userData?.display_name ?? user?.email ?? 'Anonymous'),
        };
        setComments(prev => {
          if (prev.some(c => c.id === (data as any).id)) return prev;
          return [...prev, newComment];
        });
        setPost(p => p ? { ...p, comments_count: p.comments_count + 1 } : p);
        hapticMedium();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const sharePost = async () => {
    if (!post) return;
    await Share.share({
      message: `"${post.content}"\n\n— Shared from CornerDay, a gambling recovery app`,
      title: 'Recovery Story',
    });
  };

  // ─── Menu actions ───────────────────────────────────────────────────────────

  const showPostMenu = () => {
    if (!post) return;
    if (post.user_id && post.user_id === currentUserId) {
      setMenuTarget({ kind: 'post' });
    } else {
      setReportTarget({ kind: 'post', id: post.id });
    }
  };

  const showCommentMenu = (comment: Comment) => {
    if (comment.user_id === currentUserId) {
      setMenuTarget({ kind: 'comment', id: comment.id });
    } else {
      setReportTarget({ kind: 'comment', id: comment.id });
    }
  };

  const handleEditFromMenu = () => {
    const target = menuTarget;
    setMenuTarget(null);
    if (!target) return;
    if (target.kind === 'post' && post) {
      setEditText(post.content);
      setEditTarget({ kind: 'post', id: post.id });
    } else if (target.kind === 'comment') {
      const comment = comments.find(c => c.id === target.id);
      if (comment) {
        setEditText(comment.content);
        setEditTarget({ kind: 'comment', id: comment.id });
      }
    }
  };

  const handleDeleteFromMenu = () => {
    const target = menuTarget;
    setMenuTarget(null);
    if (!target) return;
    const targetId = target.kind === 'post' ? post?.id : target.id;
    if (!targetId) return;
    setDeleteTarget({ kind: target.kind, id: targetId });
  };

  const saveEdit = async () => {
    if (!editTarget || !editText.trim()) return;
    setEditSaving(true);
    let error;
    if (editTarget.kind === 'post') {
      ({ error } = await supabase.from('community_posts').update({ content: editText.trim() }).eq('id', editTarget.id).eq('user_id', currentUserId!));
      if (!error) setPost(p => p ? { ...p, content: editText.trim() } : p);
    } else {
      ({ error } = await supabase.from('community_comments').update({ content: editText.trim() }).eq('id', editTarget.id).eq('user_id', currentUserId!));
      if (!error) setComments(prev => prev.map(c => c.id === editTarget.id ? { ...c, content: editText.trim() } : c));
    }
    setEditSaving(false);
    if (error) {
      Alert.alert('Could not save', friendlyError(error));
    } else {
      setEditTarget(null);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'post') {
        const { error } = await supabase.from('community_posts').delete().eq('id', deleteTarget.id).eq('user_id', currentUserId!);
        if (error) { Alert.alert('Could not delete', friendlyError(error)); return; }
        setDeleteTarget(null);
        router.back();
      } else {
        const { error } = await supabase.from('community_comments').delete().eq('id', deleteTarget.id).eq('user_id', currentUserId!);
        if (error) { Alert.alert('Could not delete', friendlyError(error)); return; }
        setComments(prev => prev.filter(c => c.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const executeReport = async (reason: string) => {
    if (!reportTarget || !currentUserId || reporting) return;
    setReporting(true);
    const { error } = await supabase.from('community_reports').insert({
      target_type: reportTarget.kind, target_id: reportTarget.id,
      reporter_id: currentUserId, reason,
    });
    setReporting(false);
    if (error) { Alert.alert('Could not submit report', friendlyError(error)); return; }
    setReportTarget(null);
    Alert.alert('Reported', 'Thank you — we will review this shortly.');
  };

  const toggleFollow = async () => {
    if (!currentUserId || !post || !post.user_id || followInFlightRef.current) return;
    followInFlightRef.current = true;
    const prev = isFollowing;
    setIsFollowing(f => !f);
    try {
      let error;
      if (isFollowing) {
        ({ error } = await supabase.from('community_follows').delete().eq('follower_id', currentUserId).eq('following_id', post.user_id));
      } else {
        ({ error } = await supabase.from('community_follows').insert({ follower_id: currentUserId, following_id: post.user_id }));
      }
      if (error) {
        setIsFollowing(prev);
        // The insert branch in particular can hit a unique-constraint error
        // if the initial follow-status fetch (fire-and-forget on load,
        // below) hadn't resolved yet when this was tapped — silently
        // reverting with no explanation left the user unsure whether they
        // were following or not.
        Alert.alert(prev ? 'Could not unfollow' : 'Could not follow', 'Please try again.');
      }
    } finally {
      followInFlightRef.current = false;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }]}>
        <Text style={{ color: c.textBody, fontSize: 16, textAlign: 'center' }}>Could not load post.</Text>
        <Pressable
          onPress={() => { setLoadError(false); loadAll(); }}
          style={{ paddingHorizontal: 24, paddingVertical: 10, backgroundColor: c.primary, borderRadius: 20 }}
          accessibilityLabel="Retry loading post"
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: c.textBody }}>Story not found.</Text>
      </View>
    );
  }

  const isAnon = post.is_anonymous ?? false;
  const postAuthor = isAnon ? 'Anonymous' : (post.author_name || 'Anonymous');
  const postColor = isAnon ? '#aaa' : avatarColor(post.user_id ?? '');
  const postStreak = isAnon ? 0 : (post.author_streak ?? 0);
  const postStreakBadge = streakBadge(postStreak);
  const isPostOwner = post.user_id === currentUserId;

  const ListHeader = (
    <View style={s.postCard}>
      <View style={s.postCardHeader}>
        <View style={[s.avatar, { backgroundColor: postColor }]}>
          <Text style={s.avatarTxt}>{postAuthor[0].toUpperCase()}</Text>
        </View>
        <View style={s.metaCol}>
          <View style={s.authorRow}>
            <Text style={s.authorName}>{postAuthor}</Text>
            {postStreakBadge ? (
              <View style={s.streakPill}>
                <Text style={s.streakPillTxt}>{postStreakBadge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.timeStr}>{timeAgo(post.created_at)}</Text>
        </View>
        {post.tag ? (
          <View style={[s.tagPill, { backgroundColor: (TAG_COLORS[post.tag] ?? '#0F6E6E') + '20' }]}>
            <Text style={[s.tagTxt, { color: TAG_COLORS[post.tag] ?? '#0F6E6E' }]}>{post.tag}</Text>
          </View>
        ) : null}
        <Pressable onPress={showPostMenu} style={s.menuBtn} hitSlop={8} accessibilityLabel={isPostOwner ? 'Post options' : 'Report post'} accessibilityRole="button">
          <Ionicons
            name={isPostOwner ? 'ellipsis-horizontal' : 'flag-outline'}
            size={18}
            color={isPostOwner ? c.textMuted : c.warn}
          />
        </Pressable>
      </View>

      {!isAnon && !isPostOwner && (
        <Pressable
          style={({ pressed }) => [s.followRow, isFollowing && s.followRowActive, pressed && { opacity: 0.7 }]}
          onPress={toggleFollow}
          hitSlop={6}
        >
          <Ionicons name={isFollowing ? 'checkmark-circle' : 'person-add-outline'} size={14} color={isFollowing ? c.primary : c.textMuted} />
          <Text style={[s.followRowTxt, isFollowing && { color: c.primary }]}>
            {isFollowing ? `Following ${postAuthor}` : `Follow ${postAuthor}`}
          </Text>
        </Pressable>
      )}

      <Text style={s.postContent}>{post.content}</Text>

      <View style={s.emojiRow}>
        {REACTION_EMOJIS.map(e => {
          const count = reactionCounts[e] ?? 0;
          const active = userReaction === e;
          return (
            <Pressable
              key={e}
              style={[s.emojiBtn, active && s.emojiBtnActive]}
              onPress={() => pickReaction(e)}
            >
              <Text style={s.emojiBtnEmoji}>{e}</Text>
              {count > 0 && (
                <Text style={[s.emojiBtnCount, active && { color: c.primary }]}>{count}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={s.postMeta}>
        <Pressable onPress={() => inputRef.current?.focus()} hitSlop={6}>
          <Text style={s.metaTxt}>
            💬 {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </Text>
        </Pressable>
        <Pressable style={s.shareBtn} onPress={sharePost} hitSlop={6}>
          <Ionicons name="share-outline" size={15} color={c.textMuted} />
          <Text style={s.shareTxt}>Share</Text>
        </Pressable>
      </View>

      <View style={s.divider} />
      <Text style={s.commentsLabel}>Comments</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <View style={[s.header, { backgroundColor: c.headerBg }]}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <Pressable onPress={() => { showInterstitialIfReady(isPremium, 0.2); router.back(); }} style={s.backBtn} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
              <Ionicons name="arrow-back" size={22} color={c.white} />
            </Pressable>
            <Text style={s.headerTitle}>Story</Text>
            <View style={{ width: 30 }} />
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={comments}
          keyExtractor={c => c.id}
          ListHeaderComponent={ListHeader}
          extraData={{ post, userReaction, reactionCounts, myHelpfulReactions }}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const cIsAnon = item.is_anonymous ?? false;
            const cName = cIsAnon ? 'Anonymous' : (item.author_name ?? 'Anonymous');
            const cColor = cIsAnon ? '#aaa' : avatarColor(item.user_id);
            const isOwner = item.user_id === currentUserId;
            const iHelpedThis = myHelpfulReactions.has(item.id);
            return (
              <View style={s.commentRow}>
                <View style={[s.commentAvatar, { backgroundColor: cColor }]}>
                  <Text style={s.commentAvatarTxt}>{cName[0].toUpperCase()}</Text>
                </View>
                <View style={s.commentBody}>
                  <View style={s.commentBodyHeader}>
                    <Text style={s.commentAuthor}>{cName}</Text>
                    <Text style={s.commentTime}>{timeAgo(item.created_at)}</Text>
                    <Pressable onPress={() => showCommentMenu(item)} hitSlop={8} accessibilityLabel={isOwner ? 'Comment options' : 'Report comment'} accessibilityRole="button">
                      <Ionicons
                        name={isOwner ? 'ellipsis-horizontal' : 'flag-outline'}
                        size={14}
                        color={isOwner ? c.textDisabled : c.warn}
                      />
                    </Pressable>
                  </View>
                  <Text style={s.commentContent}>{item.content}</Text>
                  <Pressable
                    style={[s.helpfulBtn, iHelpedThis && s.helpfulBtnActive]}
                    onPress={() => toggleCommentReaction(item.id)}
                    hitSlop={6}
                  >
                    <Text style={[s.helpfulBtnTxt, iHelpedThis && { color: c.primary }]}>
                      🤝{item.helpful_count > 0 ? ` ${item.helpful_count}` : ''} This helped me
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={s.noComments}>No comments yet. Be the first to reply.</Text>
          }
        />

        <View style={s.inputBarWrap}>
          {isCommentAnonymous && (
            <Text style={s.anonHint}>Posting anonymously</Text>
          )}
          <View style={s.inputBar}>
            <Pressable
              style={[s.anonToggleBtn, isCommentAnonymous && s.anonToggleBtnActive]}
              onPress={() => setIsCommentAnonymous(v => !v)}
              hitSlop={8}
            >
              <Ionicons
                name={isCommentAnonymous ? 'eye-off' : 'eye-outline'}
                size={18}
                color={isCommentAnonymous ? c.primary : c.textFaint}
              />
            </Pressable>
          <TextInput
            ref={inputRef}
            style={s.commentInput}
            placeholder="Comment..."
            placeholderTextColor={c.textFaint}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={300}
            returnKeyType="send"
            onSubmitEditing={submitComment}
          />
          <Pressable
            style={[s.sendBtn, (!commentText.trim() || submitting) && s.sendBtnDisabled]}
            onPress={submitComment}
            disabled={!commentText.trim() || submitting}
          >
            <Ionicons name="arrow-up" size={18} color={c.white} />
          </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── Action menu (edit / delete) ─────────────────────────────────── */}
      <Modal visible={!!menuTarget} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setMenuTarget(null)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.menuHeader}>
              <Text style={s.menuTitle}>
                {menuTarget?.kind === 'post' ? 'Your story' : 'Your comment'}
              </Text>
              <Pressable onPress={() => setMenuTarget(null)} hitSlop={10} accessibilityLabel="Close menu" accessibilityRole="button">
                <Ionicons name="close" size={22} color={c.textMuted} />
              </Pressable>
            </View>

            <Pressable style={s.menuRow} onPress={handleEditFromMenu}>
              <View style={[s.menuIconWrap, { backgroundColor: c.bgTeal }]}>
                <Ionicons name="create-outline" size={20} color={c.primary} />
              </View>
              <Text style={s.menuRowTxt}>Edit</Text>
              <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
            </Pressable>

            <View style={s.menuDivider} />

            <Pressable style={s.menuRow} onPress={handleDeleteFromMenu}>
              <View style={[s.menuIconWrap, { backgroundColor: c.bgError }]}>
                <Ionicons name="trash-outline" size={20} color={c.error} />
              </View>
              <Text style={[s.menuRowTxt, { color: c.error }]}>Delete</Text>
              <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
            </Pressable>

            <Pressable style={[s.confirmCancel, { marginTop: 16, alignSelf: 'stretch' }]} onPress={() => setMenuTarget(null)}>
              <Text style={s.confirmCancelTxt}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit modal ──────────────────────────────────────────────────── */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => { setAndroidKbOffset(0); setEditTarget(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={[s.confirmOverlay, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]} onPress={() => { setAndroidKbOffset(0); setEditTarget(null); }}>
            <Pressable style={s.confirmSheet} onPress={() => {}}>
              <View style={s.confirmIconRow}>
                <View style={[s.confirmIconCircle, { backgroundColor: c.bgTeal, borderColor: c.borderTeal }]}>
                  <Ionicons name="create-outline" size={26} color={c.primary} />
                </View>
              </View>
              <Text style={s.confirmTitle}>
                Edit {editTarget?.kind === 'post' ? 'story' : 'comment'}
              </Text>
              <View style={s.confirmActions}>
                <Pressable style={[s.confirmCancel, { flex: 1 }]} onPress={() => { setAndroidKbOffset(0); setEditTarget(null); }}>
                  <Text style={s.confirmCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.saveBtn, (editSaving || !editText.trim()) && { opacity: 0.5 }]}
                  onPress={saveEdit}
                  disabled={editSaving || !editText.trim()}
                >
                  {editSaving
                    ? <ActivityIndicator color={c.white} size="small" />
                    : <Text style={s.saveBtnTxt}>Save</Text>}
                </Pressable>
              </View>
              <TextInput
                style={s.editInput}
                multiline
                value={editText}
                onChangeText={t => setEditText(t.slice(0, editTarget?.kind === 'post' ? 500 : 300))}
                placeholder="Write something..."
                placeholderTextColor={c.textFaint}
                textAlignVertical="top"
              />
              <Text style={s.editCharCount}>
                {editText.length}/{editTarget?.kind === 'post' ? 500 : 300}
              </Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Delete confirm modal ────────────────────────────────────────── */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setDeleteTarget(null)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.confirmIconRow}>
              <View style={s.confirmIconCircle}>
                <Ionicons name="trash-outline" size={26} color={c.error} />
              </View>
            </View>
            <Text style={s.confirmTitle}>
              Delete {deleteTarget?.kind === 'post' ? 'story' : 'comment'}?
            </Text>
            <Text style={s.confirmBody}>This cannot be undone.</Text>
            <View style={s.confirmActions}>
              <Pressable style={[s.confirmCancel, { flex: 1 }]} onPress={() => setDeleteTarget(null)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.confirmDelete, deleting && { opacity: 0.6 }]}
                onPress={executeDelete}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator color={c.white} size="small" />
                  : <Text style={s.confirmDeleteTxt}>Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Report modal ────────────────────────────────────────────────── */}
      <Modal visible={!!reportTarget} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setReportTarget(null)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.menuHeader}>
              <Text style={s.menuTitle}>
                Report {reportTarget?.kind === 'post' ? 'story' : 'comment'}
              </Text>
              <Pressable onPress={() => setReportTarget(null)} hitSlop={10} accessibilityLabel="Cancel report" accessibilityRole="button">
                <Ionicons name="close" size={22} color={c.textMuted} />
              </Pressable>
            </View>
            <View style={[s.confirmIconRow, { marginTop: 4 }]}>
              <View style={[s.confirmIconCircle, { backgroundColor: '#fff8e1', borderColor: '#ffe082' }]}>
                <Ionicons name="flag-outline" size={26} color="#f59e0b" />
              </View>
            </View>
            <Text style={s.confirmBody}>Why are you reporting this?</Text>
            {(
              reportTarget?.kind === 'post'
                ? ['Spam', 'Harmful content', 'Misinformation']
                : ['Spam', 'Harmful content']
            ).map(reason => (
              <Pressable
                key={reason}
                style={s.reportReasonRow}
                onPress={() => executeReport(reason)}
                disabled={reporting}
              >
                <Text style={s.reportReasonTxt}>{reason}</Text>
                {reporting
                  ? <ActivityIndicator size="small" color={c.textDisabled} />
                  : <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />}
              </Pressable>
            ))}
            <Pressable style={[s.confirmCancel, { marginTop: 12, alignSelf: 'stretch' }]} onPress={() => setReportTarget(null)}>
              <Text style={s.confirmCancelTxt}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },

  header: { paddingBottom: 14 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: c.white },
  backBtn: { padding: 4 },

  list: { paddingBottom: 24 },

  postCard: { backgroundColor: c.bgCard, padding: 18, marginBottom: 8, gap: 12 },
  postCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: c.white, fontWeight: '700', fontSize: 16 },
  metaCol: { flex: 1 },
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
  menuBtn: { padding: 4 },

  followRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 20, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.bgElement,
  },
  followRowActive: { backgroundColor: c.bgTeal, borderColor: c.primary },
  followRowTxt: { fontSize: 12, fontWeight: '600', color: c.textMuted },

  postContent: { fontSize: 15, color: c.textSecondary, lineHeight: 23 },

  emojiRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingTop: 2 },
  emojiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: c.bgElement, borderWidth: 1, borderColor: c.borderSubtle,
  },
  emojiBtnActive: { backgroundColor: c.bgTeal, borderColor: c.primary },
  emojiBtnEmoji: { fontSize: 18 },
  emojiBtnCount: { fontSize: 13, fontWeight: '600', color: c.textBody },

  postMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaTxt: { fontSize: 13, color: c.textMuted },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shareTxt: { fontSize: 13, color: c.textMuted, fontWeight: '600' },

  divider: { height: 1, backgroundColor: c.borderSubtle },
  commentsLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  commentRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: c.bgCard, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  commentAvatarTxt: { color: c.white, fontWeight: '700', fontSize: 12 },
  commentBody: { flex: 1, gap: 4 },
  commentBodyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
  commentTime: { fontSize: 11, color: c.textDisabled, flex: 1 },
  commentContent: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },

  helpfulBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
    backgroundColor: c.bgElement, borderWidth: 1, borderColor: c.borderSubtle,
    marginTop: 2,
  },
  helpfulBtnActive: { backgroundColor: c.bgTeal, borderColor: c.primary },
  helpfulBtnTxt: { fontSize: 12, color: c.textMuted, fontWeight: '600' },

  noComments: { textAlign: 'center', color: c.textFaint, fontSize: 14, paddingVertical: 32, paddingHorizontal: 20 },

  inputBarWrap: {
    backgroundColor: c.bgCard, borderTopWidth: 1, borderTopColor: c.borderSubtle,
  },
  anonHint: {
    fontSize: 11, color: c.primary, fontWeight: '600',
    paddingHorizontal: 20, paddingTop: 6,
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  anonToggleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.bgElement, borderWidth: 1, borderColor: c.borderSubtle,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  anonToggleBtnActive: { backgroundColor: c.bgTeal, borderColor: c.primary },
  commentInput: {
    flex: 1, backgroundColor: c.bgElement, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: c.textPrimary, maxHeight: 100,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: c.textDisabled },

  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  menuTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  menuIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  menuRowTxt: { flex: 1, fontSize: 16, fontWeight: '500', color: c.textPrimary },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.borderSubtle },

  confirmOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.overlay, padding: 24,
  },
  confirmSheet: {
    backgroundColor: c.bgCard, borderRadius: 22, padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  confirmIconRow: { alignItems: 'center', marginBottom: 12 },
  confirmIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: c.bgError, borderWidth: 1.5, borderColor: c.borderError,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, textAlign: 'center', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 21, marginBottom: 4 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.bgElement },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textBody },
  confirmDelete: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.error },
  confirmDeleteTxt: { color: c.white, fontWeight: '700', fontSize: 15 },

  editInput: {
    backgroundColor: c.bgElement, borderRadius: 12, padding: 12,
    fontSize: 14, color: c.textPrimary, lineHeight: 20,
    minHeight: 100, maxHeight: 200, marginTop: 8,
  },
  editCharCount: { fontSize: 12, color: c.textDisabled, textAlign: 'right', marginTop: 4 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: c.primary },
  saveBtnTxt: { color: c.white, fontWeight: '700', fontSize: 15 },

  reportReasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderSubtle,
  },
  reportReasonTxt: { fontSize: 15, color: c.textSecondary, fontWeight: '500' },
});
