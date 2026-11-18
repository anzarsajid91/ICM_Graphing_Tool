# HydraBench v2 release assurance

Status on 2026-11-18: **acceptance review remains open**.

The latest tested product commit is `23f502cfa5f869063940687b9438bd275f068521`
on [PR #108](https://github.com/anzarsajid91/ICM_Graphing_Tool/pull/108).
All fourteen required checks and the separate CodeQL finding gate passed.
The [product workflow](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44264397252)
passed Chromium graph/assessment, survey, Detriment and release regression checks,
Firefox shell, expanded browser interactions and performance comparison.
QA checkpoint `e85fd257a6bbe49816ea7eaa8e174598fa589489` also passed all fourteen required checks and the CodeQL finding gate ([workflow](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44267762416)). The subsequent input-assurance patch requires its own final-head CI.
Earlier product `9f4d5b2` evidence remains bounded to the unchanged controls and
methods it exercised, as identified below.

The schematic and annual print report now assign project text through native DOM.
The SVG download serializes the SVG node. CodeQL reports no new alerts in the PR.
Cold and delayed mixed-file import checks preserve the valid sibling and collect
probe-local failure diagnostics. The workflow runner pin to Ubuntu 24.04 is
included in the v2 branch.

## Control results

[The control matrix](hydrabench-v2-control-results.csv) records 743 route/control
identities from the two synthetic CI artifacts, including 691 observed enabled.
The matrix currently reconciles 738 identities to passing assertions or executed
keyboard disclosure checks. Five entries are NOT APPLICABLE: empty transient download anchors created by the local export helper, not independent user controls. No button/link/disclosure identity remains BLOCKED. Disabled and repeated shared controls are included in the passing assertions. The matrix does
not infer failure from a missing activation, or acceptance from a recorded click.
The inventory covers buttons, links and disclosures. The separate [input matrix](hydrabench-v2-input-results.csv) reconciles 216 visible input/select/textarea route identities to PASS in bounded synthetic workflows. Conditional fields are additionally exercised by their populated workflow tests.

The repaired visual audit discovers canonical routes at runtime and supports
Chromium and Firefox. It checks all 22 routes at four desktop widths and uses
Enter and Space to verify visible disclosure state changes. The synthetic desktop
audit passed on the product candidate in both browsers. Runtime evidence contains
21 idle-state disclosure outcomes per browser. Focus layout, rail state where visible, inspector opening/closing, inert state and focus return were also asserted per route in both browsers. The follow-up audit executed 220 workspace transitions in each browser, checking the selected workspace, active navigation and visible destination from every canonical origin route.

## Engineering and security evidence

353 Python tests passed during the candidate review. A fresh focused run on 2026-11-18 passed 86 engineering tests, including independent friction-factor bisection benchmark values for full-flow pipe capacity, spill counts, support alignment, cumulative rainfall and Detriment. These results accompany JavaScript
unit and privacy suites. The hydraulic browser suite checked full-flow capacity,
two normal-depth solutions, comparison and local export. The spill calendar fixture
matched observed/modelled monthly counts and durations. No hydraulic equation,
unit conversion, validity rule or engineering threshold was changed by these fixes.
Exact equivalence to an external InfoWorks normal-depth result remains unverified.

CI npm and Python audits reported zero indexed vulnerabilities. The browser audit
retained two SheetJS matches with reviewed not-affected dispositions bound to the
vendor bytes and advisory contents. The history and staged secret scans passed.
These checks do not substitute for reviewing repository-wide open alert lists.

On 2026-11-18 the connected integration received HTTP 403 for the complete Code
Scanning and Secret Scanning lists. The Dependabot endpoint reported alerts
disabled. Those are unresolved security-review dependencies. No evidence supports
a claim that all existing repository alerts are clear.

## Issue and release disposition

- Issue #100 stays open. The candidate passes cold and deliberately delayed mixed
  imports. The historical live timeout has no confirmed application root cause.
  Review the deployed evidence before recording final disposition.
- Issue #106 stays open until the repaired workflow runs against an approved new
  production deployment. The previous scheduled failure was Chromium installation
  with Playwright 1.55.1 on Ubuntu 26.04, before application acceptance.
- PR #107 remains open. The candidate includes the runner and Home routing repairs
  and retains the rainfall-operation completion wait. Reconcile the superseded PR
  after the owner chooses the release path.

The baseline public build was verified at v1.071 / `5483d3f` with 106 published
resource hashes and Firefox shell acceptance. The candidate still requires owner
merge approval, the authenticated administrative release record, production CI,
and actual live acceptance. No merge or deployment is performed by this review.

About shortcuts, licence text navigation and source links were checked in both desktop browsers with 54 outcomes per browser. Source-link requests were fulfilled locally to verify exact destination, omitted referrer and isolated popup. Remote GitHub response availability is outside that assertion.

Additional desktop acceptance on 2026-11-18 passed network control outcomes (43 per browser), survey UI identity and review outcomes (85 per browser), native chart controls (41 per browser), import choosers (6 per browser), and About/licence/fixed source links (54 per browser). All used synthetic data and the tested product asset identity 9f4d5b2. Graph fixtures for Data/Comparison/Rating isolate native modebar wiring. Detriment controls use normal report imports and calculated charts. Survey injected ratings isolate UI handlers from engine correctness. Native operating-system directory interaction remains outside headless evidence.

Queue acceptance passed 40 outcomes per browser across ten routes. Prioritization, waiting-job cancellation, active-worker restart, ready-source identity/hash preservation and a fresh 202.65 L/s calculation were checked. The first real result was held at the test message boundary to keep waiting jobs deterministic.

## CI security impact review

The browser-interactions job now executes the focused control suites and the route audit in Chromium and Firefox against its own built artifact. The change adds test commands and synthetic artifact paths. Runner image, pinned action revisions, job permissions, branch/environment restrictions, mandatory check names, failure behavior, publication commands and retention period are unchanged. The existing source/claim gates still run before build and the request observers remain active. The focused licence navigation suite adds only the fixed built LICENSE.txt path to its own allowed-resource set. External source-link tests intercept only the two fixed GitHub destination forms locally and assert GET, empty body, absent referrer and isolated popup. No application runtime, engineering method or browser data destination changed in this assurance patch. This is AI-assisted source review within the authorised single-maintainer process, not independent human approval. Shared/source acceptance and the Detriment suite are also added to this same browser loop. Fresh final-head CI remains required.

Shared period and section acceptance passed 27 outcomes per browser across eleven routes. Synthetic date traces isolate the shared callback: both analysis bounds and change notifications are asserted. Every initially visible section control is exercised with content visibility and expanded-state checks. Source selection/removal passed 18 outcomes per browser: all/none selections, sixteen exact source removals, removed options and unchanged sibling identities/hashes. All imports use generated synthetic CSV/FDV/R content; inventory filenames do not imply use of original engineering files.

The follow-up checkpoint `0ae6d9d` exposed a new CodeQL high finding in the network test evidence writer (predictable temporary path). The writer now creates a unique private evidence directory; both desktop network suites passed again. The CodeQL finding gate subsequently passed on 979f371 and on product commit 23f502c, confirming the repair. Other repository-wide alert-list access still returns HTTP 403; Dependabot alerts remain disabled.

Expanded Detriment acceptance covers report mapping/preview keyboard disclosures, level calculation/list clearing, Inspect evidence, full and filtered spill exports, exact selected IDs and close/focus restoration. Clearing a list restores the prior view filter; the test asserts that existing behavior. Both desktop browsers are required in the CI control loop.

## Follow-up rendering and caption review

Normal-input desktop Firefox acceptance exposed a WebGL-unavailable overlay intercepting rainfall chart controls. Rainfall now follows the hydraulic trace policy: SVG for up to 8,000 display points and WebGL for larger traces only when a local capability probe succeeds; otherwise SVG. The probe is cached and its temporary GPU context is released. Plotted values, statistics, thresholds, downsampling limits and engineering inputs/results are unchanged. Native FDV option captions now enumerate their actual local Flow/Depth/Level/Velocity channels; source keys and channel preference remain unchanged. A Level caption regression failed before the repair and passed afterwards.

Security impact review against 979f371: runtime.release.js changes fixed channel caption construction and guards exclusion-removal redraw errors through the existing visible spill status. The matching undo handler now uses that same guard. Restoring a draft with a missing reason still fails validation, reports it visibly and finishes operation state without an unhandled rejection; no reason is invented and no invalid calculation is accepted. The existing worker addresses, fixed same-origin Plotly fetch, local Blob export helper and browser storage calls were inspected and remain unchanged. SC-03 (storage/retention) remains true within its existing scope and limitations; no storage access, retained data or retention policy changed. Its runtime evidence digest is updated after that semantic diff review. No security statement/status or supported exact-build claim is upgraded. The network source rationale records this review explicitly. The WebGL capability probe creates a local canvas only, does not process source values, and makes no request. No dependency, licence or data destination changed. This is AI-assisted review under the owner-authorised single-maintainer process; owner merge approval and fresh final-head checks remain required.

The data/process suite passed 17 outcomes (16 distinct matrix identities) in each desktop browser on the reviewed working tree after 979f371. It uses real local synthetic CSV/FDV/R imports, holds one real addFile reply for deterministic preview checks, and verifies actual clipboard bytes (Chromium read permission granted; Firefox paste). Custom selection/point events use existing normal handlers with synthetic event payloads. Independent expectations include 9.6 mm cumulative rainfall and one spill with 26 minutes of duration. Full Python rerun: 353 PASS; privacy: 28 PASS; all JavaScript unit suites PASS, including the new renderer fallback and FDV caption regressions. New exact-commit browser/security CI remains required.

Checkpoint 979f371 passed the CodeQL finding gate after the private evidence-directory fix. The browser-interactions job passed the expanded two-browser control loop. Its full browser-smoke and baseline-performance jobs were still running when the next product-fix checkpoint was prepared; this is not final-head release evidence. Repository-wide open alert lists remain inaccessible and Dependabot alerts disabled.

## Final control reconciliation checkpoint

The 743 original button/link/disclosure identities now reconcile to 738 PASS and five NOT APPLICABLE internal download carriers. The latter have no caption or independent action: the existing downloadBlob helper creates a local Blob link, clicks it automatically and removes it after one second. Captured report/Detriment surface metadata identifies downloadAnchor=true; network JSON/SVG exports call the same helper. Their initiating export buttons retain their actual content assertions. This classification does not waive an export check.

Real survey process acceptance passed eleven outcomes per browser, including all four complete-survey origins, independent 2016-interval trapezoidal continuity from 2017 FDV boundary samples, 60,480 m³ for each upstream and 120,960 m³ downstream, ratio 1, actual calculated Green selection, recorded review metadata/marker, unchanged calculation JSON and monthly disclosure. Native report controls passed ten outcomes per browser on an actual generated self-contained report: two zoom buttons, reset, autoscale, mouse pan/zoom, matching box/lasso selections containing the actual targeted sample, a valid PNG and notification dismissal. Exported trace coordinates are unchanged.

The complete synthetic browser regression passed on 23f502c, including cold/delayed mixed siblings, normal survey/spill/storage calculations, dense adaptive graphs, exports and workspace restoration. Its request observer checked 491 requests with zero violations. Browser-smoke now calls the report assertions on the actual generated report; Firefox separately reads that same synthetic artifact. The runner installs the same locked Firefox version already used by other jobs. The survey process suite joins the existing two-browser control loop. These QA-only changes preserve all action pins, permissions, runner images, branch/environment restrictions, mandatory checks, failure behavior and retention. New document metadata is recorded only by the synthetic QA helper; application runtime and destinations are unchanged in this QA checkpoint.

Input/conditional-state coverage remains under reconciliation. The existing empty-state inventory contains 216 visible input/select/textarea route identities; populated workflow tests additionally exercise conditional fields. Native operating-system directory dialog interaction remains outside headless evidence. No universal all-input/all-environment claim is made. Repository-wide Code/Secret Scanning access still returned HTTP 403 after the owner acknowledgement; Dependabot alerts are still disabled. Fresh CI on the final QA commit and those security-review dependencies remain required.


## Input assurance checkpoint

All 216 visible input/select/textarea identities now have outcome evidence in Chromium and Firefox on e85fd25. These assertions supplement the 738 passing button/link/disclosure identities and five internal download carriers. They do not extend to every possible operating system, browser or input value. New focused suites verify 54 shared input outcomes, eight hydraulic fields, thirteen appearance fields, seven verification fields, five schematic fields and two storage fields per browser. Expanded suites verify 30 shared section/period outcomes, 91 survey UI outcomes and 23 real survey process outcomes per browser. Detriment policy assertions cover exact tolerance boundaries and count/duration/flood policy distinctions.

Independent numeric expectations include Darcy–Weisbach friction bisection (~552.17 L/s for 600 mm diameter, slope 0.0073, roughness 1 mm and viscosity 1.1e-6 m²/s), a normal-depth slope residual at 250 L/s, a 1.46 m fall over 200 m giving slope 0.0073, 19.2 mm factored cumulative rainfall, delayed verification MAE 0/NSE 1, selected five-minute observed/model volumes 75/150 m³, a complete dry-weather baseline of 0.1 m³/s and a ten-minute storage episode requiring 24 m³ at target zero versus zero at target one. Equivalent 1 m and 1000 mm thresholds return identical storage. No established calculation method changed.

The new input suites join the existing two-browser CI loop. Only QA commands and synthetic evidence are added; permissions, action pins, runner images, environments, required check names, deployment restrictions and retention remain unchanged. Every added evidence writer uses a private temporary directory. No production source changed after 23f502c. Fresh final-head CI is required before release readiness.

Native cloud-desktop verification opened the Chromium colour picker and entered RGB 58/111/156 using the native controls; the actual input returned #3a6f9c. The colour's downstream plotted effect is independently asserted in the two-browser appearance suite. Screenshot: /workspace/shared/hydrabench-native-colour.jpg (local synthetic QA). Native showDirectoryPicker is BLOCKED in this cloud browser: both semantic activation and a foreground desktop click returned the browser/platform denial before opening a dialog. This is not a native folder-selection PASS. The generated nested-folder fallback is verified in both desktop browsers. Native operating-system directory selection still needs evidence from a supported interactive environment before an unrestricted every-dialog claim.

Repository-wide Code Scanning and Secret Scanning alert-list reads still return HTTP 403. Dependabot alerts are disabled; the authorised enable attempt also returned HTTP 403 for the integration and made no setting change. The owner's acknowledgement is not evidence that permissions or alerts changed. No claim that all existing security findings are resolved can be made. Issues #100/#106 and PR #107 retain the dispositions above; main was neither merged nor deployed.
