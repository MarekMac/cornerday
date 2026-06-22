import { supabase } from '@/lib/supabase';

export async function notifySupporter(
  type: 'urge' | 'relapse' | 'milestone',
  milestoneLabel?: string,
): Promise<void> {
  try {
    // getUser() validates the token server-side and triggers a refresh if expired
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { console.warn('[notifySupporter] no user, skipping'); return; }
    // Skip the Edge Function call if the user has no partner link configured
    const { data: link } = await supabase.from('partner_links').select('id').eq('user_id', user.id).maybeSingle();
    if (!link) return;
    // P-03: invoke automatically includes the session token — no need for a separate getSession() call
    const { error } = await supabase.functions.invoke('notify-supporter', {
      body: { type, milestone_label: milestoneLabel ?? null },
    });
    if (error) {
      console.warn(`[notifySupporter] ${type} failed:`, error);
    }
  } catch (e) { console.warn('[notifySupporter] error:', e); }
}
