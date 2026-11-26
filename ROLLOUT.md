# EXM — November 2026 domain rollout

Owner repository: xthr333/exclusivemembrs. Cloudflare Worker: **exm**.
Public domain: https://exclusivemembrs.com/

## What changed
- Original chrome EXM logo retained, resized to WebP for delivery; source artwork unchanged.
- Editorial black / warm-white / chrome home, original CSS SongWars artwork, product photography, responsive shared navigation and footer.
- Dedicated Residency and W3 Studios landing pages connected to existing official services.
- Shop category filters, clear external checkout, image-error fallbacks, archive-product labeling.
- Registration-order SongWars field and matchups rebuilt from the live D1 read on November 7. As5 replaces the declined entry; one replacement waitlist duo.
- Approval is no longer described as attendance confirmation. No private contact or individual attendance fields shipped.
- Preserved existing owner update feed and Formspree contact destination; added explicit contact success/failure handling. No test inquiry or real order sent.
- Removed intrusive update toast and first-visit boot on home. Updates remain inline.
- Canonical/share metadata, 404 page, robots/sitemap and security-header configuration.

## Build / deployment
No paid packages or external service changes. Node 22+ recommended.

```sh
npm run check
npm run build
npx wrangler deploy
```

Cloudflare Git build settings: build `npm run build`; deploy `npx wrangler deploy`. Root `/`, production branch `main`. Wrangler declares name `exm`, compatibility date and static assets in `dist`. Do not create a second Worker or replace the domain's nameservers.

The legacy GitHub Pages mirror uses the repository root on `main`. Its Jekyll exclusions in `_config.yml` keep local member fixtures and build tools off that host. The isolated preview build activates its navigation, boards and scripts. The public build verifies that neither public delivery path offers preview-only routes.

The old copy-based build still delivers the HTML/CSS/JS/assets, but **does not copy robots.txt, sitemap.xml or _headers**. Use the new build command for the complete release. If the deleted Worker was the only Git integration, connect the existing **exm** Worker to this repository instead. No Cloudflare credential is stored in this repo.

## Data boundaries
The public calendar is generated from `content/events.json`. To create or revise a listing, edit its title, summary, optional ISO date and approved action URLs in a Git branch. Keep unpublished private material outside the repository. The `draft` state omits an entry from the built page. Set the public state to `upcoming`, `live` or `past`, run `npm run sync-layout && npm run build`, and merge the reviewed change to publish. Supported actions include interest, registration, RSVP, tickets, live stream, replay and recap. Registrations and transactions remain with the linked provider.

`songwars-public.json` is a dated, public-only snapshot, not a live registration API. The registration Site's D1 remains authoritative. Future registrations or approval changes need a fresh verified snapshot and commit. The existing Supabase published-update feed still loads automatically on visits; recent curated static updates are also shown. Two obsolete announcement headlines are excluded from rendering to avoid restoring the known false all-confirmed/panel announcements. Database rows are not deleted or changed.

Artist links, shop URLs, social accounts and contact endpoint were retained from the existing project. Purchases, availability, product options, W3 booking and Residency applications remain on their existing platforms. No embedded cart, new payment collection, new newsletter list or account system was invented.

## Owner decisions / verification limits
- Staff database currently lists Ju/Gottaitch as an official judge and jfasure as backup, unlike the latest announced panel preference. No staff role changed here; Wayne must reconcile the official source before a new panel announcement.
- The Residency landing page avoids unverified open/closed claims and sends visitors to the existing official process. Property, dates and places remain unconfirmed; invoices are manual.
- Contact endpoint delivery, private owner sign-in/RLS and real checkout must be verified by Wayne in the live accounts. No credentials, messages or purchases were used to test them.
- Source publication and live deployment are separate. Do not call this live until Cloudflare reports success and the domain renders the new home.

## Rollback
All previous source remains in Git history. Revert the rollout commit to restore the prior site. Do not delete the repository, Worker, registration database or domain.

## Hosted Events and member rollout

The `exm` Worker serves the same public build when hosted mode is off. It uses the existing EXM Supabase Free project for hosted data. The migrations add the private `exm_member` schema and service-role RPCs. The existing announcements owner was linked by the Auth identity already used by the announcements write policy. The hosted profile starts private. Neither the provider password nor legacy grants are changed.

Add these bindings on the Cloudflare Worker under **Settings → Variables and Secrets**:

- `EXM_MEMBER_SERVICE_ROLE_KEY` uses the existing EXM Supabase project’s backend secret or legacy service-role key. Store it as an encrypted secret.
- `EXM_MEMBER_PEPPER` uses a persistent output from `openssl rand -hex 32`. Store it as an encrypted secret. Changing it resets rate-limit buckets derived with the previous key.
- `EXM_MEMBER_MODE` uses `events` or `members` for the full hosted release. Set `events-only` to retain event publishing and applications while pausing member rewards and feed. Remove the variable or set it to `off` to roll back to the public site. The deployment preserves these Cloudflare settings. No credential belongs in Git.

Check `/api/exm-mode.js` and `/api/platform/events` after activation. Sign in at `/account` with the existing EXM owner login, then open `/member-hub#staff`. Save a draft, open its preview, set the intended event status, and publish. An owner controls when registration opens and can review applications for that event. The form collects contact email and the event-specific answer and returns only a receipt. Staff permissions are scoped to assigned events.

Use `npm run build` and `node tools/test-hosted-api.mjs` with the isolated preview environment before inviting people. The rehearsal refuses hosted provider URLs. Public signup stays closed. Existing Auth accounts need an approved EXM profile link. Successful password sign-in issues one-time backup codes on first use. A redeemed code creates a private reference for the owner. Verify ownership separately through the Auth provider before any credential reset. An Auth account with a verified MFA factor requires a supported MFA sign-in flow. The current password-only EXM form denies it.

The public standings at `/standings` show ranking XP by period and category. Members earn lifetime XP and spendable points from the same verified activity, and redemption changes only the spendable balance. The Rewards Shop and inventory are under `/member-hub#rewards`. SongWars IV uses the existing interest form, while the owner can publish and review applications for other EXM events in `/member-hub#staff`.

Switching hosted mode off preserves events, applications and member history. Review access and export needs through authorized Supabase tools. Existing SongWars forms and gates remain with their current provider.

The public roster can display verified credits for an unclaimed profile. In production, the anchored Founder account is the only one that can publish events or review private applications. To link a roster profile, first verify ownership via EXM’s approved contact and have the person complete a private provider invitation. The Founder can then use **Verified roster claims** in the Events dashboard. Linking preserves existing accounts and ledgers. It grants no staff role and awards the earned-only champion badge only where the verified roster already records a championship.

## Events leaderboard correction

The canonical SongWars leaderboard is `/events`. Results open at `/events#results` and the legacy round links open the bracket. The community XP leaderboard remains at `/standings`. Run `npm run sync-layout` after updating approved history to regenerate the display payloads. The approval snapshot and private reconciliation are excluded from deployable content. Before release, run `node tools/songwars-legacy-import.mjs` and compare the generated stable award keys with the private ledger.

The competition board sorts by verified championships, recorded wins, then best documented round. The season-level `rounds` in `content/songwars-legacy.json` configure progression. Values express the order of actual stages across formats and carry no points. A title-only record has no played-win or progression value. Exact ties share ranks and use alphabetical order for display. Legacy Points stay on player records and do not affect the competition ordering.

Signed-in members can open **My Profile** from Account and the Member Hub even when directory visibility is off. The additive `member_profile_self_view` migration preserves service-only function grants. A site rollback does not change profiles or balances. Restore the previous database function definitions separately if the self-view needs to be rolled back. The release issues no wallet credits and does not enable public signup or Discord OAuth.

## Final launch gates

- The existing Cloudflare integration deploys `main` to Worker `exm`. Release verification compares the official domain’s assets with the tested build. PR previews and GitHub Pages have separate check results. `76f21d2` is the previous production baseline. An application rollback preserves committed member and application records.
- Apply the tested additive migrations in order. Verify historical reward candidates with `tools/test-historical-rewards.sql` on the isolated database. The existing Legacy ledger stays intact. Spendable reservations settle on a verified roster claim, with wallet credits and claim in the same transaction. Review unresolved prior credits before any manual correction.
- Keep `EXM_PUBLIC_SIGNUP` unset until the production email and account checks below pass.
- Official SongWars IV intake remains with the existing external provider. Its interest and restricted entry use their established URLs. On EXM, the founder can preview an artist application for a native event before publishing it. Staff verify Discord membership, voice access, microphone, and camera before approving new artist applications. The externally hosted link takes precedence when an event already has an authoritative registration portal. Apply the additive readiness migration before publishing the Worker that uses it. Existing application rows and earlier approvals retain their recorded evidence.
## Public member signup release gate

The hosted Worker leaves signup closed unless its `EXM_PUBLIC_SIGNUP` binding is `verified-email` in members mode. The Worker owns the 13+ check and discards the submitted birth date. It creates the member profile only after Supabase verifies a mailbox code, and new profiles start private. Existing provider accounts and historical roster claims continue through their existing paths.

Before setting the binding, verify that the existing Supabase Auth project has an authorized SMTP sender within the $0 new recurring cost target. Supabase's default mailer only delivers to project team addresses and is capped at two emails per hour. Confirm that the Confirm Signup and Magic Link templates visibly include `{{ .Token }}`.

Use the Cloudflare dashboard for the existing `exm` Worker to add `EXM_SIGNUP_REHEARSAL_EMAIL` as an encrypted Worker Secret. Enter only the authorized non-founder mailbox outside the Supabase project team and leave `EXM_PUBLIC_SIGNUP` unset. Open `/account?signup=rehearsal` to test both first signup and resuming incomplete signup, then verify first sign-in and one-time recovery codes. Check the ordinary Account page and an unrelated address still show closed signup. Remove the rehearsal secret after testing and confirm the rehearsal page is closed. The app rejects outstanding rehearsal proofs after secret removal or rotation. No mailbox address belongs in the build, repository, or support screenshots.

Once these checks pass, set `EXM_PUBLIC_SIGNUP=verified-email` to open public signup. Remove the binding to close signup again. Completed accounts keep their ordinary sign-in and recovery access.

The local integration test in `tools/test-public-signup.mjs` requires loopback Auth and PostgREST URLs and an isolated SMTP inbox at `EXM_SIGNUP_TEST_INBOX`. The inbox endpoint receives an `email` query parameter and returns the delivered plaintext code. An isolated mailbox test does not establish production delivery.
