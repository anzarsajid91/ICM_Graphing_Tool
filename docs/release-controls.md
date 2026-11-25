# Required main-branch release controls

`SECURITY.md` requires server-side enforcement in addition to repository gates.
Verify the effective settings on GitHub before releasing. Changes to this
document do not configure branch rules or the Pages environment.

For `main`, require a pull request, resolved review conversations, an exact
up-to-date check result, blocked force pushes and deletion, and an empty bypass
list. The [single-maintainer policy](security-governance.md) requires owner
verification and the applicable GitHub review conditions. GitHub currently
requires zero ordinary approving reviews and dismisses stale voluntary
reviews. AI-assisted review must be identified as such.

Before authorising the merge, the maintainer applies the
[Dual-Expert Review Framework](dual-expert-review.md). Open the versioned review
dossier and confirm both independent specialist verdicts for the exact candidate
head, the evidence for closed findings and the disposition of any disagreement.
Missing verdicts, insufficient coverage of a release-critical workflow or an
unresolved blocker withhold release approval. This maintainer gate and the
server-side gates below are both required.

The active ruleset currently requires the following check contexts.

- `confidentiality`, `security`, `secrets`, `dependency-review`
- `verify`, `browser-smoke`, `browser-firefox-shell`, `browser-interactions`,
  `baseline-performance` (workflow: GitHub Pages Workbench)
- `analyze (javascript-typescript)`, `analyze (python)`
- `test (ubuntu-latest, 3.12)`, `test (windows-latest, 3.12)`
- `security-release / security`

Check GitHub's actual check-run names and source integrations on the exact
reviewed head. Recheck the CodeQL gate, active ruleset identities and complete
bypass lists. The `pages-release` environment permits `main` only and disables
administrator bypass. Keep confidentiality and the other release gates active.

After the protected merge, post the [authenticated owner release record](security-release-acknowledgement.md)
for the actual reviewed head and merged SHA. The production workflow verifies
that record and the same workflow's tested artifact before Pages publishes it.
Verify the deployed build and footer against the merged SHA and rerun the live
regression and confidentiality checks. Employer approval for the hosting
service remains a separate decision.
