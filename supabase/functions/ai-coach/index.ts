import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://cornerday.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are AI Corner — a compassionate, evidence-based support companion helping people overcome gambling addiction. You speak in a warm, conversational tone — never clinical or preachy.

Your approach:
- Ground your support in CBT and motivational interviewing, but keep language natural and human
- Celebrate every step of progress, however small
- When someone is struggling with an urge, offer practical grounding techniques tailored to their specific trigger
- If they mention a relapse or slip, respond with compassion — "a slip is a data point, not a failure"
- Reference their personal reason for quitting when it's genuinely relevant, without being repetitive
- Keep responses concise and focused — 2 to 3 short paragraphs max unless they clearly need more
- If they seem to be in crisis or mention self-harm, immediately share the National Problem Gambling Helpline: 1-800-522-4700 (free, 24/7)

You are a supportive coach, not a replacement for professional therapy. For serious mental health concerns, gently encourage professional support while continuing to offer what you can.

Your scope is strictly gambling recovery and the emotional, financial, and relationship challenges that come with it. If someone asks about anything unrelated — coding, general advice, trivia, or any other topic — kindly redirect: "I'm here specifically to support your recovery journey. Is there something on your mind about that?"`;


function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function daysCleanLabel(quitTimestamp: string | null, quitDate: string | null): { days: number; label: string } {
  const raw = quitTimestamp ?? quitDate;
  if (!raw) return { days: 0, label: 'just starting out' };
  const ms = Date.now() - new Date(raw).getTime();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  const label = days === 0 ? 'just starting out' : days === 1 ? '1 day clean' : `${days} days clean`;
  return { days, label };
}

// These profile fields (display_name, motivation, trigger, goal) are
// user-controlled free text — a user can set them directly via the same
// own-row UPDATE the app uses (e.g. display_name via account settings, or
// motivation/trigger/goal via the "write your own reason" onboarding
// options) and they get interpolated straight into the system prompt below.
// Strip newlines/control characters so a single-line "Name:" field can't
// smuggle in fake multi-line structure, and strip the literal delimiter
// strings the prompt uses to mark context boundaries so they can't be
// spoofed to fake a context-block close. Cap length since these are meant
// to be short profile fields, not essays.
function sanitizeProfileField(s: string | null | undefined, maxLen = 200): string | null {
  if (!s) return null;
  let out = s.replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ').trim();
  for (const marker of ['[End context]', '[User context', '[Previous session summary', '[End previous session summary]']) {
    out = out.split(marker).join('');
  }
  out = out.trim();
  if (out.length > maxLen) out = out.slice(0, maxLen) + '…';
  return out || null;
}

function supportLabel(s: string | null): string {
  if (!s) return 'no one mentioned';
  const map: Record<string, string> = {
    partner: 'partner',
    family: 'family member',
    friend: 'friend',
    therapist: 'therapist',
    keep_private: 'keeping it private for now',
  };
  return map[s] ?? sanitizeProfileField(s) ?? 'no one mentioned';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const rawBody = await req.text();
    if (rawBody.length > 65536) {
      return json({ error: 'payload_too_large' }, 413);
    }
    const { messages, checklistState } = JSON.parse(rawBody) as {
      messages: { role: string; content: string }[];
      checklistState?: Record<string, boolean>;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages required' }, 400);
    }

    const validatedMessages = messages.filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    );
    if (validatedMessages.length === 0) {
      return json({ error: 'no valid messages' }, 400);
    }

    // Always fetch full profile — context is injected into system prompt on every request
    const { data: profile } = await admin
      .from('users')
      .select('is_premium, is_admin, display_name, motivation, trigger, goal, support_type, quit_date, quit_timestamp, coach_context')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_premium && !profile?.is_admin) {
      return json({ error: 'premium_required' }, 403);
    }

    // Fetch supporting data in parallel. Debt/payment totals live in the
    // debts/debt_payments tables (not losses — that table's 'session' rows
    // are individual gambling-session logs, unrelated to the debt tracker),
    // matching the pattern already used correctly in partner-view/index.ts.
    const [streakRes, debtsRes, paymentsRes, moodRes] = await Promise.all([
      admin.from('streaks').select('current_streak, longest_streak').eq('user_id', user.id).maybeSingle(),
      admin.from('debts').select('total_amount').eq('user_id', user.id),
      admin.from('debt_payments').select('amount').eq('user_id', user.id),
      admin.from('mood_checkins').select('mood').eq('user_id', user.id).order('created_at', { ascending: false }).limit(7),
    ]);

    const { days: daysClean, label: cleanLabel } = daysCleanLabel(
      profile.quit_timestamp ?? null,
      profile.quit_date ?? null,
    );
    const longestStreak = Math.max(
      streakRes.data?.longest_streak ?? 0,
      streakRes.data?.current_streak ?? 0,
      daysClean,
    );

    const totalLost = (debtsRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0);
    const totalPaid = (paymentsRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const stillOwed = Math.max(0, totalLost - totalPaid);

    const moods = moodRes.data ?? [];
    const avgMood = moods.length > 0
      ? (moods.reduce((s, m) => s + m.mood, 0) / moods.length).toFixed(1)
      : null;

    // Checklist summary (sent from client)
    const CHECKLIST_IDS = [
      'delete_apps', 'remove_cards', 'delete_accounts',
      'website_blocker', 'bank_block', 'spending_limit',
      'self_exclude_operators', 'national_exclusion',
      'tell_someone', 'save_helpline',
      'unsubscribe_emails', 'unfollow_social', 'clear_bookmarks',
    ];
    const CHECKLIST_LABELS: Record<string, string> = {
      delete_apps: 'deleted gambling apps',
      remove_cards: 'removed saved payment details',
      delete_accounts: 'closed gambling accounts',
      website_blocker: 'installed website blocker',
      bank_block: 'blocked gambling at bank',
      spending_limit: 'set spending limit',
      self_exclude_operators: 'self-excluded from operators',
      national_exclusion: 'joined national exclusion scheme',
      tell_someone: 'told a trusted person',
      save_helpline: 'saved helpline number',
      unsubscribe_emails: 'unsubscribed from promo emails',
      unfollow_social: 'unfollowed gambling accounts',
      clear_bookmarks: 'cleared gambling bookmarks',
    };
    const checkedIds = checklistState ? Object.entries(checklistState).filter(([, v]) => v).map(([k]) => k) : [];
    const uncheckedIds = CHECKLIST_IDS.filter(id => !checkedIds.includes(id));
    const checklistSummary = checkedIds.length === 0
      ? 'none completed yet'
      : `${checkedIds.length}/${CHECKLIST_IDS.length} complete — done: ${checkedIds.map(id => CHECKLIST_LABELS[id] ?? id).join(', ')}${uncheckedIds.length > 0 ? `; still to do: ${uncheckedIds.map(id => CHECKLIST_LABELS[id] ?? id).join(', ')}` : ''}`;

    const contextLines: string[] = [
      `[User context — use naturally in conversation, do not quote verbatim]`,
      `Name: ${sanitizeProfileField(profile.display_name) ?? 'there'}`,
      `Recovery: ${cleanLabel}${longestStreak > daysClean ? ` (longest streak: ${longestStreak} days)` : ''}`,
      `Why they quit: ${sanitizeProfileField(profile.motivation) ?? 'a better life'}`,
      `Biggest trigger: ${sanitizeProfileField(profile.trigger) ?? 'urges'}`,
      `Main goal: ${sanitizeProfileField(profile.goal) ?? 'stay free from gambling'}`,
      `Support: ${supportLabel(profile.support_type)}`,
    ];
    if (totalLost > 0) {
      contextLines.push(`Finances: lost ${totalLost.toLocaleString()} total — paid back ${totalPaid.toLocaleString()} — still owed ${stillOwed.toLocaleString()}`);
    }
    if (avgMood !== null) {
      contextLines.push(`Recent mood (last ${moods.length} check-ins): ${avgMood}/5`);
    }
    contextLines.push(`Prevention checklist: ${checklistSummary}`);
    if (profile.coach_context) {
      // Server-generated (by summarize-coach-session), so lower injection risk
      // than the direct profile fields above, but still strip the literal
      // delimiter strings for defense in depth. sanitizeProfileField returns
      // null when the ENTIRE string was delimiter/control content — exactly
      // the case an injection attempt would produce — so falling back to the
      // raw value here would defeat the sanitizer. Drop it instead.
      const safeSummary = sanitizeProfileField(profile.coach_context, 2000);
      if (safeSummary) {
        contextLines.push(`[Previous session summary — use to provide continuity, don't quote verbatim]\n${safeSummary}\n[End previous session summary]`);
      }
    }
    contextLines.push(`[End context]`);

    const contextBlock = contextLines.join('\n');
    const systemPromptWithContext = `${SYSTEM_PROMPT}\n\n${contextBlock}`;

    const upstream = await callAnthropic(validatedMessages, systemPromptWithContext);
    if (!upstream.ok) {
      const err = await upstream.text();
      console.error('Anthropic error:', err);
      return json({ error: 'AI service error' }, 502);
    }

    return new Response(upstream.body, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('ai-coach error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function callAnthropic(messages: { role: string; content: string }[], systemPrompt: string) {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not set');

  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      stream: true,
      system: systemPrompt,
      messages,
    }),
    signal: AbortSignal.timeout(25_000),
  });
}
