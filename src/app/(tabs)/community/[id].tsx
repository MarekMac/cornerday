import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarColor, REACTION_EMOJIS, TAG_COLORS, timeAgo } from '@/constants/community';
import { supabase } from '@/lib/supabase';

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

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  users: { display_name: string } | null;
}

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { loadAll(); }, [id]);

  const loadAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? null;
    setCurrentUserId(uid);

    const [postRes, commentsRes, reactionsRes] = await Promise.all([
      supabase
        .from('community_posts')
        .select('id, user_id, content, tag, reactions_count, comments_count, created_at, users(display_name)')
        .eq('id', id)
        .single(),
      supabase
        .from('community_comments')
        .select('id, user_id, content, created_at, users(display_name)')
        .eq('post_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('community_reactions')
        .select('emoji, user_id')
        .eq('post_id', id),
    ]);

    setPost(postRes.data as Post ?? null);
    setComments((commentsRes.data as Comment[]) ?? []);

    const counts: Record<string, number> = {};
    let myReaction: string | null = null;
    for (const r of (reactionsRes.data ?? []) as { emoji: string; user_id: string }[]) {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
      if (r.user_id === uid) myReaction = r.emoji;
    }
    setReactionCounts(counts);
    setUserReaction(myReaction);
    setLoading(false);
  };

  const pickReaction = async (emoji: string) => {
    if (!currentUserId || !post) return;
    if (userReaction === emoji) {
      setUserReaction(null);
      setReactionCounts(prev => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] ?? 1) - 1) }));
      setPost(p => p ? { ...p, reactions_count: Math.max(0, p.reactions_count - 1) } : p);
      await supabase.from('community_reactions').delete().eq('post_id', post.id).eq('user_id', currentUserId);
    } else if (userReaction) {
      const old = userReaction;
      setUserReaction(emoji);
      setReactionCounts(prev => ({
        ...prev,
        [old]: Math.max(0, (prev[old] ?? 1) - 1),
        [emoji]: (prev[emoji] ?? 0) + 1,
      }));
      await supabase.from('community_reactions').delete().eq('post_id', post.id).eq('user_id', currentUserId);
      await supabase.from('community_reactions').insert({ post_id: post.id, user_id: currentUserId, emoji });
    } else {
      setUserReaction(emoji);
      setReactionCounts(prev => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
      setPost(p => p ? { ...p, reactions_count: p.reactions_count + 1 } : p);
      await supabase.from('community_reactions').insert({ post_id: post.id, user_id: currentUserId, emoji });
    }
  };

  const submitComment = async () => {
    if (!commentText.trim() || !currentUserId || !post) return;
    setSubmitting(true);
    const text = commentText.trim();
    setCommentText('');

    const { data: { user } } = await supabase.auth.getUser();
    const { data: userData } = await supabase.from('users').select('display_name').eq('id', currentUserId).single();

    const { data, error } = await supabase
      .from('community_comments')
      .insert({ post_id: post.id, user_id: currentUserId, content: text })
      .select('id, user_id, content, created_at')
      .single();

    if (!error && data) {
      const newComment: Comment = {
        ...(data as any),
        users: { display_name: userData?.display_name ?? user?.email ?? '?' },
      };
      setComments(prev => [...prev, newComment]);
      setPost(p => p ? { ...p, comments_count: p.comments_count + 1 } : p);
    }
    setSubmitting(false);
  };

  const sharePost = async () => {
    if (!post) return;
    await Share.share({
      message: `"${post.content}"\n\n— Shared from CornerDay, a gambling recovery app`,
      title: 'Recovery Story',
    });
  };

  const sendReport = async (type: 'post' | 'comment', targetId: string, reason: string) => {
    if (!currentUserId) return;
    await supabase.from('community_reports').insert({
      target_type: type, target_id: targetId, reporter_id: currentUserId, reason,
    });
    Alert.alert('Reported', 'Thank you — we will review this shortly.');
  };

  const deletePost = () => {
    Alert.alert('Delete story', 'This cannot be undone.', [
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('community_posts').delete().eq('id', post!.id);
          router.back();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const deleteComment = (commentId: string) => {
    Alert.alert('Delete comment', 'This cannot be undone.', [
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('community_comments').delete().eq('id', commentId);
          setComments(prev => prev.filter(c => c.id !== commentId));
          setPost(p => p ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const showPostMenu = () => {
    if (!post) return;
    if (post.user_id === currentUserId) {
      deletePost();
    } else {
      Alert.alert('Report story', 'Why are you reporting this?', [
        { text: 'Spam', onPress: () => sendReport('post', post.id, 'Spam') },
        { text: 'Harmful content', onPress: () => sendReport('post', post.id, 'Harmful content') },
        { text: 'Misinformation', onPress: () => sendReport('post', post.id, 'Misinformation') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const showCommentMenu = (comment: Comment) => {
    if (comment.user_id === currentUserId) {
      deleteComment(comment.id);
    } else {
      Alert.alert('Report comment', 'Why are you reporting this?', [
        { text: 'Spam', onPress: () => sendReport('comment', comment.id, 'Spam') },
        { text: 'Harmful content', onPress: () => sendReport('comment', comment.id, 'Harmful content') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#0F6E6E" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#666' }}>Story not found.</Text>
      </View>
    );
  }

  const postAuthor = post.users?.display_name ?? '?';
  const postColor = avatarColor(post.user_id);

  const ListHeader = (
    <View style={s.postCard}>
      <View style={s.postCardHeader}>
        <View style={[s.avatar, { backgroundColor: postColor }]}>
          <Text style={s.avatarTxt}>{postAuthor[0].toUpperCase()}</Text>
        </View>
        <View style={s.metaCol}>
          <Text style={s.authorName}>{postAuthor}</Text>
          <Text style={s.timeStr}>{timeAgo(post.created_at)}</Text>
        </View>
        {post.tag ? (
          <View style={[s.tagPill, { backgroundColor: (TAG_COLORS[post.tag] ?? '#0F6E6E') + '20' }]}>
            <Text style={[s.tagTxt, { color: TAG_COLORS[post.tag] ?? '#0F6E6E' }]}>{post.tag}</Text>
          </View>
        ) : null}
        <Pressable onPress={showPostMenu} style={s.menuBtn} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#999" />
        </Pressable>
      </View>

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
                <Text style={[s.emojiBtnCount, active && { color: '#0F6E6E' }]}>{count}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={s.postMeta}>
        <Pressable onPress={() => inputRef.current?.focus()} hitSlop={6}>
          <Text style={s.metaTxt}>
            💬 {post.comments_count} {post.comments_count === 1 ? 'comment' : 'comments'}
          </Text>
        </Pressable>
        <Pressable style={s.shareBtn} onPress={sharePost} hitSlop={6}>
          <Ionicons name="share-outline" size={15} color="#888" />
          <Text style={s.shareTxt}>Share</Text>
        </Pressable>
      </View>

      <View style={s.divider} />
      <Text style={s.commentsLabel}>Comments</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <Text style={s.headerTitle}>Story</Text>
            <View style={{ width: 30 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={comments}
          keyExtractor={c => c.id}
          ListHeaderComponent={ListHeader}
          extraData={{ post, userReaction, reactionCounts }}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const cName = item.users?.display_name ?? '?';
            const cColor = avatarColor(item.user_id);
            return (
              <View style={s.commentRow}>
                <View style={[s.commentAvatar, { backgroundColor: cColor }]}>
                  <Text style={s.commentAvatarTxt}>{cName[0].toUpperCase()}</Text>
                </View>
                <View style={s.commentBody}>
                  <View style={s.commentBodyHeader}>
                    <Text style={s.commentAuthor}>{cName}</Text>
                    <Text style={s.commentTime}>{timeAgo(item.created_at)}</Text>
                    <Pressable onPress={() => showCommentMenu(item)} hitSlop={8}>
                      <Ionicons name="ellipsis-horizontal" size={14} color="#bbb" />
                    </Pressable>
                  </View>
                  <Text style={s.commentContent}>{item.content}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={s.noComments}>No comments yet. Be the first to reply.</Text>
          }
        />

        <View style={s.inputBar}>
          <TextInput
            ref={inputRef}
            style={s.commentInput}
            placeholder="Reply to community..."
            placeholderTextColor="#aaa"
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
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },

  header: { paddingBottom: 14 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  backBtn: { padding: 4 },

  list: { paddingBottom: 24 },

  postCard: { backgroundColor: '#fff', padding: 18, marginBottom: 8, gap: 12 },
  postCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  metaCol: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '600', color: '#111' },
  timeStr: { fontSize: 12, color: '#999', marginTop: 1 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  tagTxt: { fontSize: 11, fontWeight: '700' },
  menuBtn: { padding: 4 },

  postContent: { fontSize: 15, color: '#222', lineHeight: 23 },

  emojiRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingTop: 2 },
  emojiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ebebeb',
  },
  emojiBtnActive: { backgroundColor: '#e6f7f7', borderColor: '#0F6E6E' },
  emojiBtnEmoji: { fontSize: 18 },
  emojiBtnCount: { fontSize: 13, fontWeight: '600', color: '#666' },

  postMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaTxt: { fontSize: 13, color: '#888' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shareTxt: { fontSize: 13, color: '#888', fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#f0f0f0' },
  commentsLabel: { fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },

  commentRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  commentAvatarTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  commentBody: { flex: 1, gap: 4 },
  commentBodyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: '#111' },
  commentTime: { fontSize: 11, color: '#bbb', flex: 1 },
  commentContent: { fontSize: 14, color: '#333', lineHeight: 20 },

  noComments: { textAlign: 'center', color: '#aaa', fontSize: 14, paddingVertical: 32, paddingHorizontal: 20 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  commentInput: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: '#111', maxHeight: 100,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0F6E6E', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#ccc' },
});
