// Supabase Edge Function: notify-new-post
// Triggered by a Supabase Database Webhook on INSERT to community_posts.
// Sends an Expo push notification to all followers of the post author.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: string;
    user_id: string;
    content: string;
    tag: string | null;
    is_anonymous: boolean;
    created_at: string;
  };
  old_record: null | Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (!WEBHOOK_SECRET) {
    console.error('WEBHOOK_SECRET env var not set');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }
  const auth = req.headers.get('Authorization') ?? '';
  if (!timingSafeEqual(auth, `Bearer ${WEBHOOK_SECRET}`)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  try {
    const payload: WebhookPayload = await req.json();

    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ ok: true, skipped: 'not_insert' }), { status: 200 });
    }

    const { id: post_id, user_id: author_id, is_anonymous } = payload.record;

    // Never notify for anonymous posts — would reveal the poster's identity
    if (is_anonymous) {
      return new Response(JSON.stringify({ ok: true, skipped: 'anonymous' }), { status: 200 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the author's display name
    const { data: author } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', author_id)
      .maybeSingle();

    const authorName = author?.display_name ?? 'Someone you follow';

    // Fetch all followers of this author
    const { data: follows, error: followsError } = await supabase
      .from('community_follows')
      .select('follower_id')
      .eq('following_id', author_id);

    if (followsError || !follows || follows.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_followers' }), { status: 200 });
    }

    const followerIds = follows.map((f: { follower_id: string }) => f.follower_id);

    // Fetch push tokens for all followers (keep id→token mapping for error handling)
    // Filter out followers who have turned off community push notifications
    const { data: followerUsers } = await supabase
      .from('users')
      .select('id, expo_push_token, notif_community')
      .in('id', followerIds)
      .not('expo_push_token', 'is', null)
      .neq('notif_community', false);

    const recipients: { userId: string; token: string }[] = (followerUsers ?? [])
      .filter((u: { id: string; expo_push_token: string | null; notif_community: boolean }) => !!u.expo_push_token)
      .map((u: { id: string; expo_push_token: string }) => ({ userId: u.id, token: u.expo_push_token }));

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_tokens' }), { status: 200 });
    }

    // Never put actual post text in a push body — community stories routinely
    // include relapse details and money talk, and push notifications render
    // on the lock screen where a partner/family member could see it.
    const messages: ExpoPushMessage[] = recipients.map(r => ({
      to: r.token,
      sound: 'default',
      title: `${authorName} posted a new story`,
      body: 'Tap to read it.',
      data: { screen: `/(tabs)/community/${post_id}` },
    }));

    // Expo supports up to 100 messages per batch
    const CHUNK = 100;
    let notified = 0;
    const staleTokenUserIds: string[] = [];

    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunkMessages = messages.slice(i, i + CHUNK);
      const chunkRecipients = recipients.slice(i, i + CHUNK);

      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunkMessages),
      });

      if (!expoRes.ok) {
        console.error('Expo push API HTTP error:', expoRes.status);
        continue;
      }

      // Batch response: { data: [ ticket, ticket, ... ] } — one ticket per message, same order
      const expoBody = await expoRes.json();
      const tickets: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }> =
        expoBody?.data ?? [];

      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j];
        if (ticket?.status === 'error') {
          if (ticket?.details?.error === 'DeviceNotRegistered') {
            staleTokenUserIds.push(chunkRecipients[j].userId);
          } else {
            console.error('Push error for', chunkRecipients[j].userId, ':', ticket?.message);
          }
        } else {
          notified++;
        }
      }
    }

    // Clear stale tokens in bulk
    if (staleTokenUserIds.length > 0) {
      await supabase.from('users').update({ expo_push_token: null }).in('id', staleTokenUserIds);
      console.warn('Cleared stale push tokens for users:', staleTokenUserIds);
    }

    return new Response(JSON.stringify({ ok: true, notified, stale_cleared: staleTokenUserIds.length }), { status: 200 });
  } catch (err) {
    console.error('notify-new-post error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200 });
  }
});
