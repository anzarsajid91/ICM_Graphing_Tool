# CodeQL applicability and correction review — 2026-10-18

The CodeQL analysis jobs passed, but the actual PR alert view exposed 26 open
findings: High findings in application rendering and synthetic test utilities,
and Medium origin-check findings in dedicated workers. Successful analysis is
not evidence that alerts are absent. Merge remains conditional on the enforced
CodeQL alert rule and the final source's scan results. No alert is bulk-dismissed
and no query, severity threshold or path coverage is disabled.

The four schematic HTML/SVG findings were traced through the global `esc` helper.
It encodes ampersand, both angle brackets and both quote characters. Dynamic
labels/comments/scenarios use this helper; geometry is validated numeric input
and presentation types/colors are constrained enumerations. The separate AI
review found no demonstrated exploit in these cited sinks. For explicit local
analysis, the alias is replaced by a local five-character encoder with identical
output. Browser regression injects a hostile label, comment and scenario and
checks canvas, local SVG and local HTML output, with request observation enabled.

The report-image title finding used regex tag removal before `setAttribute` on
the non-executable alt attribute. Tag stripping was unnecessary and is removed;
the title remains plain attribute text. This changes accessibility text only.
Three test-only table-header normalizers now obtain text from an inert template
fragment instead of presenting regex stripping as an HTML sanitizer.

Predictable test evidence filenames were corrected by writing inside a newly
created private random directory with exclusive creation and mode 0600. Repeated
evidence writes retain earlier snapshots rather than following/clobbering a
pre-existing destination. Artifact collection already recurses through the
evidence roots. A regression checks unique paths, retained prior contents and
restricted permissions. A test fixture stat/read pair now uses a single open
file descriptor. These utilities handle synthetic fixtures only and are excluded
from deployed builds.

The two Medium worker-origin findings concern dedicated Worker message handlers,
not window message handlers exposed to arbitrary browsing contexts. Their parent
creates fixed same-origin worker scripts; engineering payloads stay in the local
worker boundary. No blanket origin-check exemption is added. This is a bounded
source applicability assessment, not a claim of isolation from compromised
same-origin code, malicious extensions or endpoint compromise.

The explicit source review rationales in network-source-approvals.json cover
only the escaping/alt-text diff and the existing CSV serializer changes. Network
destinations and hydraulic calculations are unchanged. No automatic approval
refresh or engineering-data egress exception is authorised.
