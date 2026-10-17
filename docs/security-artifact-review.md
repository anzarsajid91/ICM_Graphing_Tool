# Release artifact correction — 2026-10-18

HB-13 — Medium severity, high confidence: incomplete preview packaging and
incorrect HTTP scope would prevent reliable artifact/live acceptance. No
engineering-data disclosure is established by this finding.

Independent download inspection of PR #81's otherwise passing candidate
`3e87d4500acf56c587cba2dd778a19170a55fac0` found a packaging defect before merge.
Workflow run 39068838270 uploaded preview artifact 12115475207, ZIP SHA-256
`a8204855649af9c58309ca88ca5cec11b38df30d6299c8ea5299ad754568ce14`.
Its manifest required `.nojekyll`, but the archive omitted that hidden file.
Every other packaged file matched. Strict local verification correctly failed;
the archive was not repaired or represented as passing.

The preview uploader now explicitly retains hidden files from `_site/` only.
It does not include the repository, credentials or selected engineering files.
The browser gate downloads its own uploaded preview, compares the original
tested manifest byte-for-byte and verifies every packaged file before passing.
The existing production build also retains its tested-manifest comparison.

The current GitHub Pages endpoint returned HTTP 404 for `.nojekyll` during the
same assessment. This empty file is a deployment control, not an HTTP resource.
Integrity schema 2 records it explicitly in `deployment_controls`, while keeping
it in the complete `files` hash inventory. The only permitted control is literal
`.nojekyll` with SHA-256 of empty bytes. Other control names, nonempty content,
unknown schemas, missing control metadata or missing packaged files fail.
Other dotfiles remain ordinary HTTP assets; no generic 404 tolerance is added.

Live verification first validates all local packaged files and control metadata,
then requires an identical live manifest and exact hashes for every HTTP asset.
It reports HTTP-resource counts separately from controls verified in the
packaged artifact. It does not claim the control file was retrieved over HTTP.

Regression evidence: the downloaded original preview failed full integrity;
three new contract checks failed before correction. After correction all 17
privacy/claim/artifact/applicability tests pass locally, including forged control
exemptions, hidden-file loss, nonempty controls, tampered HTTP bytes and missing
ordinary HTTP assets. Full final-head CI, round-trip archive verification and
post-deployment live checks remain required. No application runtime, hydraulic
method, user-data destination or confidentiality exception changes.
