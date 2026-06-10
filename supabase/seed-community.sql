-- ============================================================
-- CornerDay — Community Seed Data  (safe to re-run)
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- STEP 1: Add is_anonymous column to community_comments (idempotent)
ALTER TABLE community_comments
  ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;


-- STEP 2: Create a dedicated system user so seed posts never appear
--         in any real user's "Mine" tab.
--         The fixed UUID is used as a stable identity across re-runs.

DO $$
DECLARE
  sys_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- auth.users row (required for the FK from public.users)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = sys_id) THEN
    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      sys_id, 'authenticated', 'authenticated',
      'system@cornerday.internal', '',
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}', '{}'
    );
  END IF;

  -- public.users row
  INSERT INTO public.users (id, email, display_name, created_at)
  VALUES (sys_id, 'system@cornerday.internal', 'CornerDay', NOW())
  ON CONFLICT (id) DO NOTHING;
END $$;


-- STEP 3: Remove any previously seeded posts (old seed used first real user's ID;
--         this cleans those up before re-inserting with the system user).
DO $$
DECLARE
  sys_id  UUID := '00000000-0000-0000-0000-000000000001';
  old_uid UUID;
BEGIN
  -- Delete posts previously seeded under the first real user
  SELECT id INTO old_uid FROM public.users
  WHERE id <> sys_id
  ORDER BY created_at ASC LIMIT 1;

  IF old_uid IS NOT NULL THEN
    DELETE FROM community_posts
    WHERE user_id = old_uid AND is_anonymous = true;
  END IF;

  -- Delete any prior system-user posts so re-running is safe
  DELETE FROM community_posts WHERE user_id = sys_id;
END $$;


-- STEP 4: Seed posts + comments
DO $$
DECLARE
  su  UUID := '00000000-0000-0000-0000-000000000001';
  pid UUID;
BEGIN

  -- ── Post 1 ── #FirstWeek  6 hours ago ─────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'Day 3. I deleted all the apps last Monday after I lost rent money. My hands keep reaching for my phone out of habit — keep thinking I''ll just check the odds. This is harder than I expected but I''m still here.',
    '#FirstWeek', true, 0, 2, NOW() - INTERVAL '6 hours')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'You''re doing great. Day 3 is huge. Keep going.',
     true, NOW() - INTERVAL '5 hours'),
    (pid, su, 'I felt exactly this way at day 3. The habit reaches do fade after about a week. Hang in there.',
     true, NOW() - INTERVAL '4 hours');

  UPDATE community_posts SET comments_count = 2 WHERE id = pid;


  -- ── Post 2 ── #Milestone  22 hours ago ────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'One week today. My wife doesn''t know I''ve started trying to recover yet. I want to tell her when I hit a month — I want to have something real to show her. Just saving this moment for myself right now.',
    '#Milestone', true, 0, 3, NOW() - INTERVAL '22 hours')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'When you tell her it''s going to mean everything. I told my wife at the 2-week mark and it was the best conversation we ever had.',
     true, NOW() - INTERVAL '20 hours'),
    (pid, su, 'Save this message. Read it when it gets hard.',
     true, NOW() - INTERVAL '18 hours'),
    (pid, su, 'One week is massive. Well done.',
     true, NOW() - INTERVAL '15 hours');

  UPDATE community_posts SET comments_count = 3 WHERE id = pid;


  -- ── Post 3 ── #WinToday  2 days ago ───────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'Big match last night. My mates were all doing a group WhatsApp bet. I said I had something on and couldn''t join. First time I''ve ever said no to that. Felt strange. Felt good too.',
    '#WinToday', true, 0, 4, NOW() - INTERVAL '2 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'That''s a win. Saying no once makes saying no again easier.',
     true, NOW() - INTERVAL '47 hours'),
    (pid, su, 'Exactly this. Every no rewires something. Keep it up.',
     true, NOW() - INTERVAL '46 hours'),
    (pid, su, 'I remember my first no. It felt exactly like you described — strange and good at the same time.',
     true, NOW() - INTERVAL '44 hours'),
    (pid, su, 'Proud of you.',
     true, NOW() - INTERVAL '40 hours');

  UPDATE community_posts SET comments_count = 4 WHERE id = pid;


  -- ── Post 4 ── #Struggling  4 days ago ─────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'The ads are everywhere. I was watching a YouTube video earlier and three different betting ads came up in a row. It feels like the whole world wants me to fail. How do you get away from it?',
    '#Struggling', true, 0, 4, NOW() - INTERVAL '4 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'I blocked betting sites using a DNS filter app. Also unsubscribed from every mailing list I was on. It helped a lot.',
     true, NOW() - INTERVAL '95 hours'),
    (pid, su, 'I had to unfollow half my football accounts on social media. The promoted bet posts were relentless.',
     true, NOW() - INTERVAL '93 hours'),
    (pid, su, 'The ads are designed to find you when you''re vulnerable. You seeing them and not acting is strength, not weakness.',
     true, NOW() - INTERVAL '90 hours'),
    (pid, su, 'BetBlocker is free and blocks the sites and apps. Worth trying.',
     true, NOW() - INTERVAL '88 hours');

  UPDATE community_posts SET comments_count = 4 WHERE id = pid;


  -- ── Post 5 ── #SlipUp  5 days ago ─────────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'I slipped on Thursday. £150 gone in about 20 minutes. I''m not going to pretend it didn''t happen. Reset to day 0 but I''m back on the app. That has to count for something.',
    '#SlipUp', true, 0, 3, NOW() - INTERVAL '5 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'It counts. You''re back. That''s what matters.',
     true, NOW() - INTERVAL '119 hours'),
    (pid, su, 'Every recovery story has slip-ups in it. Coming back here is the real thing.',
     true, NOW() - INTERVAL '117 hours'),
    (pid, su, 'Thank you for being honest about it. It helps the rest of us too.',
     true, NOW() - INTERVAL '114 hours');

  UPDATE community_posts SET comments_count = 3 WHERE id = pid;


  -- ── Post 6 ── #Milestone  8 days ago ──────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    '30 days today. The credit card bill this month is the first in over two years with no gambling transactions on it. I actually had to sit down when I saw it. I cried, honestly.',
    '#Milestone', true, 0, 4, NOW() - INTERVAL '8 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'This made me emotional reading it. Congratulations. 30 days is enormous.',
     true, NOW() - INTERVAL '191 hours'),
    (pid, su, 'Save that credit card statement. Frame it if you have to.',
     true, NOW() - INTERVAL '189 hours'),
    (pid, su, '30 days!! You''re an inspiration to everyone just starting out here.',
     true, NOW() - INTERVAL '186 hours'),
    (pid, su, 'The feeling you described — that''s what''s waiting for all of us. Thank you for sharing it.',
     true, NOW() - INTERVAL '183 hours');

  UPDATE community_posts SET comments_count = 4 WHERE id = pid;


  -- ── Post 7 ── #FirstWeek  11 days ago ─────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'Starting again after four months clean. I was doing well and then a work trip happened and old habits came back. I know it''s not an excuse. Day 2 again. Somehow this community still feels like the right place to be.',
    '#FirstWeek', true, 0, 2, NOW() - INTERVAL '11 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'You came back. That''s everything.',
     true, NOW() - INTERVAL '263 hours'),
    (pid, su, 'Four months was real. It wasn''t wasted. You know you can do it because you already did.',
     true, NOW() - INTERVAL '260 hours');

  UPDATE community_posts SET comments_count = 2 WHERE id = pid;


  -- ── Post 8 ── #WinToday  13 days ago ──────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'Transferred the money I would have spent on bets this weekend into a savings pot instead. Only £45, but it''s mine now. Not gone. Mine.',
    '#WinToday', true, 0, 3, NOW() - INTERVAL '13 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'Love this. Every pound in that pot is proof.',
     true, NOW() - INTERVAL '311 hours'),
    (pid, su, 'I do the same thing. Seeing the pot grow is its own motivation.',
     true, NOW() - INTERVAL '309 hours'),
    (pid, su, '£45 today is £45 that can become something real. Keep going.',
     true, NOW() - INTERVAL '306 hours');

  UPDATE community_posts SET comments_count = 3 WHERE id = pid;


  -- ── Post 9 ── #Struggling  16 days ago ────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'I keep dreaming about winning. Big wins, dramatic moments, everything turning around in one bet. Then I wake up and remember why I''m here. The dreams are the worst part of this.',
    '#Struggling', true, 0, 3, NOW() - INTERVAL '16 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'The dreams are real and they''re cruel. They do ease off over time though — took me about 3 months.',
     true, NOW() - INTERVAL '383 hours'),
    (pid, su, 'I had those dreams for weeks. Now when I have them I wake up feeling relieved it was a dream. Takes time to get there.',
     true, NOW() - INTERVAL '380 hours'),
    (pid, su, 'The National Gambling Helpline does free counselling sessions. The dreams are something they specifically help with.',
     true, NOW() - INTERVAL '377 hours');

  UPDATE community_posts SET comments_count = 3 WHERE id = pid;


  -- ── Post 10 ── #FirstWeek  19 days ago ────────────────────────────────
  INSERT INTO community_posts
    (user_id, content, tag, is_anonymous, reactions_count, comments_count, created_at)
  VALUES (su,
    'Downloaded this app two days ago. My partner found out about the debt last week. I don''t know if we''re going to be okay. But I''m trying. That''s new.',
    '#FirstWeek', true, 0, 2, NOW() - INTERVAL '19 days')
  RETURNING id INTO pid;

  INSERT INTO community_comments (post_id, user_id, content, is_anonymous, created_at) VALUES
    (pid, su, 'You''re trying. That''s new and that''s real. Welcome.',
     true, NOW() - INTERVAL '454 hours'),
    (pid, su, 'I was in a similar place when I started. It does get better. One day at a time.',
     true, NOW() - INTERVAL '451 hours');

  UPDATE community_posts SET comments_count = 2 WHERE id = pid;


  RAISE NOTICE 'Community seed complete — 10 posts, 30 comments. System user: %', su;
END $$;
