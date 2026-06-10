import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

interface Report {
  id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  reason: string;
  created_at: string;
  status: string;
  content?: string;
  post_title?: string;
}

export default function ModerationScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('community_reports')
      .select('id, target_type, target_id, reason, created_at, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error || !data) { setLoading(false); return; }

    // Fetch content for each report
    const enriched = await Promise.all(data.map(async (r) => {
      if (r.target_type === 'post') {
        const { data: post } = await supabase
          .from('community_posts')
          .select('content')
          .eq('id', r.target_id)
          .single();
        return { ...r, content: post?.content ?? '[Post deleted]' };
      } else {
        const { data: comment } = await supabase
          .from('community_comments')
          .select('content, post_id')
          .eq('id', r.target_id)
          .single();
        return {
          ...r,
          content: comment?.content ?? '[Comment deleted]',
          post_title: comment?.post_id ?? undefined,
        };
      }
    }));

    setReports(enriched as Report[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Text style={s.headerTitle}>Community Moderation</Text>
            <View style={{ width: 34 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#0F6E6E" />
        </View>
      ) : reports.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="checkmark-circle-outline" size={52} color="#a8d8d0" />
          <Text style={s.emptyTitle}>All clear</Text>
          <Text style={s.emptyBody}>No pending reports right now.</Text>
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

              <Text style={s.contentText} numberOfLines={4}>
                {report.content}
              </Text>

              <View style={s.actions}>
                <Pressable
                  style={({ pressed }) => [s.dismissBtn, pressed && { opacity: 0.7 }, actioning === report.id && s.btnDisabled]}
                  onPress={() => dismiss(report.id)}
                  disabled={!!actioning}>
                  {actioning === report.id
                    ? <ActivityIndicator size="small" color="#666" />
                    : <Text style={s.dismissBtnTxt}>Dismiss</Text>}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }, actioning === report.id && s.btnDisabled]}
                  onPress={() => deleteContent(report)}
                  disabled={!!actioning}>
                  <Ionicons name="trash-outline" size={14} color="#fff" />
                  <Text style={s.deleteBtnTxt}>Delete content</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10 },
  backBtn: { width: 34, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  emptyBody: { fontSize: 14, color: '#888' },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },
  countLabel: { fontSize: 13, color: '#888', marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typePillPost: { backgroundColor: '#e6f7f7' },
  typePillComment: { backgroundColor: '#f0f0f0' },
  typePillTxt: { fontSize: 11, fontWeight: '700', color: '#0F6E6E', textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonPill: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  reasonPillTxt: { fontSize: 11, color: '#b45309', fontWeight: '600' },
  dateText: { marginLeft: 'auto', fontSize: 11, color: '#bbb' },
  contentText: { fontSize: 14, color: '#333', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dismissBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
  },
  dismissBtnTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  deleteBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#c0392b',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  deleteBtnTxt: { fontSize: 13, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.5 },
});
