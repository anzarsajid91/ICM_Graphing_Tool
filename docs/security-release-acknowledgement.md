# Owner administrative release verification

HB-15 — High assurance risk: GitHub can redact `bypass_actors` from a ruleset
response. The previous `(full.bypass_actors || [])` check interpreted redaction
as absence. A new negative test reproduced that false acceptance. GitHub documents
the [permission-dependent field](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset).
Authenticated owner reads confirmed the real list is empty; this does not prove
that the read-only Actions token can see it.

## Required release record

The already authorised single-maintainer process now requires a fresh owner
administrative verification record for every production merge. Governance API
calls remain read-only; existing Pages publication permissions are unchanged.
No administrator secret, bypass actor or override input is added.
All effective-rule, status-provider, owner-merge and artifact checks remain required.

After the approved PR merges, the owner or an explicitly owner-authorised assistant:

1. Confirms the actual merge SHA and reviewed PR head, all mandatory checks and
   the final diff. Reads every active repository/inherited ruleset through the
   authenticated administrative interface. The complete bypass lists must be
   visible and empty. Rechecks the main-only deployment environment and disabled
   administrator bypass. Unavailable evidence is not permission to continue.
2. Posts a new top-level Conversation comment on that merged PR, using the
   authenticated repository-owner account. This is the authorised release
   acknowledgement; an automation's bot comment cannot substitute for it.
3. Uses exactly `HYDRA_RELEASE_ACK_V1` followed by a newline and JSON with these
   fields: `schema: 1`, `repository` (owner/name), `pull_request` (number),
   `release_sha` (actual merge SHA), `pr_head_sha` (reviewed head),
   `review_policy: "single-maintainer"`, and `rulesets` (complete active list).
   Each ruleset contains exactly `id`, `source_type`, `source`, `updated_at`
   copied from the fresh API response and `bypass_actors: []` after verification.
   Do not include credentials, engineering data or confidential evidence.
4. Leaves that record unedited. A correction, settings change or expired record
   requires a fresh administrative read and a new comment. Automated repair
   workflows must not create owner records or grant themselves release authority.

The build reads all rulesets and comments with pagination. It checks the stable
owner account ID, exact repository/PR/merge/head identity, complete ruleset
identities and update times, and creation after the merge and ruleset updates.
Records expire after six hours; future/invalid times fail. A visible nonempty or
malformed bypass list always fails. A redacted list requires the owner record;
it is never interpreted as an empty array.

GitHub GraphQL [explicit comment edit metadata](https://docs.github.com/en/graphql/reference/issues#issuecomment)
must show `lastEditedAt: null` and `editor: null`; matching REST timestamps alone
cannot detect a same-second edit. Current body/author/repository must match, and
the comment must not be minimized. Missing API/edit evidence fails closed.

This record documents authenticated owner verification, which may be prepared
with authorised AI assistance. It is not independent human approval or continuous
CI visibility into administrative settings. The owner can edit repository settings;
changes after a verification remain a governance limitation. Current public
ruleset update times detect drift from the recorded snapshot at the build gate.
Deployment and live tests still determine whether the release is accepted.

## Regression evidence

The old helper failed the new omitted-field rejection test. The corrected
governance units pass visible/redacted actor cases with valid owner evidence,
multiple rulesets, pagination requirements and 48 negative cases. These include
missing/forged/edited/stale/future/pre-merge records, changed/extra/missing rulesets,
visible bypass actors, API failure and weakened existing controls. Actual CI,
owner-record validation and production acceptance remain required.
