# EXM recovery — continue PR #3, do not rebuild

Branch: `codex/exm-rewards-access-review`. Production was not deployed by this review pass. Reconcile the latest main branch before merging. Keep the existing Cloudflare/Supabase workflow, existing member identities, access policy, and $0 new monthly costs.

## Implemented in this branch

- Rewards navigation and sign-in return preserve the one-time recovery-code handoff.
- Photo selection/save feedback and a fix for browser-generated WebP containers carrying metadata that the existing avatar validator rejected. Server validation remains intact.
- Member profiles have EXM VHS texture, avatar/frame, stage name, badges, actual XP level/progress, and platform-labeled social buttons. No invented bio, photo, levels, or points.
- Events gets compact chrome/red standings styling, legible mobile rows, and a hosted-only Rewards Shop link. Results remain secondary and ranking explanations collapsed.
- Existing registrations, wallets, inventory, roles, and historical records are unchanged.

## Verified here

`npm run build`, `npm run check`, and `npm run check:public` passed. Chromium verified profile and leaderboard overflow at 320/390/1280 px, artist/producer tabs, season selection, and Results/bracket navigation. A simulated account API exercised sign-in/recovery return, photo/bio save-refresh-sign-in, and redeem-equip-refresh. The actual server avatar parser accepted the image produced by Chromium. These are not production database or live account tests.

## Finish with the live environment

1. Reconcile this branch against current production; reuse its work. Run the existing integrated tests against the real isolated backend, including authorization and concurrent redemption. Do not seed fixtures into production.
2. Verify @ybdd photo/bio saving and My Profile using an authorized session. Verify the full shop flow with an authorized non-founder account without spending Wayne's balance. Check Safari/iPhone uploads; do not claim HEIC support without testing it.
3. Preserve the EXM visual direction: black, chrome, restrained red, VHS/CRT texture and gritty promotional artwork; no flashing or extra dashboard clutter. Use supplied SongWars.gg screenshots for hierarchy, not copied assets.
4. Reconcile older historical evidence separately. Current totals are the imported records, not a complete career history. Do not invent older scores, rearrange rankings by preference, or issue wallet backpay without an approved policy. Keep unresolved research private.
5. Connect standings entries to a verified public member profile where supported; preserve existing roster/Legacy fallbacks for unclaimed identities. Never expose a private profile to make a link work.
6. Verify existing authorization, merge and deploy through the established pipeline, then smoke-test the exact live release. Do not reopen signup/applications or configure new providers as a side effect. Report remaining blockers honestly.

The latest visual pass changes CSS only; it does not correct incomplete historical rankings or prove live profile persistence. Do not label the entire site finished until the live member workflows pass.
