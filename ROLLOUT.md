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

The old copy-based build still delivers the HTML/CSS/JS/assets, but **does not copy robots.txt, sitemap.xml or _headers**. Use the new build command for the complete release. If the deleted Worker was the only Git integration, connect the existing **exm** Worker to this repository instead. No Cloudflare credential is stored in this repo.

## Data boundaries
`songwars-public.json` is a dated, public-only snapshot, not a live registration API. The registration Site's D1 remains authoritative. Future registrations or approval changes need a fresh verified snapshot and commit. The existing Supabase published-update feed still loads automatically on visits; recent curated static updates are also shown. Two obsolete announcement headlines are excluded from rendering to avoid restoring the known false all-confirmed/panel announcements. Database rows are not deleted or changed.

Artist links, shop URLs, social accounts and contact endpoint were retained from the existing project. Purchases, availability, product options, W3 booking and Residency applications remain on their existing platforms. No embedded cart, new payment collection, new newsletter list or account system was invented.

## Owner decisions / verification limits
- Staff database currently lists Ju/Gottaitch as an official judge and jfasure as backup, unlike the latest announced panel preference. No staff role changed here; Wayne must reconcile the official source before a new panel announcement.
- The Residency landing page avoids unverified open/closed claims and sends visitors to the existing official process. Property, dates and places remain unconfirmed; invoices are manual.
- Contact endpoint delivery, private owner sign-in/RLS and real checkout must be verified by Wayne in the live accounts. No credentials, messages or purchases were used to test them.
- Source publication and live deployment are separate. Do not call this live until Cloudflare reports success and the domain renders the new home.

## Rollback
All previous source remains in Git history. Revert the rollout commit to restore the prior site. Do not delete the repository, Worker, registration database or domain.
