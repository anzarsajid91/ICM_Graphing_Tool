# Historical Actions evidence retention — 2026-10-18

HB-14: **High operational assurance risk**, confirmed destructive capability.
This concerns audit evidence availability; no engineering-data transmission or
hydraulic calculation change is established by this finding.

The existing `reference-evidence-cleanup.yml` ran on main pushes changing its own
file or `scripts/purge_retired_reference_evidence.py`. PR #81 changed its Action
pins, triggering the old cleanup with `actions: write`. The script classified Git
trees containing retired fixtures and automatically deleted associated evidence.
This destructive trigger should have been identified before merge.

Run **39073435064**, job **117515595726**, reported 678 classified heads and
1,884 selected historical runs. Its final **2026-10-17 22:10:17 UTC** summary
reported **0 artifacts deleted**, **1,884 retired-reference run logs deleted**,
and current deployment/static-site artifacts preserved. These are the script's
reported counts; each log's prior availability/content was not independently
established. No historical log contents are reproduced. Cancellation did not
prevent the reported operation. Deleted logs have no normal repository UI restore;
recovery from external copies or GitHub support has not been established.

Pages run **39073435149** was cancelled before build/deployment. Its completed
engineering verification passed 325 tests and 100 subtests; security and browser
interactions passed. Cancelled jobs are not passes. The public app remained
v1.066 at `8c7f59ff94ecdf0c84c5b22f1f9ec6d6d4c38a98` on the resume check;
PR #81 is merged at `5087aea903e8659076e8fd6562c91e8533d7ae8e`.

## Correction and impact review

The workflow now has only a manual dispatch trigger, main-only execution and
`contents: read` / `actions: read`. The script retains its historical filename
for compatibility but uses GET requests only. All artifact/log deletion and run
cancellation code is removed. It reports candidate IDs using metadata, without
reading engineering files, artifacts or log contents. No deletion flag exists.
This correction does not restore historical logs.

Any future deletion requires a separate reviewed proposal, explicit owner
authorisation for exact targets and controlled handling of potentially sensitive
material. Inventory classification neither establishes authenticity nor grants
deletion permission. Do not republish confidential material to replace evidence.
Normal retention expiry, repository/account authority and external copies remain
limitations. Browser/runtime code, data destinations and hydraulic methods are
unchanged. All mandatory checks remain enabled under the already authorised
single-maintainer policy; independent human approval is unavailable.

## Regression evidence

The old script failed an isolated synthetic HTTP-boundary test when it attempted
DELETE. The corrected script passes that same inventory test using GET only.
Tests also reject a deletion flag before network access, reject incomplete Git
trees, and require a manual-only workflow with read permissions and a main-only
dispatch condition. All four targeted tests passed locally after correction.
No real evidence was deleted by these tests. Full protected PR checks, actual
publication-archive verification and live acceptance remain mandatory.
