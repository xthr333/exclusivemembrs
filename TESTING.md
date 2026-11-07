# Rollout checks — November 7, 2026

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
