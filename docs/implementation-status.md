# Current implementation status — 18 September 2026

**Active branch:** `feat/engineering-correctness-phase1`  
**Baseline main:** `373ffc678d6926ecb4f313408fb3b8917a6b162a`  
**Pull request:** #4  
**Release state:** implemented; automated PR verification in progress; representative real-export UAT remains a separate gate.

## Correctness tranche

| Backlog item | Current state | Evidence / remaining gate |
|---|---|---|
| BK-001 authoritative units | implemented, automated verification pending | generic CSV unit detection/conversion; L/s and Ml/d fixtures; unresolved dimensional operations blocked |
| BK-002 missing rainfall != dry | implemented, automated verification pending | DWF uses complete rainfall support only; missing support becomes unknown |
| BK-003 actual-support rainfall | implemented, automated verification pending | shared support-aware rainfall intervals drive cumulative/event calculations |
| BK-004 deterministic invalidation | implemented for source reset; wider action graph remains P2 | source clear removes exclusions and derived state; mapping/action consolidation remains |
| BK-005 storage coverage/unit gating | implemented, automated verification pending | volume blocks carry requested/valid/gap/excluded/uncovered support; headline storage withheld if partial |
| BK-006 common validity architecture | partially implemented | coverage/status now propagated in rainfall/DWF/storage; full cross-workflow validity-state unification remains |
| BK-007 representative engineering corpus | blocked on representative data/domain sign-off | synthetic/analytic tests are not a substitute for actual ICM/vendor exports |

## Product path
GitHub Pages remains the primary zero-install product. The shared Python engine remains authoritative. No rewrite or removal of the legacy entry point has been performed.

## Release gates
1. Both Python CI jobs must pass on Ubuntu and Windows.
2. Pages verify + Chromium browser-smoke must pass against the exact staged artifact.
3. Main remains unchanged until those gates pass.
4. Representative anonymised ICM/HYD, FDV and rainfall exports must still be reconciled before claiming field validation/production assurance.
