# Security governance and contributor procedure

Status on 2026-10-17: **Not Enforced** at GitHub. `main` returned `protected: false`; the rulesets collection was empty. The GitHub connector cannot configure administration. The signed-in browser can access administration: Dependency graph was enabled and saved, but saving the prepared production ruleset requires account reauthentication. No active ruleset is verified. Files in this PR are proposed controls pending independent review. No coding agent may approve this PR, approve its own security-control changes or update a network-source approval merely to clear a failure.

## Administrator configuration (required before release)

1. In Settings → Rules → Rulesets, create an **Active branch ruleset**, target `refs/heads/main`. Include no bypass actors, including administrators or apps. Block deletion and force pushes.
2. Require pull requests, at least one approving independent reviewer, code-owner review, dismissal of stale approvals, approval of the most recent push and resolution of review conversations. Require branch to be up to date.
3. Require the exact check contexts emitted by a successful PR run, associated with GitHub Actions: `confidentiality`, `security`, `secrets`, `dependency-review`, `verify`, `browser-smoke`, `browser-firefox-shell`, `browser-interactions`, `baseline-performance`, `analyze (javascript-typescript)`, `analyze (python)`. Confirm actual names from the checks API before saving; display names can change. Do not select skipped jobs or deployment-only jobs.
4. Add an authorised independent maintainer with write access to CODEOWNERS. The existing owner entry identifies responsibility but **cannot supply independent approval to an owner-authored PR**. Do not invent a reviewer account.
5. Enable CodeQL/code-scanning merge protection for unresolved high/critical security alerts where available. A successful CodeQL analysis job means the analysis ran, not that there are no findings. Review the findings before release.
6. Protect environment `pages-release` with required independent reviewers, prevent self-review and restrict deployment branches to protected `main`. Disable administrator bypass where the plan supports it. Use organisation-required workflows from a separately controlled repository where available; a PR-controlled workflow alone cannot protect itself.
7. Enable dependency graph, Dependabot alerts and secret scanning/push protection where available. Review account MFA, collaborators, GitHub Apps, token scopes, deploy keys and workflow permissions privately. Do not copy credentials into audit evidence.
8. Verify effective rules via `GET /repos/{owner}/{repo}/rules/branches/main` and individual ruleset reads. Attempt a harmless rejected direct update in a controlled administration test; do not rewrite production history. Retain redacted setting evidence. Re-run the production-governance gate. Lack of access is failure, not approval.

The production job checks effective rules, mandatory status names, absence of active ruleset bypass actors and independent approval of the merged PR's final head. It deliberately fails closed if settings cannot be verified. This is defence in depth: an unprotected workflow can itself be replaced. Server-side review remains essential.

## Change classes

| Class | Examples | Mandatory review and tests |
|---|---|---|
| Low | CSS, static wording, non-security presentation | Baseline security and engineering/browser checks, independent PR review |
| Moderate | Parsers, state, charts, reports, imports, calculations | All baseline gates plus relevant numerical and workflow regression |
| High | Networking, runtime/dependencies, storage, security claims/controls, Actions, build/deploy | All gates, written impact review and independent authorised security review; engineering review when results could change |

Risk labels cannot suppress a job. Broad CODEOWNERS coverage is intentional. Deleting a workflow, weakening a check or refreshing an approval digest requires independent review even if another check passes. Approved network-capable sources require a specific diff review, documented rationale and explicit maintainer approval; automated hash refresh is forbidden.

## Developer workflow

Prerequisites are Python 3.13 with project/test dependencies, Node 22 with npm, and the Gitleaks CLI (CI pins 8.24.3). Run `python scripts/security_preflight.py` before committing/pushing. Optionally install the reversible hook using `git config core.hooksPath .githooks`. It runs confidentiality and claim checks, negative tests, JS validity and regression. Run Gitleaks on the working tree/history before sharing; CI is authoritative. Local hooks can be bypassed and are not evidence of server enforcement.

Use synthetic inputs only. Review the final diff for data, credentials, stale generated evidence and changed engineering semantics. Include source/version, change class, tests actually executed, network impact, dependency/licence changes, claim impact and limitations in the PR. Changing a claim's evidence requires semantic review and updating its digest after review, not automatic rebaselining.

## Automation boundaries

Human and AI changes follow identical PR/check/review rules. No automatic repair may push to main or relax a failed test. File processing, engineering methods, security, dependencies and release changes need independent relevant review. No auto-merge is authorised by the live-regression issue. Emergency procedure must retain confidentiality checks and independent documented approval; there is no data-egress exception.

## Release and rollback

Before merge, review all findings and CI job conclusions, not only the aggregate check. No cancelled/skipped required job counts as success. Inspect synthetic screenshots and request logs, candidate artifact identity, dependency advisories and CodeQL alerts. Verify the settings above and final-head approval. Preserve the existing one-increment-per-merged-PR version policy and attribution.

The Pages workflow reruns engineering/browser checks on main, checks governance, builds fixed checked-in runtime assets and generates `release-integrity.json`. The manifest detects changed/mixed files; it is not a signature. The release job compares it with the tested manifest from the same workflow run before deployment. The live verifier rebuilds the expected revision and compares all fixed-file hashes. Post-deployment checks must also inspect `build.json`, actual UI identity, confidentiality assertions and browser errors. A deployment is not accepted merely because the Pages action succeeds.

On failure, stop further releases, retain non-sensitive evidence and investigate. Restore a known-good approved **Pages deployment** through the protected environment where possible; otherwise use a reviewed revert PR and the full gates. Never force-push main or relax tests. A rollback to older application code must retain current confidentiality and release controls. Confirm the actual restored SHA and re-run live verification. GitHub Pages cache and infrastructure are not under application control.

## Decisions outside application authority

An authorised organisation must decide permitted data classifications, client permissions, ownership of contributed code, open-source/licence acceptance, endpoint/browser controls, hosting/access controls and reviewer responsibilities. Personal public hosting is not equivalent to approved internal hosting. Enterprise-managed GitHub and controlled static hosting are options for a separately approved migration; none is performed here. No corporate approval is claimed.
