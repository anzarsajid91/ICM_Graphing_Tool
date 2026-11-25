# Dual-Expert Review Framework

Every Hydra Bench release requires an engineering verdict and a usability
verdict. Evaluate whether each workflow helps a wastewater modeller reach a
reliable, comprehensible engineering decision. A successful calculation or
test establishes only the behaviour it exercised.

## Roles and independence

| Role | Accountable for |
| --- | --- |
| A · Principal wastewater hydraulic modelling reviewer | Verify the engineering purpose, methodology, numerical behaviour, units, time support, applicability, uncertainty, source lineage and downstream decision risk. Independently calculate or trace meaningful cases. |
| B · Senior engineering-product design reviewer | Verify whether novice and experienced users can complete the intended workflow and correctly interpret its outcome. Inspect navigation, feedback, keyboard operation, responsiveness, visual encoding and published artefacts. |
| Maintainer | Establish scope and candidate identity, preserve review independence, reconcile decisions, check existing release gates and authorise the protected merge. |

Instantiate the specialists in separate contexts. Share the same workspaces,
build identity, synthetic or approved fixture catalogue and engineering outcomes
for evaluation. Withhold the other specialist's conclusions until each has
submitted a dated, immutable first-pass record. Preserve a digest or immutable
revision of each record before exchanging it. Identify AI-assisted reviewers
and any human reviewers explicitly. Two AI specialists do not constitute
independent human approval, regulator sign-off or organisational approval.

If separate review contexts are unavailable, document the limitation and mark
the independent gate incomplete. An individual may do useful preliminary
work, with any findings attributed to that individual. The release requires
both independent specialist verdicts and the existing maintainer authorisation.

## Review sequence

1. **Identify the target.** Record release, source SHA, artifact identity, review
   date, public or local URL, browser versions and relevant tools. Confirm the
   live build identifier and matching source. Review the production baseline
   and the exact release candidate where a candidate exists.
2. **Exercise real tasks.** Review Home, Data / Time Series, Spills, Network
   Schematic and results, Flow Survey, Verification, Hydraulic Calculations,
   Detriment, Reports, About / IT Security, and additional current workspaces.
   Cover import, persisted state, cross-workspace handoff, export, failure
   recovery, confidentiality, responsiveness and accessibility. Include
   ordinary, complex and invalid cases. Use depth proportional to impact and
   list untested features explicitly. A changed or release-critical workflow
   needs direct outcome evidence.
3. **Check engineering outcomes.** State the engineering question, fixture,
   independently derived expected result and tolerance before evaluating the
   observed result. Check units and datum, missing and duplicate values, time
   support, provenance and applicability. For schematics, inspect the same
   representative network in each view and in its exported artefact. Check
   source identity and ordered reach connectivity, asset significance, branches,
   uncertain directions, labels and legibility at report scale.
4. **Check the experience.** Record start state and actions, task completion and
   interpretation. Inspect actual rendered screens and outputs in desktop
   Chromium and Firefox, including supported window sizes, zoom and keyboard
   operation. Record waiting, recovery and accessibility observations, and
   identify which claims need human or assistive-technology testing.
5. **Preserve independent results.** Each specialist submits a workspace matrix,
   findings, evidence, limitations and a verdict. Label each observation as
   verified, source-supported hypothesis, or untested/blocked. Passing CI,
   historical reports and a control's presence are inputs to the review.
   The new review must supply current behavioural evidence.
6. **Cross-review and reconcile.** Each reviewer checks the other record and
   identifies agreement, challenge, dependencies and evidence gaps. Retest
   material disputes where feasible. Retain a disagreement and its release
   implication where the evidence does not justify agreement. The maintainer
   consolidates distinct findings and records both reviewers' final decisions.
7. **Reassess the fixed candidate.** Reproduce each release-blocking case on the
   final candidate and recheck linked workflows. Both specialists independently
   reassess evidence and issue exact-head verdicts. A changed candidate
   invalidates the prior verdicts until both reviewers revalidate the changed
   scope and confirm the final head. Apply the normal protected release
   process and verify the live build and artifact afterward.

## Findings and acceptance

Use unique stable IDs. Keep each finding linked to originating reviewers and
evidence. Record workspace, classification (defect, usability improvement,
engineering enhancement or optional opportunity), severity, priority, status,
engineering or usability impact, steps, observed and expected behaviour, known
cause, corrective instructions, dependencies, regression risks, measurable
acceptance conditions and technical and visual verification. Cite the actual
fixture, build and evidence file. Keep unsupported causes as hypotheses.

- **P0** blocks a release. Examples include confidentiality failures, unsafe
  engineering decisions, corruption, irreproducible critical results and a
  broken core workflow with no defensible recovery.
- **P1** needs early resolution. A P1 can also block a release when the stated
  scope depends on the affected workflow or severity warrants it.
- **P2** improves a supported workflow with bounded impact. **P3** records an
  optional opportunity. Priority does not reduce mandatory security severity,
  engineering correctness or release obligations.

Each specialist issues **approve**, **withhold** or **incomplete**, with a
candidate SHA and evidence references. Release requires both approvals, all
blocking findings resolved with reproducible checks, sufficient coverage of
release-critical flows, and the existing security, engineering, regression,
protected-main, owner and production verification gates. For non-blocking
deferrals, record owner, risk, rationale and next review. An unresolved dispute
about safety, correctness or a release-critical outcome withholds approval.

Before merge, record both verdicts in the release PR against the final head and
link the dossier. This PR record can refer to its own exact final head without
embedding that head in a self-referential committed file. Keep original first
passes and cross-review decisions in the dossier. Do not imply that a checklist,
an automated test or a PR comment authenticates an expert's identity. The
maintainer must verify the records. See [Release controls](release-controls.md)
and [Security governance](security-governance.md).

## Evidence and continuity

Keep a versioned dossier in [the review history](reviews/README.md). Store
synthetic fixtures, reproducible commands and compact synthetic evidence or
reference durable artefacts with their hashes and retention constraints. Keep
engineering data browser-local under [SECURITY.md](../SECURITY.md). Use synthetic
data for shared evidence. Route suspected confidentiality or security issues
through the existing private channel with appropriately minimised evidence.

The minimum dossier includes a progress tracker, two independent first passes,
cross-review records, an evidence index, an implementation-ready findings
register, and verdicts and release history. Include branch and source identities,
exact completed steps, open work, coverage gaps and the next action. After an
interruption, verify the Git state, live revision, stored evidence and CI
before repeating work. All application repairs proceed through a separate
implementation task and review.
