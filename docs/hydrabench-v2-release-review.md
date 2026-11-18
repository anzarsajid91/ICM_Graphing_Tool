# HydraBench 2.0 release review

The baseline remains the [original development inventory](hydrabench-v2-baseline.md).
Development is consolidated in [draft PR #108](https://github.com/anzarsajid91/ICM_Graphing_Tool/pull/108)
on `feature/hydrabench-v2-preview`. Production at inspection was
`5483d3fc369ea7ff63ecafb95082fee7a80dc6f1`. Release identity and acceptance
apply to the final candidate commit.

| Original workstream | Preview state and remaining evidence |
| --- | --- |
| Home, routes, branding | Home shortcuts, approved hydraulic mark, motion fallback, workspace order and legacy route alias exercised. Creator and licensing changes need exact-candidate visual and browser confirmation. |
| Data and import | Import Review and explicit application of assignments implemented. Mixed-file failure isolation has browser coverage. The intermittent live timeout in issue #100 still needs representative reproduction or documented disposition. |
| Network and spill assessments | Standalone schematic retains manual editing, annual scenario evidence, spill calculations, drill-down and local exports. Synthetic native CSV import, topology and conduit handoff exercised. Representative native ICM file mapping and dense layouts remain acceptance items. |
| Shared evidence | Confirmed monitor relationships, weekly Flow Survey, current Verification decisions and the three Detriment themes exercised. Project-wide historical evidence, full provenance and invalidation coverage remain open. |
| Verification | Overview, event metrics and graph handoff, reversible engineer decisions and reporting are implemented. Integrated restored-state and source-change review remains open. |
| Hydraulic calculations | Full-bore and turbulent normal-depth design trials exercised against independent references. Numeric agreement with a specific ICM build requires comparable ICM capacity output. |
| UX and persistence | All 22 routes inspected at four widths on the prior schematic preview. Complete the primary/advanced split for Spills, Verification and Detriment and review populated and restored states. |
| Security and release | Prior preview checks for confidentiality, static analysis, dependency review and browser regressions passed. Repeat the full candidate gate, evidence review and performance comparison before the owner authorises any production merge. |

## Licensing and ownership review

At inspection the branch had no top-level project licence or licence declaration
in package metadata, and no history of a root LICENSE, LICENSE.md or COPYING
was found on the inspected refs. Recorded commit author labels were Anzar Sajid
and anzarsajid91. Author labels are attribution evidence. They do not establish
a complete chain of title. The creator credit follows the owner's declaration.

The proposed scope is original HydraBench software under AGPL-3.0-only. Existing
third-party notices and the pinned browser dependency tree stay intact. The
[dependency record](browser-dependencies.md) points to Pyodide's upstream
MPL-covered source. The companion-repository assessment records reuse of
engineering behaviour. The reviewed history and notices did not identify
a specific conflicting third-party source grant in the files newly marked
with SPDX headers. Figures, datasets and third-party materials retain their
applicable rights and terms. GitHub's default-branch licence badge can only be
confirmed after an authorised production merge.

The owner should flag any employer agreement, assignment or other applicable
contract that restricts licensing or publication of specific material. The
repository review found no affirmative evidence of such a restriction. It
could not inspect private agreements. Any concrete rights concern should be
resolved for the affected material before authorising the production release.

The Pages build serves the complete licence as `LICENSE.txt`, and its source link uses only
the GitHub repository slug and build SHA. User-activated links suppress
referrers. No new application data-processing or storage path was added.
