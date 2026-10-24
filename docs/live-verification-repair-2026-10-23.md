# Live verification repair — 23 October 2026

## Evidence and scope

The repository had no open bug issues at inspection. Of the latest 20 Actions runs,
16 live verifications passed and four failed. Run 39948437961 failed downloading
an application resource with HTTP 503; run 39725283973 failed with a read timeout.
Both stopped at fixed-asset verification before browser acceptance. The latest
run 39993358838 passed. These observations do not establish that every failure
has the same cause or that every application feature is defect-free.

## Security impact review

High change class: CI integrity verification and workflow evidence retention.
Fixed-resource GETs now make at most four attempts for HTTP 429/500/502/503/504
and timeouts, waiting 1, 2 and 4 seconds. The exact URL and expected revision stay
unchanged. No engineering inputs enter this CI-only helper. Missing resources,
certificate errors, redirects outside the application root, manifest differences
and content hash differences still fail. Exhausted transient failures still fail.
No status gate, required check, dependency, browser source, runtime calculation,
claim wording, source approval or branch protection is changed. The reviewed
builder evidence digest changes as described below.

The workflow retains build and integrity stdout/stderr with pipefail enabled.
This makes failures before browser startup available in the evidence artifact.
The six-hour schedule and failure notifications remain enabled.

## Dependency PR triage

PR #91 only raises the legacy Polars lower bound from 0.20.0 to 2.0.0. The existing
unbounded upper range already permits 2.x. No application change requires this
minimum, so it is unnecessary for this release and can be closed without merging.
PRs #82–#90 and #92 remain relevant dependency proposals. They are not superseded
by this repair and need their own compatibility/security validation. In particular,
the bounded workbench Python ranges must not be widened solely to clear the queue.

## Validation

Local privacy/security unittest suite: 28 passed, including new transient recovery,
bounded exhaustion, permanent HTTP failure, timeout and certificate/redirect cases.
Existing live-integrity tests retain tampered asset and missing resource rejection.
All JavaScript *-unit.mjs suites passed. Source confidentiality, claim evidence,
Pages build and npm audit passed (zero reported npm vulnerabilities).
Full Python and GitHub CI results are recorded in the PR after execution.
No independent human review or production deployment is claimed by this note.

## Additional packaging correction

A local rebuild after tests included two host-generated bridge .pyc files absent
from the live manifest. The browser source copy now excludes __pycache__ and
*.pyc at every depth, as the Python package copy already did. A synthetic staging
test checks generated files/test runners are excluded while source, runtime and
.nojekyll remain. The build-script evidence digest in claims.json was updated
only after reviewing this diff: SC-02 fixed same-origin resource delivery remains
true; this change removes non-runtime host outputs and adds no network operation.
The final repair includes this reviewed evidence-digest change.
