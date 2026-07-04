# CornerDay — Play Console Data Safety Form Draft

Fill in at: Play Console → App content → Data safety

Global answers first:
- **Does your app collect or share any of the required user data types?** Yes
- **Is all user data encrypted in transit?** Yes (HTTPS/TLS to Supabase, RevenueCat, Sentry, Resend, Anthropic)
- **Do you provide a way for users to request data deletion?** Yes — in-app Account → Settings → Delete account, permanent and immediate
- **Privacy policy URL:** https://cornerday.app/privacy

---

## Personal info

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| Name | Yes | No | Optional (display name, user-chosen) | App functionality |
| Email address | Yes | No | Required | Account management, app functionality |
| User IDs | Yes | No | Required | Account management, app functionality |
| Phone number | Yes | No | Optional (trusted contact, manually typed — not read from device contacts) | App functionality |

## Financial info

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| Purchase history | Yes | Yes (RevenueCat, for subscription processing) | Required for Premium purchase | App functionality, account management |
| Other financial info | Yes | No | Optional (loss/payment amounts, weekly bet estimate) | App functionality (personal debt-recovery tracking, visible only to the user) |

## Health and fitness

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| Health info (mood check-ins, urge journal, streak/relapse data) | Yes | No | Optional | App functionality (personal recovery tracking, analytics) |

## Messages

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| Other in-app messages (community comments, supporter messages via "Someone in your corner") | Yes | No | Optional | App functionality |

## Photos and videos

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| Photos (profile avatar upload) | Yes | No | Optional | App functionality, account personalization |

## App activity

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| App interactions (community posts, reactions, bookmarks, follows) | Yes | No | Optional | App functionality |
| In-app search history | No | — | — | — |
| Other user-generated content | Yes (journal entries, notes on losses/payments) | No | Optional | App functionality |

## App info and performance

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| Crash logs | Yes | Yes (Sentry) | Required (automatic) | Analytics, bug fixing |
| Diagnostics | Yes | Yes (Sentry) | Required (automatic) | Analytics, bug fixing |

## Device or other IDs

| Data type | Collected | Shared | Optional/Required | Purpose |
|---|---|---|---|---|
| Device or other IDs (push notification token) | Yes | Yes (Google Firebase FCM) | Required for push notifications (can decline OS-level permission) | App functionality |
| Advertising ID | Yes | Yes (Google AdMob) | Required for free-tier ads | Advertising or marketing |

## Not collected

- Location (precise or approximate) — not collected
- Contacts (device contact list access) — not collected; trusted contact is a manually typed field, not synced from the device address book
- Web browsing history — not collected
- Calendar — not collected
- Files and docs — not collected (data export is a one-way download the user triggers, not ongoing collection)
- Audio — not collected

---

## Notes for whoever fills this in

- **Third parties data is shared with:** Supabase (DB/auth), RevenueCat (subscriptions), Sentry (crash reporting), Google AdMob (ads, free tier only), Google Firebase/FCM (push), Anthropic (AI Coach conversations, Premium only — no financial amounts sent), Resend (transactional email).
- **Anthropic/AI Coach:** only the user's motivation/trigger/goal profile and the live conversation are sent — loss/payment amounts are never included in the prompt. Worth flagging under "Other financial info" as *not* shared with this processor if the form asks per-processor.
- **Data deletion:** Account → Settings → Delete account calls the `delete-account` Edge Function, which removes the user row and cascades to all related tables (streaks, losses, mood_checkins, urge_journal, badges, community posts/comments, partner_links). Confirmed behavior, not just a soft delete.
- **Family policy questions (if prompted):** app is not directed at children, so most "child safety" sub-questions can be skipped.
