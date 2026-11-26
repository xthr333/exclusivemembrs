# Connected member fixes

Based on production `de52746`. Includes the complete two-file phone upload fix from PR #4; do not apply it a second time.

- Accept source photos up to 25 MiB and 50 megapixels; still compress to 256px WebP within the original server size limits. No stored image size increase. Browser format support is still required; HEIC is not claimed as verified.
- Linked, opted-in public members retain dynamic profile links. Unclaimed/hidden member accounts with existing public artist pages link to those approved pages instead of plain archives. Do not force private accounts public or merge identities by name.
- Remaining historical-only artists have styled record cards and collapsible bouts.
- Existing Pilot/Season I winner-only records now appear on the relevant artist record without invented match wins or wallet payouts. Historical scores/ledgers are unchanged.
- Empty producer standings now include the existing Vantiva public profile, clearly unranked. This is discovery, not a fabricated producer leaderboard.

Remaining release limitations: full all-time historical reconciliation requires supporting records; live earn/redeem/equip requires an authorized non-founder session; actual iPhone/HEIC must be checked on-device. These are not solved by visual changes. Keep public signup, existing intake and access gates unchanged.
