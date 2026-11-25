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
- `EXM_MEMBER_MODE` uses `events` for staged Events activation. Remove the variable or set it to `off` for a code-level rollback to the public site. The deployment preserves these Cloudflare settings. No credential belongs in Git.

Check `/api/exm-mode.js` and `/api/platform/events` after activation. Sign in at `/account` with the existing EXM owner login, then open `/member-hub#staff`. Save a draft, open its preview, set the intended event status, and publish. An owner controls when registration opens and can review applications for that event. The form collects contact email and the event-specific answer and returns only a receipt. Staff permissions are scoped to assigned events.

Use `npm run build` and `node tools/test-hosted-api.mjs` with the isolated preview environment to rehearse before inviting people or changing `EXM_MEMBER_MODE` to `members`. The rehearsal refuses hosted provider URLs. In production, public signup and code recovery are disabled. Existing Auth accounts also need an approved EXM profile link before they can sign in. Verify the private invitation and ownership recovery process, provider signup settings, actual free-tier limits, and the source for any existing member history before expanding access. An Auth account with a verified MFA factor requires a supported MFA sign-in flow. The current password-only EXM form denies it.

Switching hosted mode off preserves events, applications and member history. Review access and export needs through authorized Supabase tools. Existing SongWars forms and gates remain with their current provider.
