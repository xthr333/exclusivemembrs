# ExclusiveMembrs 2.0 development record

## Milestone 0 · Repository audit

Base revision is `d3b778b8051910d0e74bf1d432dc8f11fc6bdab1` on `main`. Development is isolated on `exm-2.0`. The audit used the repository and local build. Live service configuration and private records were outside the test environment.

| Area | Existing implementation and preservation boundary |
| --- | --- |
| Public delivery | Twenty-three root HTML routes, local CSS and vanilla JavaScript, licensed self-hosted fonts, WebP artwork, real product galleries, and W3 photos. `tools/build.mjs` copies an explicit set of static files and inlines the core layout. `v2-preview/` is outside the existing production build. |
| Cloudflare | The assets-only Worker is `exm`; Wrangler declares the apex and www domains. Git deploy instructions in `ROLLOUT.md` target `main`. Preserve the domains, Worker, static routes, headers, and current build entry point. |
| Community | The artist roster links ten shareable artist hubs with verified source links from the prior rollout. These pages have no user-owned accounts or member authorization. Keep their URLs as stable entry points as historical identities are linked. |
| Content | `script.js` merges published `exm_updates` rows from the browser Supabase client with `updates.json`. It deduplicates and filters superseded announcements. The legacy admin page has email/password login and announcement CRUD. |
| SongWars | `events.html` contains the archived Season III bracket and a Season II champion reference. `songwars-public.json` is a dated, sanitized approved-field snapshot containing 12 duos and an empty waitlist. The external registration Site's D1 is the authority for applications. The existing IV interest form is a separate external path. Repository evidence does not establish complete Season I–III rosters or panel histories. |
| Other services | Printify handles product availability, fulfillment, and checkout. Formspree handles contact and creator submissions. Creator Residency and W3 photography link to their existing intake and portfolio. Discord and public social/music links remain external. |
| QA | `npm run check`, build, Python link validator and nine unit tests, and the separate merch suite passed at baseline. The tracked secret-pattern scan found no matching private-key, Supabase secret-key, or GitHub-token patterns. The browser Supabase key is publishable. |

### Risks and dependencies

- The existing admin page displays its controls for any local authenticated session. Database write protection depends on RLS, whose deployed policy and role grants are absent from the repository. Admin code also supports deletion, defaults new updates to published, and surfaces database messages. Verify grants, draft visibility, role controls, duties, and audit retention against an isolated schema before joining member and staff authentication.
- The public feed loads a floating Supabase CDN major, fetches published rows without pagination, and can show saved content when the live feed is unavailable. Scheduling and expiration need query-level enforcement and a fallback policy that cannot resurrect retired announcements. Preserve the existing table and historical records until a migration is verified.
- The original site duplicates navigation/footer markup and contains unused rollout-era SongWars client counters. Leave the public records untouched and keep new event state separate until an authoritative workflow is reconciled.
- Public pages contain known links and static historical material. Review public panel names and identity aliases with Wayne against the authoritative historical evidence before converting them to claimable records. Store claim reservations and verification notes privately.
- The baseline has no local Supabase fixtures, SQL migrations, Worker API, or server-side member tests. Budget monitoring needs provider usage data. The infrastructure target is $0 recurring within eligible free-tier limits, independent of domain renewal.

### Implementation sequence and data boundaries

1. Preserve the existing Cloudflare assets deployment. Add same-origin API paths only as features gain local integration tests. Develop against isolated data and keep production configuration disconnected during QA.
2. Use managed password authentication and a server-authorized account boundary. Test the no-email-verification flow separately from the current owner login. Treat email as an unverified credential identifier, and require a recovery code or controlled support verification for account recovery. Use bounded inputs, generic failure responses, opaque expiring sessions, and single-use hashed recovery codes. Store public profiles, private account information, and staff permissions separately. Unique normalized usernames, role links, follows, legacy aliases, and one-time claim consumption need database constraints.
3. Keep lifetime XP and spendable points in auditable ledgers. Apply verified awards once per member and activity source. Checkout, inventory, and points debit must be transactional. Seed shared cosmetic definitions. Define category metrics and time filters explicitly, and grant championship items from official outcomes. The personalized dashboard reads activity from official events and verified milestones.
4. Add event templates, lifecycle and preview permissions, registration questions, private applications, review status, waitlists, staff assignment, and competition results. Keep progression tied to published, verified participation/results. Design publication scheduling behind an explicit owner setting. Preserve existing SongWars public assets untouched. Bring in verified historical results additively, with an identity/alias reconciliation and an opt-in external D1 migration plan. Keep IV interest separate from future account-optional official applications, with judge eligibility and Discord voice/camera checks before roster confirmation.
5. Build the five owner tools over explicit staff permissions, scoped server endpoints and audit logs. Integrate announcement preview, pinning, scheduling, expiry and archive without deleting existing updates. Verify owner and non-staff access, and rehearse backup and restore before proposing production migrations.
6. Expand the public Media and Divisions routes as real work becomes available. Keep Printify merchandise separate from digital rewards. Use existing local WebP assets, lazy loading, and trusted external embeds with accessible link fallbacks. Confirm quotas, accessibility, and visitor/member/admin journeys before proposing a release.

## Milestone 1 · Public foundation

- Shared navigation and footer templates are in `tools/templates/`. Edit those templates and run `npm run sync-layout` to update the source HTML. The checks and build reject stale copies; rendered navigation works without JavaScript.
- Homepage uses the existing chrome logo, a brief image glitch, and a reduced-motion fallback. It connects planned SongWars IV interest, verified Season III results, a community spotlight, Media, merch, published updates, and the EXM mission.
- New `media.html` links the existing EXM channel, Season III recap, and artist music. New `divisions.html` links active W3 photography and the in-development Creator Residency. Community goes to the existing public artist roster.
- `npm run check`, `npm run build`, `node tools/test-merch.mjs`, and both Python checks passed. `tools/test-platform-ui.mjs` ran 50 Chromium desktop/mobile page checks, short-screen navigation and hero checks, reduced-motion, offline announcements, nested 404, and no-script navigation. The Chromium run blocked external requests, so it exercised no production database, sign-ins, application submissions, or checkout. Run the browser test after building with a local Playwright installation. Set `EXM_PLAYWRIGHT_MODULE` or `EXM_CHROMIUM` when using environment-provided paths.
- Files changed include the public and admin page shells, the homepage, the new routes, `browser.css`, `script.js`, `rollout.js`, the sitemap, and build and QA tools. The historical bracket markup, snapshot, static updates, media, and Worker configuration remain preserved.
- Ready for local review. Native Safari and Firefox, physical devices, live roles, and third-party integrations remain unverified. The remaining account, progression, events, and owner work is substantial. Use working local vertical slices to estimate later phases. Codex usage and billing were unavailable.

Rollback before release is to switch back to the original base branch. An eventual approved release can be reverted in Git and rebuilt with the existing Worker pipeline. No data migration is required to roll back this public foundation.

## Milestone 2 · Account vertical slice

- `account.html` and `member-account.js` provide signup, sign-in, initial code display, profile editing, sign-out and support reference generation. The local Worker entry point is `server/member-dev.mjs`. The existing deployment entry point still serves static assets.
- Signup validates email, case-insensitive username and password confirmation. GoTrue hashes the password. EXM derives a keyed, non-mailing identifier from the normalized email because EXM does not verify ownership of the submitted address. Save and back up the signing secret securely. Losing or changing it would break login identifiers and recovery codes. Signup responses are generic. Sign in after signup to receive eight codes once. Each 128-bit code is stored as a keyed hash. Redeeming one atomically creates a support case. The cleanup function removes references older than seven days. A support reference does not reset a password or grant account access.
- Session cookies are opaque, Secure, HttpOnly and same-site. Hashed sessions expire after one day and logout revokes the current session. Same-origin checks protect mutations. Password and recovery endpoints have shared database rate limits. Service calls use server-only credentials. Data API functions deny anonymous and authenticated roles by default. The browser receives neither provider tokens nor internal auth addresses.
- The isolated migrations are under `supabase/migrations/`. It reserves existing public artist and service handles. Those reservations carry no identity claims or verified history. The existing artist pages and owner/updates integration are preserved.
- Community adds a paginated, searchable directory to `artists.html`, with links to `member.html`. Members can set multiple creative roles, hide their profile, and follow or unfollow public members. Public reads expose only display fields and visible relationship counts. Self-follows are rejected, duplicate follows are idempotent, and creative roles carry no staff permissions. The legacy roster still works when the account API is unavailable.

### Local verification

The standard local stack could not extract the Supabase Postgres image within the environment's disk quota. The migrations and API passed against isolated GoTrue v2.188.1, PostgreSQL 17 and PostgREST 14.3. The test exercised case-insensitive conflicts, mismatched/oversized passwords, first-login codes, profile updates, direct API permission denial, disabled direct signup, concurrent code redemption, rate limits, and cookie revocation. Chromium independently completed signup and login, saved code display, edited and reloaded a profile, signed out opened a recovery support case, filtered the member directory, and followed and unfollowed another member. A local Wrangler run independently served the account page and verified signup, login, session, and directory routes. No provider account outside the local fixture was used.

On a machine with a local Supabase stack, initialize an unlinked local project, set `auth.enable_signup = false`, and start it from this checkout with the migration. Local auth services need email/password enabled and public signup disabled. Supply these settings to the dev Worker or tests from an ignored local environment file.

| Setting | Local value |
| --- | --- |
| `EXM_MEMBER_AUTH_URL` | GoTrue endpoint, usually the local Supabase gateway's `/auth/v1` path |
| `EXM_MEMBER_DATA_URL` | PostgREST endpoint, usually the local gateway's `/rest/v1` path |
| `EXM_MEMBER_ANON_KEY` | Local Auth API JWT for the anon role |
| `EXM_MEMBER_SERVICE_ROLE_KEY` | Local service-role API JWT |
| `EXM_MEMBER_PEPPER` | Random 32-byte secret encoded as 64 hex characters |

Run `npm run build` and `wrangler dev -c wrangler.member-dev.jsonc --local` for an isolated preview of `/account.html`. The real-database checks run with `node tools/test-member-api.mjs` and `EXM_MEMBER_UI_TEST=1 node tools/test-platform-ui.mjs` after setting those variables. Set `EXM_MEMBER_WORKER_ORIGIN` to the local Wrangler origin to test the API through the Worker. The test scripts reject remote service URLs.

### Work remaining and release gates

Milestone 2 is in progress. Staff review and recovery completion, verified historical identity claims, profile media, avatars, moderation, and affiliation/history/achievement filters need more integration work. Verify operational cleanup for expired sessions, recovery references, and rate buckets before hosted enablement. Staff authentication remains independent of member signup and there is no access to legacy draft updates through this local account flow. Hosted-provider Auth settings, quotas, and backup/restore remain unverified. The dedicated hosted account database is a proposed isolation choice and has not been provisioned. Its eligibility for the variable free-project allowance needs confirmation before production planning.

## Remaining implementation estimates

Effort estimates are focused development days and include tests, with no estimate of Codex credit usage.

| Milestone | Remaining work | Rough effort |
| --- | --- | --- |
| 2 · Profiles and legacy identities | Account recovery review, staff roles, avatar and supported social/media fields, reporting and moderation, reconciled aliases, and single-use verified claims. Existing Seasons I–III records need authoritative reconciliation before import. | 2–4 days after source access |
| 3 · Progression | Configurable XP awards and levels, separate spendable points and atomic ledger/inventory, verified category/period leaderboards, championship-exclusive earned cosmetics, five frames, five banners, ten badges, and the dashboard with official activity. | 3–5 days |
| 4 · Events | Reusable templates, manual preview and publication, event statuses, applications and waitlist, live streams, brackets, scoring and results, idempotent verified awards, and eventual SongWars IV approval workflow. Preserve account-optional intake, historical judging eligibility, Discord camera/voice checks, and separate interest. | 5–10 days plus data reconciliation |
| 5 · Admin and announcements | Owner and staff authorization across Overview, Events, Applications, Members, and Content & Rewards. Add audit trails, approval controls, announcement pinning, expiry, timestamps and archiving. Test denial and restore procedure. | 3–5 days |
| 6 · Media and release integration | Add verified productions and external embeds, build on merchandise galleries and Printify checkout, check budget limits, and run full browser/accessibility and integration QA before an owner-approved release. | 2–4 days |
