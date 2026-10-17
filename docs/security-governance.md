# Security governance and contributor procedure

Policy updated 2026-10-18 with the repository owner's explicit authorisation: **single-maintainer review and release**. No independent human reviewer is available. AI-assisted review is additional scrutiny, not independent human approval. The owner authorised this candidate's release conditional on successful mandatory checks and effective branch protection. This replaces the initial proposed two-person governance requirement; it never waives confidentiality or failed checks.

Last verified server state: **Not Enforced** (`main` unprotected, no active rulesets). Do not claim the settings below are active until the effective-rules API and release gate verify them. The source assessment remains bounded; there is no certification or organisational approval.

## Administrator configuration (required before release)

1. In Settings → Rules → Rulesets, create an **Active branch ruleset**, target `refs/heads/main`. Include no bypass actors, including administrators or apps. Block deletion and force pushes.
2. Require pull requests and resolution of review conversations. Set required approvals to **0**, with code-owner and most-recent-push approvals not mandatory, because GitHub does not accept author self-approval. Dismiss any stale voluntary reviews. Require branches to be up to date and all mandatory checks. No bypass actors.
3. Require the exact check contexts emitted by a successful PR run, associated with GitHub Actions: `confidentiality`, `security`, `secrets`, `dependency-review`, `verify`, `browser-smoke`, `browser-firefox-shell`, `browser-interactions`, `baseline-performance`, `analyze (javascript-typescript)`, `analyze (python)`, `test (ubuntu-latest, 3.12)`, `test (windows-latest, 3.12)`, `security-release / security`. Confirm actual names from the checks API before saving; display names can change. Do not select skipped jobs or deployment-only jobs.
4. CODEOWNERS identifies the responsible maintainer. It does not constitute independent review and cannot enforce author self-approval. If another qualified maintainer becomes available, adopt independent review through a separately reviewed policy change.
5. Enable CodeQL/code-scanning merge protection for unresolved high/critical security alerts where available. A successful CodeQL analysis job means the analysis ran, not that there are no findings. Review the findings before release.
6. Restrict environment `pages-release` deployment branches to protected `main`. No independent environment reviewer is configured under the single-maintainer policy. Use organisation-required workflows from a separately controlled repository where available; a PR-controlled workflow alone cannot protect itself.
7. Enable dependency graph, Dependabot alerts and secret scanning/push protection where available. Review account MFA, collaborators, GitHub Apps, token scopes, deploy keys and workflow permissions privately. Do not copy credentials into audit evidence.
8. Verify effective rules via `GET /repos/{owner}/{repo}/rules/branches/main` and individual ruleset reads. Attempt a harmless rejected direct update in a controlled administration test; do not rewrite production history. Retain redacted setting evidence. Re-run the production-governance gate. Lack of access is failure, not approval.

The production job checks effective rules, mandatory status names, absence of active ruleset bypass actors and an owner-merged PR at its validated head. It deliberately fails closed if settings cannot be verified. This is defence in depth: an unprotected workflow can itself be replaced. Server-side checks remain essential; the account owner can still edit repository settings.

## Change classes

| Class | Examples | Mandatory review and tests |
|---|---|---|
| Low | CSS, static wording, non-security presentation | Baseline security and engineering/browser checks, documented maintainer PR review |
| Moderate | Parsers, state, charts, reports, imports, calculations | All baseline gates plus relevant numerical and workflow regression |
| High | Networking, runtime/dependencies, storage, security claims/controls, Actions, build/deploy | All gates, written impact review and documented maintainer security impact review; engineering review when results could change |

Risk labels cannot suppress a job. Broad CODEOWNERS coverage is intentional. Deleting a workflow, weakening a check or refreshing an approval digest requires explicit maintainer review even if another check passes. Approved network-capable sources require a specific diff review, documented rationale and explicit maintainer approval; automated hash refresh is forbidden.

## Developer workflow

Prerequisites are Python 3.13 with project/test dependencies, Node 22 with npm, and the Gitleaks CLI (CI pins 8.24.3). Run `python scripts/security_preflight.py` before committing/pushing. Optionally install the reversible hook using `git config core.hooksPath .githooks`. It runs confidentiality and claim checks, negative tests, JS validity and regression. Run Gitleaks on the working tree/history before sharing; CI is authoritative. Local hooks can be bypassed and are not evidence of server enforcement.

Use synthetic inputs only. Review the final diff for data, credentials, stale generated evidence and changed engineering semantics. Include source/version, change class, tests actually executed, network impact, dependency/licence changes, claim impact and limitations in the PR. Changing a claim's evidence requires semantic review and updating its digest after review, not automatic rebaselining.

## Automation boundaries

Human and AI changes follow identical PR/check/review rules. No automatic repair may push to main or relax a failed test. File processing, engineering methods, security, dependencies and release changes need documented maintainer review. No auto-merge is authorised by the live-regression issue. Emergency procedure must retain confidentiality checks and owner approval documented in the PR; there is no data-egress exception.

## Release and rollback

Before merge, review all findings and CI job conclusions, not only the aggregate check. No cancelled/skipped required job counts as success. Inspect synthetic screenshots and request logs, candidate artifact identity, dependency advisories and CodeQL alerts. Verify the settings above and owner-authorised final-head merge. Preserve the existing one-increment-per-merged-PR version policy and attribution.

The Pages workflow reruns engineering/browser checks on main, checks governance, builds fixed checked-in runtime assets and generates `release-integrity.json`. The manifest detects changed/mixed files; it is not a signature. The release job compares it with the tested manifest from the same workflow run before deployment. The live verifier rebuilds the expected revision and compares all fixed-file hashes. Post-deployment checks must also inspect `build.json`, actual UI identity, confidentiality assertions and browser errors. A deployment is not accepted merely because the Pages action succeeds.

On failure, stop further releases, retain non-sensitive evidence and investigate. Restore a known-good approved **Pages deployment** through the protected environment where possible; otherwise use a reviewed revert PR and the full gates. Never force-push main or relax tests. A rollback to older application code must retain current confidentiality and release controls. Confirm the actual restored SHA and re-run live verification. GitHub Pages cache and infrastructure are not under application control.

## Decisions outside application authority

An authorised organisation must decide permitted data classifications, client permissions, ownership of contributed code, open-source/licence acceptance, endpoint/browser controls, hosting/access controls and reviewer responsibilities. Personal public hosting is not equivalent to approved internal hosting. Enterprise-managed GitHub and controlled static hosting are options for a separately approved migration; none is performed here. No corporate approval is claimed.
