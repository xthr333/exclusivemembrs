# Rollout checks — November 7, 2026

## November 8 cross-browser style pass

- Added WebKit text/gradient/mask/backdrop prefixes, safe-area spacing, dynamic viewport fallbacks, readable native form controls and reduced-motion/forced-color fallbacks without restricting pinch zoom.
- Self-hosted the existing Barlow Condensed and IBM Plex Mono Latin WOFF2 fonts, preserving their original files and SIL Open Font Licenses. No new imagery or brand copy was added.
- Checked 23 pages at 320px and 1280px widths, plus eight main pages at 390px and 768px: 62 Chrome browser-frame layout checks with no horizontal document overflow. Main-page checks also found no broken loaded images.
- Exercised the short landscape menu at 844×390. Fixed inherited flex wrapping that put menu links into hidden columns; the Contact link remains reachable after opening More.
- Added automated coverage for every page's stylesheet order, viewport accessibility, font files, no-IntersectionObserver visibility and contact success/failure fallbacks with and without AbortController. Contact tests use stubbed fetch; no email was sent.
- Native iOS/macOS Safari, Firefox and Edge are not available in this environment. Browser-targeted code fallbacks are implemented, but these checks are not native-browser or physical-device certification.

## November 8 buyer-help follow-up

### Full-site review, November 8

- Checked 23 root pages at 320px and 1280px browser-frame widths: no document overflow, missing image alt attributes, blank unlabeled buttons or missing h1s. This is responsive Chrome testing, not physical-device certification.
- Checked 36 live URLs: main/www domains, public page routes, all 10 product destinations, SongWars portal, Residency information/interest destinations and the supplied W3 portfolio returned HTTP 200. Social platforms and payment transactions were not exhaustively tested.
- Exercised mobile navigation/More menu, all five shop filters, product-photo switching and bracket round navigation. Confirmed six empty required contact fields remain invalid without submitting a message.
- Re-read live SongWars registrations and staff: approved roster and public panel still match. Refreshed only the sanitized snapshot timestamp; no private contacts, attendance timestamps or staff application text published.
- Reduced the remaining oversized Residency spotlight on Updates, corrected W3 photo dimensions, added no-JS update navigation, and made image-error guidance context-aware.
- Contact delivery remains owner-confirmed; no purchase, message, login or approval mutation was performed in this review.

- Wayne confirmed the contact form works, closing the prior inbox-delivery question.
- Added shipping, returns and order help linked from the shop, contact page and all public footers.
- Policy references: official Printify Pop-Up Store overview, shipping setup and refund/reprint documentation; shipping methods and charges remain checkout-dependent.
- No test message, purchase, payment, refund or third-party account change was performed in this follow-up.

## Earlier rollout checks

- `node tools/check.mjs`: PASS. 12 pages; 317 local links/assets; 7 inline/external script syntax checks; unique IDs and single main/h1 per page.
- `node tools/build.mjs`: PASS. Buildless static output, no paid dependencies.
- `wrangler@4.158.0 deploy --dry-run`: PASS. Assets-only Worker configuration accepted. This does not deploy or prove live delivery.
- Desktop Chrome preview: homepage, collection filters (tech, pets, all), primary navigation and corrected SongWars field checked.
- Responsive Chrome iframe checks: home at 390px and 320px; SongWars, contact, artists, shop, Residency and W3 at 320px. No horizontal document overflow after fixes. This is not physical-iPhone testing.
- Mobile menu opened and navigated successfully. Shop category filters update visible groups and accessible status; All restores four categories.
- Tournament rendering: 12 approved duos, six paired Opening matchups and one waitlist duo; As5 occupies position 12. Removed duo is absent. Source read from live registration D1 during this run.
- Official source logo retained; new WebP delivery assets optimized. Main logo reduced from about 1.4 MB to 178 KB; beanie image about 27 KB. Non-roster product mockups hosted locally.
- Public snapshot allowlist contains duo/artist names and public social handles only. No private contacts, attendance timestamps, credentials or staff application free text included.
- Existing Supabase public update feed successfully rendered alongside the curated fallback in the preview. No backend schema, RLS, account or database record was changed.
- No contact submission, purchase, payment or private owner sign-in was performed.

Production verification: Cloudflare automatically picked up the GitHub main commit. The public domain rendered the new homepage, including both optimized hero images. Live SongWars, Residency and W3 pages opened successfully; SongWars showed all six corrected matchups. The dashboard required sign-in, so build settings were not inspected. Confirm the build command is npm run build to include robots.txt, sitemap.xml and _headers; the older copy command omits those three optional files.
