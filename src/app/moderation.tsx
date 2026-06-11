import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

type AdminTab = 'reports' | 'users' | 'feedback';

interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  is_premium: boolean;
  is_banned: boolean;
}

interface Report {
  id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  reason: string;
  created_at: string;
  status: string;
  content?: string;
}

interface FeedbackItem {
  id: string;
  type: 'bug' | 'feature' | 'general';
  message: string;
  app_version: string | null;
  created_at: string;
  user_id: string | null;
}

export default function ModerationScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>('reports');

  // ── Reports ──────────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    const { data, error } = await supabase
      .from('community_reports')
      .select('id, target_type, target_id, reason, created_at, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error || !data) { setReportsLoading(false); return; }

    const enriched = await Promise.all(data.map(async (r) => {
      if (r.target_type === 'post') {
        const { data: post } = await supabase
          .from('community_posts').select('content').eq('id', r.target_id).single();
        return { ...r, content: post?.content ?? '[Post deleted]' };
      } else {
        const { data: comment } = await supabase
          .from('community_comments').select('content').eq('id', r.target_id).single();
        return { ...r, content: comment?.content ?? '[Comment deleted]' };
      }
    }));

    setReports(enriched as Report[]);
    setReportsLoading(false);
  }, []);

  const dismiss = async (reportId: string) => {
    setActioning(reportId);
    await supabase
      .from('community_reports')
      .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
      .eq('id', reportId);
    setReports(prev => prev.filter(r => r.id !== reportId));
    setActioning(null);
  };

  const deleteContent = async (report: Report) => {
    Alert.alert(
      'Delete content',
      `Delete this ${report.target_type} and dismiss all related reports?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActioning(report.id);
            const table = report.target_type === 'post' ? 'community_posts' : 'community_comments';
            await supabase.from(table).delete().eq('id', report.target_id);
            await supabase
              .from('community_reports')
              .update({ status: 'actioned', reviewed_at: new Date().toISOString() })
              .eq('target_id', report.target_id);
            setReports(prev => prev.filter(r => r.target_id !== report.target_id));
            setActioning(null);
          },
        },
      ]
    );
  };

  // ── Users ────────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userActioning, setUserActioning] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, display_name, email, created_at, is_premium, is_banned')
      .order('created_at', { ascending: false });
    setUsers((data ?? []) as UserRow[]);
    setUsersLoading(false);
  }, []);

  const toggleBan = async (user: UserRow) => {
    const action = user.is_banned ? 'Unban' : 'Ban';
    const name = user.display_name ?? user.email ?? 'this user';
    Alert.alert(
      `${action} user`,
      user.is_banned
        ? `Unban ${name}? They will be able to post in the community again.`
        : `Ban ${name} from the community? They won't be able to post or comment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: user.is_banned ? 'default' : 'destructive',
          onPress: async () => {
            setUserActioning(user.id);
            await supabase.from('users').update({ is_banned: !user.is_banned }).eq('id', user.id);
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_banned: !u.is_banned } : u));
            setUserActioning(null);
          },
        },
      ]
    );
  };

  const deleteUserContent = (user: UserRow) => {
    const name = user.display_name ?? user.email ?? 'this user';
    Alert.alert(
      'Delete community content',
      `Remove all posts and comments by ${name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all content',
          style: 'destructive',
          onPress: async () => {
            setUserActioning(user.id);
            await supabase.from('community_posts').delete().eq('user_id', user.id);
            await supabase.from('community_comments').delete().eq('user_id', user.id);
            setUserActioning(null);
          },
        },
      ]
    );
  };

  // ── Feedback ─────────────────────────────────────────────────────────────────
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);

  const [deletingFeedback, setDeletingFeedback] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    const { data } = await supabase
      .from('feedback')
      .select('id, type, message, app_version, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(100);
    setFeedbackItems((data ?? []) as FeedbackItem[]);
    setFeedbackLoading(false);
  }, []);

  const deleteFeedback = (item: FeedbackItem) => {
    Alert.alert(
      'Delete feedback',
      'Remove this submission permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingFeedback(item.id);
            await supabase.from('feedback').delete().eq('id', item.id);
            setFeedbackItems(prev => prev.filter(f => f.id !== item.id));
            setDeletingFeedback(null);
          },
        },
      ]
    );
  };

  useEffect(() => { loadReports(); loadUsers(); loadFeedback(); }, [loadReports, loadUsers, loadFeedback]);

  const FEEDBACK_TYPE_LABEL: Record<string, string> = {
    bug: '🐛 Bug',
    feature: '✨ Feature',
    general: '💬 General',
  };
  const FEEDBACK_TYPE_COLOR: Record<string, string> = {
    bug: '#fef2f2',
    feature: '#f0fdf4',
    general: '#eff6ff',
  };
  const FEEDBACK_TYPE_TEXT: Record<string, string> = {
    bug: '#b91c1c',
    feature: '#166534',
    general: '#1d4ed8',
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={c.white} />
            </Pressable>
            <Text style={s.headerTitle}>Admin Panel</Text>
            <View style={{ width: 34 }} />
          </View>
          <View style={s.tabBar}>
            <Pressable
              style={[s.tabBtn, tab === 'reports' && s.tabBtnActive]}
              onPress={() => setTab('reports')}>
              <Text style={[s.tabBtnTxt, tab === 'reports' && s.tabBtnTxtActive]}>
                Reports{reports.length > 0 ? ` (${reports.length})` : ''}
              </Text>
            </Pressable>
            <Pressable
              style={[s.tabBtn, tab === 'users' && s.tabBtnActive]}
              onPress={() => setTab('users')}>
              <Text style={[s.tabBtnTxt, tab === 'users' && s.tabBtnTxtActive]}>
                Users{users.length > 0 ? ` (${users.length})` : ''}
              </Text>
            </Pressable>
            <Pressable
              style={[s.tabBtn, tab === 'feedback' && s.tabBtnActive]}
              onPress={() => setTab('feedback')}>
              <Text style={[s.tabBtnTxt, tab === 'feedback' && s.tabBtnTxtActive]}>
                Feedback{feedbackItems.length > 0 ? ` (${feedbackItems.length})` : ''}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ── Reports tab ── */}
      {tab === 'reports' && (
        reportsLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
        ) : reports.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="checkmark-circle-outline" size={52} color={c.primaryLight} />
            <Text style={s.emptyTitle}>All clear</Text>
            <Text style={s.emptyBody}>No pending reports.</Text>
          </View>
        ) : (
          <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
            <Text style={s.countLabel}>{reports.length} pending report{reports.length !== 1 ? 's' : ''}</Text>
            {reports.map(report => (
              <View key={report.id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.typePill, report.target_type === 'post' ? s.typePillPost : s.typePillComment]}>
                    <Text style={s.typePillTxt}>{report.target_type === 'post' ? 'Post' : 'Comment'}</Text>
                  </View>
                  <View style={s.reasonPill}>
                    <Text style={s.reasonPillTxt}>{report.reason}</Text>
                  </View>
                  <Text style={s.dateText}>
                    {new Date(report.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text style={s.contentText} numberOfLines={4}>{report.content}</Text>
                <View style={s.actions}>
                  <Pressable
                    style={({ pressed }) => [s.dismissBtn, pressed && { opacity: 0.7 }, actioning === report.id && s.btnDisabled]}
                    onPress={() => dismiss(report.id)}
                    disabled={!!actioning}>
                    {actioning === report.id
                      ? <ActivityIndicator size="small" color={c.textBody} />
                      : <Text style={s.dismissBtnTxt}>Dismiss</Text>}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }, actioning === report.id && s.btnDisabled]}
                    onPress={() => deleteContent(report)}
                    disabled={!!actioning}>
                    <Ionicons name="trash-outline" size={14} color={c.white} />
                    <Text style={s.deleteBtnTxt}>Delete content</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        )
      )}

      {/* ── Users tab ── */}
      {tab === 'users' && (
        usersLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
        ) : users.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="people-outline" size={52} color={c.primaryLight} />
            <Text style={s.emptyTitle}>No users yet</Text>
            <Text style={s.emptyBody}>Registered users will appear here.</Text>
          </View>
        ) : (
          <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
            <Text style={s.countLabel}>{users.length} user{users.length !== 1 ? 's' : ''}</Text>
            {users.map(user => (
              <View key={user.id} style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.userName} numberOfLines={1}>
                    {user.display_name ?? '(no name)'}
                  </Text>
                  {user.is_premium && (
                    <View style={s.premiumPill}>
                      <Text style={s.premiumPillTxt}>Premium</Text>
                    </View>
                  )}
                  {user.is_banned && (
                    <View style={s.bannedPill}>
                      <Text style={s.bannedPillTxt}>Banned</Text>
                    </View>
                  )}
                  <Text style={s.dateText}>
                    {new Date(user.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' })}
                  </Text>
                </View>
                {!!user.email && (
                  <Text style={s.userEmail} numberOfLines={1}>{user.email}</Text>
                )}
                <View style={s.actions}>
                  <Pressable
                    style={({ pressed }) => [
                      s.userBanBtn,
                      user.is_banned && s.userUnbanBtn,
                      pressed && { opacity: 0.7 },
                      userActioning === user.id && s.btnDisabled,
                    ]}
                    onPress={() => toggleBan(user)}
                    disabled={!!userActioning}>
                    {userActioning === user.id
                      ? <ActivityIndicator size="small" color={c.white} />
                      : <Text style={s.userBanBtnTxt}>{user.is_banned ? 'Unban' : 'Ban'}</Text>}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }, userActioning === user.id && s.btnDisabled]}
                    onPress={() => deleteUserContent(user)}
                    disabled={!!userActioning}>
                    <Ionicons name="trash-outline" size={14} color={c.white} />
                    <Text style={s.deleteBtnTxt}>Delete content</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        )
      )}

      {/* ── Feedback tab ── */}
      {tab === 'feedback' && (
        feedbackLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
        ) : feedbackItems.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="chatbubble-ellipses-outline" size={52} color={c.primaryLight} />
            <Text style={s.emptyTitle}>No feedback yet</Text>
            <Text style={s.emptyBody}>Submissions will appear here.</Text>
          </View>
        ) : (
          <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
            <Text style={s.countLabel}>{feedbackItems.length} submission{feedbackItems.length !== 1 ? 's' : ''}</Text>
            {feedbackItems.map(item => (
              <View key={item.id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.typePill, { backgroundColor: FEEDBACK_TYPE_COLOR[item.type] }]}>
                    <Text style={[s.typePillTxt, { color: FEEDBACK_TYPE_TEXT[item.type] }]}>
                      {FEEDBACK_TYPE_LABEL[item.type]}
                    </Text>
                  </View>
                  {item.app_version && (
                    <View style={s.versionPill}>
                      <Text style={s.versionPillTxt}>v{item.app_version}</Text>
                    </View>
                  )}
                  <Text style={s.dateText}>
                    {new Date(item.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' })}
                  </Text>
                </View>
                <Text style={s.contentText}>{item.message}</Text>
                <View style={s.fbActions}>
                  <Pressable
                    style={({ pressed }) => [s.fbDeleteBtn, pressed && { opacity: 0.7 }, deletingFeedback === item.id && s.btnDisabled]}
                    onPress={() => deleteFeedback(item)}
                    disabled={!!deletingFeedback}>
                    {deletingFeedback === item.id
                      ? <ActivityIndicator size="small" color={c.white} />
                      : <>
                          <Ionicons name="trash-outline" size={14} color={c.white} />
                          <Text style={s.fbDeleteBtnTxt}>Delete</Text>
                        </>}
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        )
      )}
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgScreen },
  header: { paddingBottom: 0 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
  },
  backBtn: { width: 34, alignItems: 'center' },
  headerTitle: { color: c.white, fontSize: 17, fontWeight: '700' },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 0 },
  tabBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: c.white },
  tabBtnTxt: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  tabBtnTxtActive: { color: c.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  emptyBody: { fontSize: 14, color: c.textMuted },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },
  countLabel: { fontSize: 13, color: c.textMuted, marginBottom: 4 },
  card: {
    backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typePillPost: { backgroundColor: c.bgTeal },
  typePillComment: { backgroundColor: c.bgElement },
  typePillTxt: { fontSize: 11, fontWeight: '700', color: c.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonPill: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  reasonPillTxt: { fontSize: 11, color: '#b45309', fontWeight: '600' },
  versionPill: { backgroundColor: c.bgElement, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  versionPillTxt: { fontSize: 11, color: c.textBody, fontWeight: '600' },
  dateText: { marginLeft: 'auto', fontSize: 11, color: c.textFaint },
  contentText: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dismissBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: c.bgElement, alignItems: 'center' },
  dismissBtnTxt: { fontSize: 13, fontWeight: '600', color: c.textBody },
  deleteBtn: {
    flex: 2, flexDirection: 'row', paddingVertical: 9, borderRadius: 10,
    backgroundColor: c.error, alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  deleteBtnTxt: { fontSize: 13, fontWeight: '600', color: c.white },
  btnDisabled: { opacity: 0.5 },
  userName: { fontSize: 15, fontWeight: '700', color: c.textPrimary, flex: 1 },
  userEmail: { fontSize: 12, color: c.textFaint, marginTop: -4 },
  premiumPill: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  premiumPillTxt: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  bannedPill: { backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  bannedPillTxt: { fontSize: 11, fontWeight: '700', color: c.error },
  userBanBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: c.error, alignItems: 'center', justifyContent: 'center',
  },
  userUnbanBtn: { backgroundColor: '#27ae60' },
  userBanBtnTxt: { fontSize: 13, fontWeight: '600', color: c.white },
  fbActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  fbDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: c.error,
  },
  fbDeleteBtnTxt: { fontSize: 13, fontWeight: '600', color: c.white },
});
