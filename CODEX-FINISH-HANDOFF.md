# EXM: finish the existing platform, do not rebuild

Continue from latest `origin/main`, not an old worktree or checkpoint. This file supplements the full EXM requirements in the owner's conversation and repository; it does not remove features. Inspect actual implementation before marking anything complete. Preserve Cloudflare Worker `exm`, the existing Supabase project, authoritative registration project, identities, rewards, inventory and sole founder authority for `@ybdd`. No new paid services. Publish authorized corrections through the existing pipeline.

## Completed in the latest follow-up work

- Events is the canonical competitive leaderboard; retired standings links now lead there.
- Supported winner-only credits contribute to title totals without adding inferred wins or wallet awards. The pending Season I listing stays visible on Mayo_’s record and does not count as a championship without original-result confirmation.
- Removed misleading recorded-event counts from public leaderboard rows.
- Updated Discord destination to https://discord.gg/8dZNXNr62r and removed the requirement for a named voice channel. Members must be able to join an accessible EXM VC and use mic/camera; staff verification remains separate from self-attestation.
- Account editor has separate library/camera inputs, a 144px preview, bounded image decoding and actionable timeout feedback. This is not proof of real-device Safari/HEIC support.
- Inventory has its own deep link, cosmetics have category filters, shop previews use the signed-in member's name/photo, and the tour describes the current leaderboard-first flow.
- Member requests now time out instead of leaving controls stuck. Profile edits remain in the form on failure; expired sessions receive explicit instructions. Hub reads offer a retry control; mutations are never automatically replayed. Invalid JSON cannot masquerade as a successful save. Inventory sign-in returns to inventory.
- `node tools/test-member-network.mjs` covers timeout cleanup, invalid responses, expired sessions and no automatic mutation retries; included in `npm run check`. Live signed-out Rewards Shop showed the correct sign-in entry and closed-signup notice during this follow-up. An authenticated live session was not available.
- Build and repository checks passed. These checks do not substitute for live signed-in verification.

## Required remaining work, in order

### 1. Complete email delivery and public signup

Resend account exists. Sending domain `auth.exclusivemembrs.com` was added, but DNS verification and Supabase SMTP connection are NOT complete. Cloudflare Google login returned `Unable to sign in. Try again or use your email and password.` The owner paused that setup after login problems. Do not retry credentials automatically or bypass authentication. Resume only through an authorized session or secure owner handoff.

Use the Free plan only, no card, paid overages or upgrades. Verify actual plan limits. Preserve existing DNS and mail records; add only the required sending records. Inspect the provider's current records, do not reuse copied secrets or guess values. Do not weaken a pre-existing DMARC policy. Configure approved sender and Supabase email-code templates. Verify actual signup and recovery delivery to an owner-authorized mailbox outside the Supabase project team. Only then enable `EXM_PUBLIC_SIGNUP=verified-email`. Preserve age-13+ checks, private defaults and verification before claiming an existing artist's history.

### 2. Prove the real member workflow

Use a separately authorized non-founder account; never impersonate another artist or spend the founder's points. Verify photo-library and camera upload, save, refresh, fresh sign-in, biography save, private self-profile and opt-in public profile. Test actual iPhone Safari; handle HEIC explicitly with supported conversion or clear format guidance. Do not call a desktop fixture an iPhone test.

Verify first bio +10 points, first photo +10, daily check-in +5, verified event +25, played win +10, championship +50 against current server configuration. Keep lifetime XP, competitive records and spendable points separate. Verify earn, redeem, inventory, equip and persistence without duplicate grants or negative balances. Never manufacture production purchases to make the page appear populated.

### 3. Complete historical coverage without guessing

Reconcile pilot, pre-production and all seasons using existing brackets, archived site data, approved winner records and original materials. Registration alone does not prove appearance. Unknown results are not zeros. Prolo's claimed appearances are uncertain; do not invent three appearances or map him to another artist. Keep unresolved evidence private. Older winner-only credits stay winner-only until actual rounds are documented. Preserve permanent titles and safely reserved rewards for verified future claims. Audit import idempotency before any live ledger correction.

### 4. Finish the integrated visual and admin experience

Inspect SongWars.gg public leaderboard/profile/shop and the owner's screenshots. Keep original EXM assets, matte black, chrome/silver, restrained deep red, subtle VHS and no satanic imagery. Compact mobile standings, deliberate desktop layout, larger clear avatars, rank under profile identity, real cosmetic previews, strong profile/social links and simple navigation. Keep the full multidisciplinary EXM identity, merchandise, media, W3 Studios, directory, feed/moderation and universal Events management. Do not replace existing working systems or sell Founder/champion badges. Compare every requested feature to real routes/API handlers; this follow-up did not establish that every dashboard feature is complete.

### 5. Applications after launch readiness

Preserve the official intake at https://songwars-s3-registration.b26xkz4v97.chatgpt.site/season-4/apply and separate interest form. Require email, display name, Discord and Instagram; accessible EXM VC, mic and camera readiness. No specific VC name is required. Verify the authoritative form's actual open/closed state and owner review workflow before opening, consistent with the owner's instruction to open applications after the site is ready. Do not create a second application database, invent dates/prizes/slots, or treat HTTP 200 as proof that submissions work.

## Release truthfulness

Run focused checks for changed behavior and a production smoke check. Preserve rollback and keep confidential evidence out of public payloads. Report exact release commit, what actually works live, what only passed in isolation, and concrete blockers. Do not claim '100% finished' while signup, signed-in save/redemption, application submission, or history coverage remain unresolved. Do not ask the owner to repeat already approved design or point values.
