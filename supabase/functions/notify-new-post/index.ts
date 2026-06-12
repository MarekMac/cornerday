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

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ ok: true, skipped: 'not_insert' }), { status: 200 });
    }

    const { id: post_id, user_id: author_id, content, is_anonymous } = payload.record;

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
      .single();

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

    // Fetch push tokens for all followers
    const { data: followerUsers } = await supabase
      .from('users')
      .select('id, expo_push_token')
      .in('id', followerIds)
      .not('expo_push_token', 'is', null);

    const tokens = (followerUsers ?? [])
      .map((u: { expo_push_token: string | null }) => u.expo_push_token)
      .filter((t): t is string => !!t);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_tokens' }), { status: 200 });
    }

    const preview = content.length > 80 ? content.slice(0, 80) + '…' : content;

    const messages: ExpoPushMessage[] = tokens.map(token => ({
      to: token,
      sound: 'default',
      title: `${authorName} posted a new story`,
      body: preview,
      data: { screen: `/(tabs)/community/${post_id}` },
    }));

    // Expo supports up to 100 messages per batch
    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      const expoBody = await expoRes.json();
      console.log('Expo push response:', JSON.stringify(expoBody));
    }

    return new Response(JSON.stringify({ ok: true, notified: tokens.length }), { status: 200 });
  } catch (err) {
    console.error('notify-new-post error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200 });
  }
});
