# CornerDay — Claude Code Briefing

## What is CornerDay?
A mobile app (iOS + Android) that helps people stop sports betting, track money lost and repaid, and stay accountable without shame. The app is focused specifically on gambling addiction recovery.

## App Name & Branding
- Name: CornerDay
- Tagline: "The day you turn it around starts today"
- Primary colour: Teal gradient — #0F6E6E (dark) to #1a9a9a (mid) to #a8d8d0 (light)
- Accent/light background: #e6f7f7
- Warm background: #f5ece4
- Error/loss colour: #c0392b
- Font: System default (San Francisco on iOS, Roboto on Android)
- Logo: Winding path/river inside a rounded square, teal to warm gradient

## Tech Stack
- Frontend: React Native + Expo SDK 56
- Navigation: Expo Router
- Backend/Auth/Database: Supabase (PostgreSQL)
- Payments/Subscriptions: RevenueCat
- AI Coach (Phase 2): Claude API

## Monetization
- Free tier: streak tracker, loss/payment tracker, urge support, journal, basic check-ins
- Premium tier (~$4.99–7.99/month): AI coach, detailed analytics, someone in your corner
- No ads — ever

## App Structure & Screens

### Onboarding Flow (shown once on first launch)
1. Welcome screen — full gradient background, CornerDay logo, "Get started" and "I already have an account" buttons
2. Sign up screen — Google login button + email/password fields, privacy note
3. Q1 — What motivates you to quit? (family, finances, mental health, saving for something, better self, write own reason)
4. Q2 — What is your biggest trigger? (betting ads, live sport, friends/social pressure, stress, boredom, financial pressure)
5. Q3 — How much did you lose in total? (range chips + custom input, skippable)
6. Q4 — What is your main goal? (pay back losses, save for something, mental health, family, one day at a time)
7. Q5 — Do you have someone in your corner? (partner, family, friend, therapist, keep private)
8. Ready screen — gradient background, checklist of what is set up, "Go to my dashboard" button

### Main App (tab navigation — 4 tabs)

#### Tab 1: Home
- Gradient header with greeting and random daily quote (subtle, one line)
- "Your why" anchor card — shows their motivation from onboarding (e.g. 👨‍👩‍👧 My family)
- Streak card — circular counter, progress bar to next milestone, days to go
- Stats row — money saved / total lost / % recovered
- Badges row — 🌱 1 day, ⭐ 1 week, 🔥 1 month, 🏆 60 days, 💎 6 months (locked until earned)
- Daily mood check-in — 5 emoji options
- Relapse card — gentle, non-punishing — "Had a slip? That's okay." with reset streak button

#### Tab 2: Loss Tracker
- Summary card — total lost / paid back / still owed (3 columns), teal recovery progress bar
- Three tabs inside: Log Loss / Log Payment / History
- Log Loss: amount input + category dropdown (Sports betting, Casino, Poker, Online slots, Other) + Add button
- Log Payment: amount input + note input + Add button
- History: chronological list of all entries, each showing label, date, pill tag (loss/payment), amount, and running balance

#### Tab 3: Urge Support (NO ADS EVER ON THIS SCREEN)
- Red emergency button — "I'm feeling the urge right now"
- "Remember your why" card — pulls their motivation from onboarding
- Breathing exercise card — 4s in, 4s hold, 4s out
- Distractions list — walk, call someone, play a game
- Crisis resources box — National Problem Gambling Helpline, 1-800-522-4700, free, 24/7

#### Tab 4: AI Coach (Phase 2 — Premium)
- Chat interface with Claude API
- Locked behind premium paywall with upgrade prompt for free users
- Available 24/7 label

### Additional Screens
- Journal — urge log entries with trigger, outcome (overcame/slipped), mood notes
- Milestones — badge collection view
- Settings — account, notifications, privacy, subscription management
- Relapse flow — gentle restart, no punishment language, resets streak with encouragement

## Database Schema (Supabase/PostgreSQL)

### users
- id (uuid, primary key)
- email (text)
- created_at (timestamp)
- display_name (text)
- motivation (text) — from onboarding Q1
- trigger (text) — from onboarding Q2
- goal (text) — from onboarding Q4
- support_type (text) — from onboarding Q5
- is_premium (boolean, default false)
- quit_date (date) — the day they started

### streaks
- id (uuid)
- user_id (uuid, foreign key → users)
- current_streak (integer)
- longest_streak (integer)
- last_check_in (date)
- streak_start_date (date)

### losses
- id (uuid)
- user_id (uuid, foreign key → users)
- type (text) — 'loss' or 'payment'
- amount (numeric)
- category (text) — Sports betting, Casino, Poker, Online slots, Other, Payment
- note (text, nullable)
- created_at (timestamp)

### mood_checkins
- id (uuid)
- user_id (uuid, foreign key → users)
- mood (integer) — 1 to 5
- created_at (timestamp)

### urge_journal
- id (uuid)
- user_id (uuid, foreign key → users)
- trigger (text)
- outcome (text) — 'overcame' or 'slipped'
- note (text, nullable)
- created_at (timestamp)

### badges
- id (uuid)
- user_id (uuid, foreign key → users)
- badge_type (text) — '1_day', '1_week', '1_month', '60_days', '6_months', '1_year'
- earned_at (timestamp)

## Key UX Principles
- Never shame the user — especially around relapses and losses
- Relapse = restart, not failure. Language must always be encouraging
- Loss amounts are private — only the user can see them
- No ads on urge screen, relapse screen, crisis resources or journal
- Motivation from onboarding appears throughout the app as a personal anchor
- The "Your why" always visible on home and urge screens

## Build Phases
- Phase 1 (MVP): Auth, onboarding, home screen, loss tracker, urge support, streak tracking
- Phase 2: Premium features, AI coach, someone in your corner, push notifications, detailed analytics
- Phase 3: Wider release, potential expansion to other addiction types

## Current Status
- Project created with create-expo-app (SDK 56)
- VS Code open, Expo Go connected and running on Android device
- Supabase account to be set up
- Ready to start building Phase 1