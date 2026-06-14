import { supabase } from '@/lib/supabase';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

export async function notifySupporter(
  type: 'urge' | 'relapse' | 'milestone',
  milestoneLabel?: string,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { console.warn('[notifySupporter] no session, skipping'); return; }
    const res = await fetch(`${FUNCTIONS_URL}/notify-supporter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ type, milestone_label: milestoneLabel ?? null }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[notifySupporter] ${type} failed ${res.status}:`, body);
    }
  } catch (e) { console.warn('[notifySupporter] error:', e); }
}
