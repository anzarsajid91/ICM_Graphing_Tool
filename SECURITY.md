# Mandatory data-confidentiality contract

## Non-negotiable rule

Hydra Bench MUST NOT transmit imported engineering data, calculation inputs,
calculation outputs, or metadata identifying those data out of the browser over
any network during application use. This is a release-blocking requirement for
every future commit, PR and branch. No debug, analytics, AI, support, performance
or deadline exception is permitted.

Protected information includes source contents and excerpts; filenames and paths;
asset/client identifiers; dates, timestamps and measurements; units, thresholds,
mappings and exclusions; comments and review decisions; source hashes; metrics,
spill results and other calculated outputs; charts and reports; and diagnostics
or stack traces containing any of the above. Encoding, hashing, aggregation or
anonymisation does not create an upload exception.

## Permitted operations

- Download fixed, reviewed application code and dependencies. Production resources
  must be served from the application's own origin. Requests must contain no
  protected information; a fixed release-version token is permitted.
- Transfer data between the UI and browser workers; calculate in local memory and
  Pyodide's browser-local virtual filesystem; save in browser-local storage.
- On explicit user action, export files to the user's device, open local print
  output, or copy information to the local clipboard. The application must not
  initiate cloud upload, remote print delivery or automatic sharing.

GitHub receives ordinary connection metadata when it serves the application.
That is not permission to send project information. Files selected in the browser
must never be added to GitHub, Actions artifacts or error-reporting services.

## Required controls

1. `AGENTS.md` governs all contributors and coding agents.
2. `scripts/verify_data_confidentiality.py` checks browser/Python sources for
   network-capable code. Existing such files are bound to reviewed SHA-256
   approvals. Changes require a fresh review and rationale, not blind rebaselining.
   Vendor contents must match the separately approved dependency manifest.
3. The confidentiality workflow runs without path/branch filters on every push
   and pull request. A failure must never be ignored.
4. The Pages builder runs the source gate before producing any artifact. Release
   browser acceptance observes requests from pages, popups and workers, rejecting
   non-resource requests, request bodies, unapproved URLs and network sockets.
   It covers normal imports, analysis, exports and the existing regression flows.
5. Run the guard's positive and negative tests, including attempted uploads,
   same-origin data queries, external requests and sockets. Use synthetic data.
6. Keep real project data out of fixtures, issue bodies, test logs and CI artifacts.

The source scan is a conservative change detector; it is not a JavaScript
security sandbox or a substitute for review. Browser assertions apply to the
executed flows. Record test limitations honestly. Never state that a passing gate
proves every possible browser/environment behaviour.

## Repository administration

Configure `Data confidentiality / confidentiality` as a required status check for
`main`; require PR review; restrict direct/force pushes and bypass permissions.
Protect changes to this policy, approval inventory, guard, and workflow with
maintainer review. These server-side controls are separate from files in the
repository and must not be claimed as configured without verifying them.

## Reporting a concern

Do not publish client data, credentials or sensitive evidence in a public issue.
Contact the repository owner through an established private channel. If a change
could violate this contract, stop its release, investigate with synthetic data,
and restore a reviewed version. Follow applicable employer/client incident rules.
