# October rainfall audit corrections

The v1.065 audit identified four rainfall correctness defects. This change fixes
their causes in the authoritative browser-local Python engine and the UI adapter;
it does not change spill counting, storage equations or detriment criteria.

| Case | Correct release behaviour | Regression |
|---|---|---|
| Twelve 1 mm / 5-minute increments | 12 mm, equal to twelve 12 mm/h values; source semantics passed to cumulative and cross-gauge calculations | Python and browser audit tests |
| Same storm with 5 mm/h minimum, 6-minute intensity streak, 5 mm depth, 60-minute event | One event, 12 mm/h peak, 12 mm depth for both encodings | Python and browser audit tests |
| Negative rainfall | Raw value retained; interval invalid, not confirmed zero; coverage/status and DWF eligibility reflect invalid support | Python accumulation/daily/DWF tests and browser cumulative test |
| 12 mm/h storm selected 00:02–00:08 on 5-minute native support | 00:02–00:08, six minutes, 1.2 mm; identical for interval depths | Python and browser tests; midnight/exclusion tests |

Event intensity is derived from supported depth: `i = 3600 d / Δt` in mm/h,
with depth `d` in mm and support `Δt` in seconds. Construct native support before
intersecting the half-open assessment window. Exclusion/window splits prorate depth
without changing the original physical intensity. Missing, invalid and excluded
support terminates a rainfall event.

The cumulative plot is explicitly a **raw-source total**. Assessment exclusions
are included there; assessment workflows apply their scoped exclusions separately.
Unknown semantics blocks that source with a visible explanation. Interpretation
changes invalidate in-flight cumulative results and automatically refresh the plot.
Professional Flow Survey uses its existing canonical rainfall-intensity adapter
for both the associated gauge and network sources. Existing association-driven
survey conversion is preserved.

Cumulative rainfall uses the shared `plotConfig` with wheel zoom disabled. Its
browser regression also exercises workspace interpretation restoration and three
import/remove cycles. Existing release tests retain cancellation/recovery,
PNG/CSV/HTML/PDF, network, detriment and synthetic reference acceptance.

The spill-calendar test now records diagnostics from its failed isolated probe
before closing it. This improves evidence for the intermittent readiness timeout;
it is not a claim that the historical timing failure has been resolved. Timeouts
and release gates have not been relaxed.

`requirements-ledger.md` is the current coverage matrix. Real-export reconciliation,
maximum-scale endurance and independently reviewed engineering sign-off remain
separate work; their absence must not be hidden by a green synthetic test suite.

Run the full Python suite, JavaScript unit suites, source/privacy gates and all
Pages release jobs before merging. Then check the deployed `build.json` SHA and
version and rerun the synthetic rainfall browser check against the live URL.
