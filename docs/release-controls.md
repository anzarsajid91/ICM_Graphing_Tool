# Required main-branch release controls

`SECURITY.md` requires server-side enforcement in addition to repository gates.
The connected GitHub API used for source/PR operations does not expose a branch
protection administration action. These settings require an administrator with
that capability; committing this document does **not** configure them.

For `main`, require a pull request and at least one independent approving review,
dismiss stale approvals, require conversation resolution and up-to-date status
checks, block force pushes/deletion and restrict bypass permissions. Protect
policy, source approval inventory, confidentiality guard and workflows with
maintainer review. Do not invent a reviewer or self-approve the author's PR.

Required check contexts from the current workflows:

- `confidentiality` (workflow: Data confidentiality)
- `verify`, `browser-smoke`, `browser-firefox-shell`, `browser-interactions`,
  `baseline-performance` (workflow: GitHub Pages Workbench)

Check GitHub's actual check-run names before saving rules; workflow display names
and check contexts are different concepts. Restrict rules to the actual `main`
branch and verify the returned protection/ruleset after configuration. Keep any
necessary emergency bypass narrow and auditable; never disable confidentiality.

The current deployment workflow depends on all browser/performance gates before
building/deploying main. A PR green at one head must be rechecked after head changes.
The deployed footer/build SHA must match the merged revision. Repository policies
and CI do not substitute for employer approval to use a public hosting service.
