import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

type MenuTarget = { kind: 'post' } | { kind: 'comment'; id: string };
type ActionTarget = { kind: 'post'; id: string } | { kind: 'comment'; id: string };

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

  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [editTarget, setEditTarget] = useState<ActionTarget | null>(null);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ActionTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reportTarget, setReportTarget] = useState<ActionTarget | null>(null);
  const [reporting, setReporting] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel(`comments-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_comments', filter: `post_id=eq.${id}` },
        async (payload) => {
          const { data } = await supabase
            .from('community_comments')
            .select('id, user_id, content, created_at, users(display_name)')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            setComments(prev => {
              if (prev.some(c => c.id === (data as any).id)) return prev;
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
              return [...prev, data as Comment];
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

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
        users: { display_name: userData?.display_name ?? user?.email ?? 'Anonymous' },
      };
      setComments(prev => {
        if (prev.some(c => c.id === (data as any).id)) return prev;
        return [...prev, newComment];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
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

  // ─── Menu actions ───────────────────────────────────────────────────────────

  const showPostMenu = () => {
    if (!post) return;
    if (post.user_id === currentUserId) {
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
    const targetId = target.kind === 'post' ? post!.id : target.id;
    setDeleteTarget({ kind: target.kind, id: targetId });
  };

  const saveEdit = async () => {
    if (!editTarget || !editText.trim()) return;
    setEditSaving(true);
    if (editTarget.kind === 'post') {
      await supabase.from('community_posts').update({ content: editText.trim() }).eq('id', editTarget.id);
      setPost(p => p ? { ...p, content: editText.trim() } : p);
    } else {
      await supabase.from('community_comments').update({ content: editText.trim() }).eq('id', editTarget.id);
      setComments(prev => prev.map(c => c.id === editTarget.id ? { ...c, content: editText.trim() } : c));
    }
    setEditSaving(false);
    setEditTarget(null);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    if (deleteTarget.kind === 'post') {
      await supabase.from('community_posts').delete().eq('id', deleteTarget.id);
      router.back();
    } else {
      await supabase.from('community_comments').delete().eq('id', deleteTarget.id);
      setComments(prev => prev.filter(c => c.id !== deleteTarget.id));
      setPost(p => p ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p);
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const executeReport = async (reason: string) => {
    if (!reportTarget || !currentUserId || reporting) return;
    setReporting(true);
    await supabase.from('community_reports').insert({
      target_type: reportTarget.kind, target_id: reportTarget.id,
      reporter_id: currentUserId, reason,
    });
    setReporting(false);
    setReportTarget(null);
    Alert.alert('Reported', 'Thank you — we will review this shortly.');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

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

  const postAuthor = post.users?.display_name ?? 'Anonymous';
  const postColor = avatarColor(post.user_id);
  const isPostOwner = post.user_id === currentUserId;

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
          <Ionicons
            name={isPostOwner ? 'ellipsis-horizontal' : 'flag-outline'}
            size={18}
            color={isPostOwner ? '#999' : '#f59e0b'}
          />
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
            💬 {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={comments}
          keyExtractor={c => c.id}
          ListHeaderComponent={ListHeader}
          extraData={{ post, userReaction, reactionCounts }}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const cName = item.users?.display_name ?? 'Anonymous';
            const cColor = avatarColor(item.user_id);
            const isOwner = item.user_id === currentUserId;
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
                      <Ionicons
                        name={isOwner ? 'ellipsis-horizontal' : 'flag-outline'}
                        size={14}
                        color={isOwner ? '#bbb' : '#f59e0b'}
                      />
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
            placeholder="Comment..."
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

      {/* ── Action menu (edit / delete) ─────────────────────────────────── */}
      <Modal visible={!!menuTarget} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)}>
        <Pressable style={s.confirmOverlay} onPress={() => setMenuTarget(null)}>
          <Pressable style={s.confirmSheet} onPress={() => {}}>
            <View style={s.menuHeader}>
              <Text style={s.menuTitle}>
                {menuTarget?.kind === 'post' ? 'Your story' : 'Your comment'}
              </Text>
              <Pressable onPress={() => setMenuTarget(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#999" />
              </Pressable>
            </View>

            <Pressable style={s.menuRow} onPress={handleEditFromMenu}>
              <View style={[s.menuIconWrap, { backgroundColor: '#e6f7f7' }]}>
                <Ionicons name="create-outline" size={20} color="#0F6E6E" />
              </View>
              <Text style={s.menuRowTxt}>Edit</Text>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </Pressable>

            <View style={s.menuDivider} />

            <Pressable style={s.menuRow} onPress={handleDeleteFromMenu}>
              <View style={[s.menuIconWrap, { backgroundColor: '#fff5f5' }]}>
                <Ionicons name="trash-outline" size={20} color="#c0392b" />
              </View>
              <Text style={[s.menuRowTxt, { color: '#c0392b' }]}>Delete</Text>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </Pressable>

            <Pressable style={[s.confirmCancel, { marginTop: 16, alignSelf: 'stretch' }]} onPress={() => setMenuTarget(null)}>
              <Text style={s.confirmCancelTxt}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit modal ──────────────────────────────────────────────────── */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.confirmOverlay} onPress={() => setEditTarget(null)}>
            <Pressable style={s.confirmSheet} onPress={() => {}}>
              <View style={s.confirmIconRow}>
                <View style={[s.confirmIconCircle, { backgroundColor: '#e6f7f7', borderColor: '#b2dfdb' }]}>
                  <Ionicons name="create-outline" size={26} color="#0F6E6E" />
                </View>
              </View>
              <Text style={s.confirmTitle}>
                Edit {editTarget?.kind === 'post' ? 'story' : 'comment'}
              </Text>
              <View style={s.confirmActions}>
                <Pressable style={[s.confirmCancel, { flex: 1 }]} onPress={() => setEditTarget(null)}>
                  <Text style={s.confirmCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.saveBtn, (editSaving || !editText.trim()) && { opacity: 0.5 }]}
                  onPress={saveEdit}
                  disabled={editSaving || !editText.trim()}
                >
                  {editSaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnTxt}>Save</Text>}
                </Pressable>
              </View>
              <TextInput
                style={s.editInput}
                multiline
                value={editText}
                onChangeText={t => setEditText(t.slice(0, editTarget?.kind === 'post' ? 500 : 300))}
                placeholder="Write something..."
                placeholderTextColor="#aaa"
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
                <Ionicons name="trash-outline" size={26} color="#c0392b" />
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
                  ? <ActivityIndicator color="#fff" size="small" />
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
              <Pressable onPress={() => setReportTarget(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#999" />
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
                  ? <ActivityIndicator size="small" color="#ccc" />
                  : <Ionicons name="chevron-forward" size={16} color="#ccc" />}
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

  // ── Action menu (centered) ────────────────────────────────────────────────────
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  menuTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  menuIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  menuRowTxt: { flex: 1, fontSize: 16, fontWeight: '500', color: '#111' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#f0f0f0' },

  // ── Centered modals (edit / delete / report) ─────────────────────────────────
  confirmOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', padding: 24,
  },
  confirmSheet: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 32,
  },
  confirmIconRow: { alignItems: 'center', marginBottom: 12 },
  confirmIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#ffcdd2',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 21, marginBottom: 4 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f5f5f5' },
  confirmCancelTxt: { fontSize: 15, fontWeight: '600', color: '#666' },
  confirmDelete: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#c0392b' },
  confirmDeleteTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Edit modal extras
  editInput: {
    backgroundColor: '#f5f5f5', borderRadius: 12, padding: 12,
    fontSize: 14, color: '#111', lineHeight: 20,
    minHeight: 100, maxHeight: 200, marginTop: 8,
  },
  editCharCount: { fontSize: 12, color: '#bbb', textAlign: 'right', marginTop: 4 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0F6E6E' },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Report modal extras
  reportReasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0',
  },
  reportReasonTxt: { fontSize: 15, color: '#333', fontWeight: '500' },
});
