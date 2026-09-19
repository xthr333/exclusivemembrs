# EXCLUSIVEMEMBRS® connected master build

Upload every file in this folder to the root of the GitHub Pages repository.

Public pages share:
- style.css
- config.js
- script.js
- Supabase JS v2 CDN

Supabase table expected: public.exm_updates
Columns used: id, created_at, category, headline, description, link_text, link_url, featured, published

Security:
- config.js contains only the public publishable key.
- Never place a service-role/secret key in this repository.
- Owner write security must remain enforced by Supabase Auth + RLS.

admin.html:
- signs in with Supabase email/password
- creates, edits, publishes/unpublishes, features/unfeatures, and deletes exm_updates
- RLS decides whether the authenticated account is allowed to write

index.html:
- loads the newest 3 published transmissions

updates.html:
- loads all published transmissions
