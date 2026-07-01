import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/context/theme';
import { useUser } from '@/context/user';
import { AppColors } from '@/constants/theme';

type AdminTab = 'reports' | 'users' | 'feedback';

type BanDuration = '1w' | '1m' | '3m' | '6m' | 'permanent';
const BAN_DURATION_LABELS: Record<BanDuration, string> = { '1w': '1 Week', '1m': '1 Month', '3m': '3 Months', '6m': '6 Months', permanent: 'Permanent' };
const BAN_DURATION_MS: Record<BanDuration, number | null> = { '1w': 7 * 86400000, '1m': 30 * 86400000, '3m': 90 * 86400000, '6m': 180 * 86400000, permanent: null };

function fmtBanExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'Permanent';
  const d = new Date(expiresAt);
  if (d <= new Date()) return 'Expired';
  return `Until ${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function fmtBanRemaining(expiresAt: string | null): string | null {
  if (!expiresAt) return null; // permanent — no countdown
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} remaining`;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} remaining`;
  return '< 1 hour remaining';
}

type StatusFilter = 'all' | 'active' | 'banned';
type TierFilter = 'all' | 'free' | 'premium' | 'admin';

interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  is_premium: boolean;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
  ban_appeal_note: string | null;
}

interface UserDetail {
  currentStreak: number;
  longestStreak: number;
  postCount: number;
  commentCount: number;
  urgeCount: number;
  lossCount: number;
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
  const { isAdmin } = useUser();
  const [tab, setTab] = useState<AdminTab>('reports');

  // ── Reports ──────────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_reports')
        .select('id, target_type, target_id, reason, created_at, status')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error || !data) return;
      const enriched = await Promise.all(data.map(async (r) => {
        if (r.target_type === 'post') {
          const { data: post } = await supabase
            .from('community_posts').select('content').eq('id', r.target_id).maybeSingle();
          return { ...r, content: post?.content ?? '[Post deleted]' };
        } else {
          const { data: comment } = await supabase
            .from('community_comments').select('content').eq('id', r.target_id).maybeSingle();
          return { ...r, content: comment?.content ?? '[Comment deleted]' };
        }
      }));
      setReports(enriched as Report[]);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const dismiss = async (reportId: string) => {
    setActioning(reportId);
    try {
      const { error } = await supabase
        .from('community_reports')
        .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
        .eq('id', reportId);
      if (error) { Alert.alert('Error', 'Could not dismiss report. Please try again.'); return; }
      setReports(prev => prev.filter(r => r.id !== reportId));
    } finally {
      setActioning(null);
    }
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
            try {
              const table = report.target_type === 'post' ? 'community_posts' : 'community_comments';
              const { error: delErr } = await supabase.from(table).delete().eq('id', report.target_id);
              if (delErr) { Alert.alert('Error', 'Could not delete content. Please try again.'); return; }
              const { error: updErr } = await supabase
                .from('community_reports')
                .update({ status: 'actioned', reviewed_at: new Date().toISOString() })
                .eq('target_id', report.target_id);
              if (updErr) { Alert.alert('Error', 'Content deleted but could not update report status.'); }
              setReports(prev => prev.filter(r => r.target_id !== report.target_id));
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  };

  // ── Users ────────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userActioning, setUserActioning] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  // Detail modal
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [detailData, setDetailData] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Ban form modal
  const [banFormUser, setBanFormUser] = useState<UserRow | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<BanDuration>('permanent');
  const [banAppeal, setBanAppeal] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Delete content modal
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deletePosts, setDeletePosts] = useState(true);
  const [deleteComments, setDeleteComments] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const [{ data: { user } }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('users')
          .select('id, display_name, email, created_at, is_premium, is_admin, is_banned, ban_reason, ban_expires_at, ban_appeal_note')
          .order('created_at', { ascending: false }),
      ]);
      if (user) setCurrentUserId(user.id);
      setUsers((data ?? []) as UserRow[]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return users.filter(u => {
      if (q && !((u.display_name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))) return false;
      if (statusFilter === 'active' && u.is_banned) return false;
      if (statusFilter === 'banned' && !u.is_banned) return false;
      if (tierFilter === 'free' && (u.is_premium || u.is_admin)) return false;
      if (tierFilter === 'premium' && !u.is_premium) return false;
      if (tierFilter === 'admin' && !u.is_admin) return false;
      return true;
    });
  }, [users, searchQuery, statusFilter, tierFilter]);

  const openDetail = async (user: UserRow) => {
    setDetailUser(user);
    setDetailData(null);
    setDetailLoading(true);
    try {
    const [streakRes, postRes, commentRes, urgeRes, lossRes] = await Promise.all([
      supabase.from('streaks').select('current_streak, longest_streak').eq('user_id', user.id).maybeSingle(),
      supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('community_comments').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('urge_journal').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('losses').select('*', { count: 'exact', head: true }).eq('user_id', user.id).neq('type', 'journey_started'),
    ]);

    setDetailData({
      currentStreak: streakRes.data?.current_streak ?? 0,
      longestStreak: streakRes.data?.longest_streak ?? 0,
      postCount: postRes.count ?? 0,
      commentCount: commentRes.count ?? 0,
      urgeCount: urgeRes.count ?? 0,
      lossCount: lossRes.count ?? 0,
    });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailUser(null);
    setDetailData(null);
  };

  const openBanForm = (user: UserRow) => {
    setBanFormUser(user);
    setBanReason('');
    setBanDuration('permanent');
    setBanAppeal('');
  };

  const submitBan = async () => {
    if (!banFormUser) return;
    if (!banReason.trim()) return;
    setBanSubmitting(true);
    try {
      const ms = BAN_DURATION_MS[banDuration];
      const expiresAt = ms ? new Date(Date.now() + ms).toISOString() : null;
      const patch = { is_banned: true, ban_reason: banReason.trim() || null, ban_expires_at: expiresAt, ban_appeal_note: banAppeal.trim() || null };
      const { error: banErr } = await supabase.from('users').update(patch).eq('id', banFormUser.id);
      if (banErr) { Alert.alert('Ban failed', banErr.message); return; }
      const updated = { ...banFormUser, ...patch };
      setUsers(prev => prev.map(u => u.id === banFormUser.id ? updated : u));
      if (detailUser?.id === banFormUser.id) setDetailUser(updated);
      setBanFormUser(null);
    } finally {
      setBanSubmitting(false);
    }
  };

  const unban = (user: UserRow) => {
    const name = user.display_name ?? user.email ?? 'this user';
    Alert.alert('Unban user', `Allow ${name} to post in the community again?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unban',
        onPress: async () => {
          setUserActioning(user.id);
          try {
            const patch = { is_banned: false, ban_reason: null, ban_expires_at: null, ban_appeal_note: null };
            const { error: unbanErr } = await supabase.from('users').update(patch).eq('id', user.id);
            if (unbanErr) { Alert.alert('Unban failed', unbanErr.message); return; }
            const updated = { ...user, ...patch };
            setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
            if (detailUser?.id === user.id) setDetailUser(updated);
          } finally {
            setUserActioning(null);
          }
        },
      },
    ]);
  };

  const openDeleteModal = (user: UserRow) => {
    setDeleteTarget(user);
    setDeletePosts(true);
    setDeleteComments(true);
  };

  const confirmDeleteContent = async () => {
    if (!deleteTarget || (!deletePosts && !deleteComments)) return;
    setDeleting(true);
    try {
      if (deletePosts) {
        const { error } = await supabase.from('community_posts').delete().eq('user_id', deleteTarget.id);
        if (error) { Alert.alert('Error', 'Could not delete posts. Please try again.'); return; }
      }
      if (deleteComments) {
        const { error } = await supabase.from('community_comments').delete().eq('user_id', deleteTarget.id);
        if (error) { Alert.alert('Error', 'Could not delete comments. Please try again.'); return; }
      }
      if (detailData) {
        setDetailData(prev => prev ? {
          ...prev,
          postCount: deletePosts ? 0 : prev.postCount,
          commentCount: deleteComments ? 0 : prev.commentCount,
        } : prev);
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Feedback ─────────────────────────────────────────────────────────────────
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [deletingFeedback, setDeletingFeedback] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    try {
      const { data } = await supabase
        .from('feedback')
        .select('id, type, message, app_version, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(100);
      setFeedbackItems((data ?? []) as FeedbackItem[]);
    } finally {
      setFeedbackLoading(false);
    }
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
            try {
              const { error: delErr } = await supabase.from('feedback').delete().eq('id', item.id);
              if (delErr) { Alert.alert('Delete failed', delErr.message); return; }
              setFeedbackItems(prev => prev.filter(f => f.id !== item.id));
            } finally {
              setDeletingFeedback(null);
            }
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
    bug: c.bgError,
    feature: c.bgSuccess,
    general: '#eff6ff',
  };
  const FEEDBACK_TYPE_TEXT: Record<string, string> = {
    bug: c.textError,
    feature: c.success,
    general: '#1d4ed8',
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });

  // Moved below all hooks — this used to return before ~30 useState/useCallback
  // calls further down, so a component that mounts with isAdmin false and later
  // flips true (e.g. once the user profile loads) would call a different number
  // of hooks between renders, a genuine Rules-of-Hooks violation that crashes.
  if (!isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <Text style={{ fontSize: 16, color: c.textSecondary }}>Unauthorized</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root}>
      <View style={[s.header, { backgroundColor: c.headerBg }]}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={c.white} />
            </Pressable>
            <Text style={s.headerTitle}>Admin Panel</Text>
            <View style={{ width: 34 }} />
          </View>
          <View style={s.tabBar}>
            {(['reports', 'users', 'feedback'] as AdminTab[]).map(t => (
              <Pressable key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[s.tabBtnTxt, tab === t && s.tabBtnTxtActive]}>
                  {t === 'reports' ? `Reports${reports.length > 0 ? ` (${reports.length})` : ''}`
                    : t === 'users' ? `Users${users.length > 0 ? ` (${users.length})` : ''}`
                    : `Feedback${feedbackItems.length > 0 ? ` (${feedbackItems.length})` : ''}`}
                </Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </View>

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
                  <Text style={s.dateText}>{fmtDate(report.created_at)}</Text>
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
          <>
            {/* Search + filters */}
            <View style={s.userControls}>
              <View style={s.searchRow}>
                <Ionicons name="search-outline" size={16} color={c.textFaint} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search by name or email…"
                  placeholderTextColor={c.textFaint}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={c.textFaint} />
                  </Pressable>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                <Text style={s.filterGroupLabel}>Status:</Text>
                {(['all', 'active', 'banned'] as StatusFilter[]).map(f => (
                  <Pressable key={f} style={[s.filterChip, statusFilter === f && s.filterChipActive]} onPress={() => setStatusFilter(f)}>
                    <Text style={[s.filterChipTxt, statusFilter === f && s.filterChipTxtActive]}>
                      {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Banned'}
                    </Text>
                  </Pressable>
                ))}
                <View style={s.filterDivider} />
                <Text style={s.filterGroupLabel}>Tier:</Text>
                {(['all', 'free', 'premium', 'admin'] as TierFilter[]).map(f => (
                  <Pressable key={f} style={[s.filterChip, tierFilter === f && s.filterChipActive]} onPress={() => setTierFilter(f)}>
                    <Text style={[s.filterChipTxt, tierFilter === f && s.filterChipTxtActive]}>
                      {f === 'all' ? 'All' : f === 'free' ? 'Free' : f === 'premium' ? 'Premium' : 'Admin'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
              <Text style={s.countLabel}>
                {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
              </Text>
              {filteredUsers.map(user => {
                const isSelf = user.id === currentUserId;
                const remaining = user.is_banned ? fmtBanRemaining(user.ban_expires_at) : null;
                const tierStyle = user.is_admin ? s.tierPillAdmin : user.is_premium ? s.tierPillPremium : s.tierPillFree;
                const tierTxtStyle = user.is_admin ? s.tierPillTxtAdmin : user.is_premium ? s.tierPillTxtPremium : s.tierPillTxtFree;
                const tierLabel = user.is_admin ? '🛡 Admin' : user.is_premium ? '⭐ Premium' : 'Free';
                return (
                  <Pressable key={user.id} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} onPress={() => openDetail(user)}>
                    <View style={s.cardHeader}>
                      <Text style={s.userName} numberOfLines={1}>
                        {user.display_name ?? '(no name)'}{isSelf ? ' (you)' : ''}
                      </Text>
                      <View style={[s.tierPill, tierStyle]}>
                        <Text style={[s.tierPillTxt, tierTxtStyle]}>{tierLabel}</Text>
                      </View>
                      {user.is_banned && (
                        <View style={s.bannedPill}>
                          <Text style={s.bannedPillTxt}>Banned</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={c.textFaint} style={{ marginLeft: 'auto' }} />
                    </View>
                    {!!user.email && <Text style={s.userEmail} numberOfLines={1}>{user.email}</Text>}
                    <View style={s.userMetaRow}>
                      <Text style={s.userJoined}>Joined {fmtDate(user.created_at)}</Text>
                      {remaining && <Text style={s.banRemaining}>{remaining}</Text>}
                    </View>
                    {!isSelf && (
                      <View style={s.actions}>
                        <Pressable
                          style={({ pressed }) => [
                            s.banBtn,
                            user.is_banned && s.unbanBtn,
                            pressed && { opacity: 0.7 },
                            userActioning === user.id && s.btnDisabled,
                          ]}
                          onPress={e => { e.stopPropagation?.(); user.is_banned ? unban(user) : openBanForm(user); }}
                          disabled={!!userActioning}>
                          {userActioning === user.id
                            ? <ActivityIndicator size="small" color={c.white} />
                            : <Text style={s.banBtnTxt}>{user.is_banned ? 'Unban' : 'Ban'}</Text>}
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [s.contentBtn, pressed && { opacity: 0.7 }, userActioning === user.id && s.btnDisabled]}
                          onPress={e => { e.stopPropagation?.(); openDeleteModal(user); }}
                          disabled={!!userActioning}>
                          <Ionicons name="trash-outline" size={14} color={c.white} />
                          <Text style={s.contentBtnTxt}>Delete content</Text>
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              })}
              {filteredUsers.length === 0 && (
                <View style={[s.center, { flex: 0, paddingVertical: 40 }]}>
                  <Text style={s.emptyBody}>No users match your filters.</Text>
                </View>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>
          </>
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
                  <Text style={s.dateText}>{fmtDate(item.created_at)}</Text>
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

      {/* ── User detail modal ── */}
      <Modal visible={!!detailUser} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDetail}>
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{detailUser?.display_name ?? '(no name)'}</Text>
            <Pressable onPress={closeDetail} hitSlop={10} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color={c.textPrimary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.modalBody}>
            {/* Badges row */}
            <View style={s.modalBadgeRow}>
              <View style={[s.tierPill, detailUser?.is_premium ? s.tierPillPremium : s.tierPillFree]}>
                <Text style={[s.tierPillTxt, detailUser?.is_premium ? s.tierPillTxtPremium : s.tierPillTxtFree]}>
                  {detailUser?.is_premium ? '⭐ Premium' : 'Free'}
                </Text>
              </View>
              {detailUser?.is_banned && (
                <View style={s.bannedPill}><Text style={s.bannedPillTxt}>Banned</Text></View>
              )}
              <Text style={s.modalJoined}>
                Joined {detailUser ? fmtDate(detailUser.created_at) : ''}
              </Text>
            </View>
            {!!detailUser?.email && (
              <Text style={s.modalEmail}>{detailUser.email}</Text>
            )}

            {/* Activity stats */}
            <Text style={s.modalSectionTitle}>Activity</Text>
            {detailLoading ? (
              <View style={s.modalLoading}><ActivityIndicator color={c.primary} /></View>
            ) : detailData ? (
              <View style={s.statsGrid}>
                {[
                  { label: 'Current streak', value: `${detailData.currentStreak}d` },
                  { label: 'Longest streak', value: `${detailData.longestStreak}d` },
                  { label: 'Posts', value: String(detailData.postCount) },
                  { label: 'Comments', value: String(detailData.commentCount) },
                  { label: 'Urges logged', value: String(detailData.urgeCount) },
                  { label: 'Loss entries', value: String(detailData.lossCount) },
                ].map(item => (
                  <View key={item.label} style={s.statCell}>
                    <Text style={s.statCellValue}>{item.value}</Text>
                    <Text style={s.statCellLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Ban details */}
            {detailUser?.is_banned && (
              <>
                <Text style={s.modalSectionTitle}>Ban details</Text>
                <View style={s.banDetailsBox}>
                  <View style={s.banDetailRow}>
                    <Text style={s.banDetailLabel}>Status</Text>
                    <Text style={s.banDetailValue}>{fmtBanExpiry(detailUser.ban_expires_at)}</Text>
                  </View>
                  {!!detailUser.ban_reason && (
                    <View style={s.banDetailRow}>
                      <Text style={s.banDetailLabel}>Reason</Text>
                      <Text style={[s.banDetailValue, { flex: 1 }]}>{detailUser.ban_reason}</Text>
                    </View>
                  )}
                  {!!detailUser.ban_appeal_note && (
                    <View style={s.banDetailRow}>
                      <Text style={s.banDetailLabel}>Appeal</Text>
                      <Text style={[s.banDetailValue, { flex: 1 }]}>{detailUser.ban_appeal_note}</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Actions */}
            <Text style={s.modalSectionTitle}>Actions</Text>
            {detailUser?.id === currentUserId ? (
              <View style={s.selfNote}>
                <Ionicons name="shield-checkmark-outline" size={16} color={c.textMuted} />
                <Text style={s.selfNoteText}>You cannot moderate your own account.</Text>
              </View>
            ) : (
              <View style={s.modalActions}>
                {detailUser && (
                  <Pressable
                    style={({ pressed }) => [
                      s.modalActionBtn,
                      detailUser.is_banned ? s.modalActionUnban : s.modalActionBan,
                      pressed && { opacity: 0.8 },
                      userActioning === detailUser.id && s.btnDisabled,
                    ]}
                    onPress={() => detailUser && (detailUser.is_banned ? unban(detailUser) : openBanForm(detailUser))}
                    disabled={!!userActioning}>
                    {userActioning === detailUser.id
                      ? <ActivityIndicator size="small" color={c.white} />
                      : <>
                          <Ionicons name={detailUser.is_banned ? 'checkmark-circle-outline' : 'ban-outline'} size={16} color={c.white} />
                          <Text style={s.modalActionBtnTxt}>{detailUser.is_banned ? 'Unban user' : 'Ban user'}</Text>
                        </>}
                  </Pressable>
                )}
                {detailUser && (
                  <Pressable
                    style={({ pressed }) => [s.modalActionBtn, s.modalActionDelete, pressed && { opacity: 0.8 }]}
                    onPress={() => { closeDetail(); openDeleteModal(detailUser!); }}>
                    <Ionicons name="trash-outline" size={16} color={c.white} />
                    <Text style={s.modalActionBtnTxt}>Delete content</Text>
                  </Pressable>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Ban form modal ── */}
      <Modal visible={!!banFormUser} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBanFormUser(null)}>
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Ban {banFormUser?.display_name ?? banFormUser?.email ?? 'user'}</Text>
            <Pressable onPress={() => setBanFormUser(null)} hitSlop={10} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color={c.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.banFieldLabel}>Why are they being banned?</Text>
            <TextInput
              style={s.banInput}
              placeholder="E.g. Posting harmful content"
              placeholderTextColor={c.textFaint}
              value={banReason}
              onChangeText={setBanReason}
              multiline
              numberOfLines={3}
            />

            <Text style={s.banFieldLabel}>Duration</Text>
            <View style={s.banDurationRow}>
              {(Object.keys(BAN_DURATION_LABELS) as BanDuration[]).map(d => (
                <Pressable
                  key={d}
                  style={[s.banDurationChip, banDuration === d && s.banDurationChipActive]}
                  onPress={() => setBanDuration(d)}>
                  <Text style={[s.banDurationChipTxt, banDuration === d && s.banDurationChipTxtActive]}>
                    {BAN_DURATION_LABELS[d]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.banFieldLabel}>To get unbanned, they should:</Text>
            <TextInput
              style={s.banInput}
              placeholder="E.g. Contact support and confirm they understand the community guidelines"
              placeholderTextColor={c.textFaint}
              value={banAppeal}
              onChangeText={setBanAppeal}
              multiline
              numberOfLines={3}
            />

            <View style={s.deleteModalBtns}>
              <Pressable style={({ pressed }) => [s.deleteModalCancel, pressed && { opacity: 0.7 }]} onPress={() => setBanFormUser(null)}>
                <Text style={s.deleteModalCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.modalActionBtn, s.modalActionBan, (banSubmitting || !banReason.trim()) && s.btnDisabled, pressed && { opacity: 0.8 }]}
                onPress={submitBan}
                disabled={banSubmitting || !banReason.trim()}>
                {banSubmitting
                  ? <ActivityIndicator size="small" color={c.white} />
                  : <Text style={s.modalActionBtnTxt}>Ban user</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Delete content modal ── */}
      <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={() => setDeleteTarget(null)}>
        <View style={s.overlayBg}>
          <View style={s.deleteModal}>
            <Text style={s.deleteModalTitle}>Delete content</Text>
            <Text style={s.deleteModalSub}>
              Choose what to delete for{' '}
              <Text style={{ fontWeight: '700' }}>{deleteTarget?.display_name ?? deleteTarget?.email ?? 'this user'}</Text>
            </Text>

            <Pressable style={s.checkRow} onPress={() => setDeletePosts(v => !v)}>
              <View style={[s.checkbox, deletePosts && s.checkboxOn]}>
                {deletePosts && <Ionicons name="checkmark" size={14} color={c.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.checkLabel}>Community posts</Text>
                {detailData && deleteTarget?.id === detailUser?.id && (
                  <Text style={s.checkSub}>{detailData.postCount} post{detailData.postCount !== 1 ? 's' : ''}</Text>
                )}
              </View>
            </Pressable>

            <Pressable style={s.checkRow} onPress={() => setDeleteComments(v => !v)}>
              <View style={[s.checkbox, deleteComments && s.checkboxOn]}>
                {deleteComments && <Ionicons name="checkmark" size={14} color={c.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.checkLabel}>Community comments</Text>
                {detailData && deleteTarget?.id === detailUser?.id && (
                  <Text style={s.checkSub}>{detailData.commentCount} comment{detailData.commentCount !== 1 ? 's' : ''}</Text>
                )}
              </View>
            </Pressable>

            <View style={s.deleteModalBtns}>
              <Pressable style={({ pressed }) => [s.deleteModalCancel, pressed && { opacity: 0.7 }]} onPress={() => setDeleteTarget(null)}>
                <Text style={s.deleteModalCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  s.deleteModalConfirm,
                  (!deletePosts && !deleteComments) && s.btnDisabled,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={confirmDeleteContent}
                disabled={(!deletePosts && !deleteComments) || deleting}>
                {deleting
                  ? <ActivityIndicator size="small" color={c.white} />
                  : <Text style={s.deleteModalConfirmTxt}>Delete selected</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8,
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

  // User card
  userName: { fontSize: 15, fontWeight: '700', color: c.textPrimary, flex: 1 },
  userEmail: { fontSize: 12, color: c.textFaint },
  userMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userJoined: { fontSize: 11, color: c.textFaint },
  banRemaining: { fontSize: 11, color: c.textError, fontWeight: '600' },

  // Search + filter bar
  userControls: { backgroundColor: c.bgCard, borderBottomWidth: 1, borderBottomColor: c.borderSubtle, paddingBottom: 8 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 10, marginBottom: 6,
    backgroundColor: c.bgInput, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: c.textPrimary, padding: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  filterGroupLabel: { fontSize: 12, fontWeight: '600', color: c.textFaint, marginRight: 2 },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: c.bgElement, borderWidth: 1.5, borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: c.bgTeal, borderColor: c.primaryMid },
  filterChipTxt: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  filterChipTxtActive: { color: c.primary },
  filterDivider: { width: 1, height: 16, backgroundColor: c.borderSubtle, marginHorizontal: 4 },

  // Self-moderation notice
  selfNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, opacity: 0.6 },
  selfNoteText: { fontSize: 14, color: c.textMuted, fontStyle: 'italic' },

  tierPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tierPillFree: { backgroundColor: c.bgElement },
  tierPillPremium: { backgroundColor: '#fef3c7' },
  tierPillAdmin: { backgroundColor: '#ede9fe' },
  tierPillTxt: { fontSize: 11, fontWeight: '700' },
  tierPillTxtFree: { color: c.textMuted },
  tierPillTxtPremium: { color: '#b45309' },
  tierPillTxtAdmin: { color: '#6d28d9' },

  bannedPill: { backgroundColor: c.bgError, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  bannedPillTxt: { fontSize: 11, fontWeight: '700', color: c.error },

  banBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: c.error, alignItems: 'center', justifyContent: 'center',
  },
  unbanBtn: { backgroundColor: c.success },
  banBtnTxt: { fontSize: 13, fontWeight: '600', color: c.white },
  contentBtn: {
    flex: 2, flexDirection: 'row', paddingVertical: 9, borderRadius: 10,
    backgroundColor: c.warn, alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  contentBtnTxt: { fontSize: 13, fontWeight: '600', color: c.white },

  // Feedback
  fbActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  fbDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: c.error,
  },
  fbDeleteBtnTxt: { fontSize: 13, fontWeight: '600', color: c.white },

  // User detail modal
  modalRoot: { flex: 1, backgroundColor: c.bgScreen },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, flex: 1 },
  modalCloseBtn: { padding: 4 },
  modalBody: { padding: 20, gap: 16 },
  modalBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  modalJoined: { fontSize: 12, color: c.textFaint, marginLeft: 'auto' },
  modalEmail: { fontSize: 13, color: c.textMuted },
  modalSectionTitle: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  modalLoading: { paddingVertical: 24, alignItems: 'center' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: {
    width: '30%', flex: 1, minWidth: 90,
    backgroundColor: c.bgCard, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  statCellValue: { fontSize: 22, fontWeight: '800', color: c.textPrimary },
  statCellLabel: { fontSize: 11, color: c.textMuted, textAlign: 'center' },

  modalActions: { gap: 10 },
  modalActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
  },
  modalActionBan: { backgroundColor: c.error },
  modalActionUnban: { backgroundColor: c.success },
  modalActionDelete: { backgroundColor: c.warn },
  modalActionBtnTxt: { fontSize: 15, fontWeight: '700', color: c.white },

  // Delete content modal
  overlayBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  deleteModal: {
    backgroundColor: c.bgCard, borderRadius: 20, padding: 24, width: '100%', gap: 16,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  deleteModalTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  deleteModalSub: { fontSize: 14, color: c.textBody, lineHeight: 20, marginTop: -8 },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: c.warn, borderColor: c.warn },
  checkLabel: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
  checkSub: { fontSize: 12, color: c.textFaint, marginTop: 2 },

  deleteModalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  deleteModalCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: c.bgElement, alignItems: 'center',
  },
  deleteModalCancelTxt: { fontSize: 14, fontWeight: '600', color: c.textBody },
  deleteModalConfirm: {
    flex: 2, paddingVertical: 13, borderRadius: 12,
    backgroundColor: c.warn, alignItems: 'center',
  },
  deleteModalConfirmTxt: { fontSize: 14, fontWeight: '700', color: c.white },

  // Ban details in user modal
  banDetailsBox: { backgroundColor: c.bgError, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: c.borderError },
  banDetailRow: { flexDirection: 'row', gap: 8 },
  banDetailLabel: { fontSize: 12, fontWeight: '700', color: c.textError, width: 54 },
  banDetailValue: { fontSize: 13, color: c.textError },

  // Ban form
  banFieldLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  banInput: {
    borderWidth: 1.5, borderColor: c.borderLight, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: c.textPrimary, backgroundColor: c.bgInput,
    textAlignVertical: 'top', minHeight: 72,
  },
  banDurationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  banDurationChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: c.bgElement, borderWidth: 1.5, borderColor: 'transparent',
  },
  banDurationChipActive: { backgroundColor: c.bgError, borderColor: c.error },
  banDurationChipTxt: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  banDurationChipTxtActive: { color: c.error },
});
