# Highest-priority repository rule: engineering data stays local

Read and obey [SECURITY.md](SECURITY.md) before any change. This rule applies to
every contributor, coding agent, commit, pull request and release, on every branch.

**MUST NOT transmit imported engineering data or information derived from it out
of the browser over a network. No exceptions for debugging, analytics, AI,
performance, convenience, support or deadlines.** Protected information includes
file contents, filenames, paths, asset/client identifiers, timestamps, values,
units, thresholds, mappings, exclusions, comments, fingerprints, calculation
inputs, results, graphs, reports and error messages containing that information.

Only fixed application-resource downloads are permitted. They must not carry
protected information in their URL, query, fragment, headers, body or referrer.
Browser workers and local browser storage are permitted. Explicit local file
exports, local printing and explicit copy-to-clipboard are permitted; remote
uploads, cloud export and automatic sharing are not.

Before committing:

1. Review data handling and every affected network-capable code path.
2. Run `python scripts/verify_data_confidentiality.py`.
3. Run `python -m unittest discover -s tests/privacy -v` and
   `node web/tests/privacy-network-unit.mjs`.
4. Keep confidentiality checks enabled in builds and CI. Never silence a failure,
   add `continue-on-error`, auto-rebaseline an approval, or claim an unrun test.
5. A changed approved network-capable file requires a fresh source review and an
   explicit rationale in `security/network-source-approvals.json`. An approval is
   permission for fixed resource downloads only, never permission to upload data.

If a proposed feature conflicts with the rule, redesign it to run locally or stop
that feature. Do not weaken the rule or its checks to complete the change.
Use synthetic data only in committed fixtures, CI evidence and shared debugging.

Release browser tests must retain the request assertions in
`web/tests/privacy-network.mjs`. Passing CI is evidence for tested code and flows,
not a universal security guarantee. Maintainer-controlled GitHub required checks
and protected branches are additionally needed to prevent bypassing merge checks.
