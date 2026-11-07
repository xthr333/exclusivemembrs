# EXM identity and product-photo review — November 7, 2026

## Implemented

- Official chrome logo retained. Homepage refocused on the founder's existing “It’s exclusive” and “Not a popularity contest” identity; no new geographic positioning.
- Emoji-led navigation and routes, chrome typography, restrained blue/lilac panel accents, stronger text contrast, rounded controls, and an original SongWars treatment.
- Actual-resource first-visit loading percentage, Enter/Escape controls, reduced-motion skip, and a 2.2-second maximum. No identity-verification fiction or fake statistics.
- All 10 store products have real gallery photos. 33 official Printify mockups downloaded and locally optimized; original product artwork is unchanged. Original source files are preserved. Catalog records source URLs and view names.
- Galleries switch images with labeled thumbnail buttons; selected view is announced and the image opens separately for inspection. Current pricing/options remain with Printify rather than a static invented price list.
- Older roster artwork is identified as original Drop 001 artwork, not the current membership list. Current artist roster is separate.
- Removed unauthorized “Philadelphia roots” language, stale Residency closure copy, and unneeded claimed history from About. Superseded launch-phase notices are excluded from display without deleting owner records.
- Owner form labels associated with controls, unavailable-client fallback added, and raw external error rendering changed to text.

## Checked

- 12 pages, 370 local references, unique IDs, script syntax and public snapshot privacy.
- All 12 pages at 320px iframe viewport: zero horizontal overflow and zero overflowing headings. Home visually reviewed at 390px and desktop.
- Menu opening, More submenu, Escape dismissal; shop category filtering; gallery selection and image caption changes.
- Contact required-field rejection with an empty form. No inquiry submitted.
- All 33 WebP assets decoded successfully. Total gallery-image payload approximately 517KB; originals retained separately.
- Official product URLs (10), SongWars portal, Residency experience/interest and W3 links responded HTTP 200.
- Current live SongWars registrations and staff read: 12 approved duos and one waitlisted duo; existing public field and approved staff match. No private registration or contact details copied to the public site.
- Existing 9 Python link-validator regression tests, plus new safe-link, stale-notice, deduplication, gallery-integrity and core-palette contrast checks pass.

## Boundaries

- This does not change prices, products, Printify checkout, database approvals, access policies, payment configuration, or the separate application sites.
- Payment transaction not performed. Printify checkout handoff was verified in the earlier rollout without entering personal/payment data or ordering.
- Contact inbox delivery still requires the owner to confirm receipt of a real inquiry; validation and error-safe frontend behavior do not prove delivery.
- Roster and staff are dated public snapshots, not a new realtime registration integration. Owner update feed remains the existing published-update connection.
- An existing Cloudflare build override must target Worker `exm`. Correct settings: build `npm run build`; deploy `npx wrangler deploy --name exm`; root `/`. Source publication is not proof that the production domain deployed it; verify the live page separately.
