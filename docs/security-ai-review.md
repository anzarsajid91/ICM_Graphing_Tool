# Separate AI release review — 2026-10-18

This is additional AI scrutiny, not independent human review or certification.
The read-only reviewer inspected the candidate snapshot and release/security
controls. It found no changed hydraulic calculation source and no introduced
engineering-data transmission path in the reviewed diff. That is a bounded
code-review observation, not a proof for all browser execution paths.

Two medium-priority release-control gaps were corrected before merge:

1. The production governance script now rejects missing conversation-resolution
   enforcement and missing/weakened CodeQL high/error alert thresholds. Twelve
   synthetic rejection cases exercise the guard. Current server settings already
   contained these protections; the change detects subsequent drift.
2. Immediate post-deployment verification now accepts successful main-branch
   Pages runs triggered by either push or workflow_dispatch, matching the actual
   deployment entry points. Failed runs and non-main runs remain excluded. The
   existing workflow regression requires both event types.

The reviewer separately ran the source/claim validators, 13 privacy tests,
privacy-network units, CSV units and the earlier nine-case governance suite.
The author then ran the corrected twelve-case suite and both workflow assertions.
All passed. Browser/live execution and a fresh online OSV query were outside the
reviewer's scope; final-head CI and production verification remain required.

Environment main-only/admin-bypass settings are point-in-time administrator
evidence. The production script does not continuously inspect environment
settings because its token has no administration permission. Repository-owner
control over settings and the lack of independent human oversight remain risks.
