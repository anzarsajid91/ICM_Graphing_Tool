# Additional references — 11 October 2026

Reviewed the supplied Brightdesk JPEG and both recordings directly from the attached files. These supplement the original Threads reference; they do not replace the completed design system or engineering workflows. No original design files or source code were available.

## Observed product UI

| Reference | Representative observations | Useful adaptation |
|---|---|---|
| Brightdesk sidebar/metrics JPEG | Very pale sidebar; restrained outline icons; rounded grey selected row; search field; indented report entries with a fine guide; independent near-white metric/chart blocks with subtle outlines and contextual footers | Quieter tonal navigation selection; clear independent panel geometry; consistent typography and numbers |
| Recording 13:56:07 (26.3 seconds) | Compact dark dashboard strip with separate task, status and activity blocks above a dense table; block-specific actions and subdued status/progress treatments, visible at the opening, quarter and three-quarter frames | Preserve separate engineering evidence/configuration blocks and compact tables within Hydra Bench's existing warm-neutral palette |
| Recording 14:00:14 (11.6 seconds) | Multiple navigation variants: floating rounded icon rail, expanded labelled/search navigation, grouped entries, dual-panel and compact options; small account popover visible near the middle | Inset rounded desktop rail; preserve existing labelled/icon-only modes, route selection and keyboard behaviour |

Black letterboxing, full-screen player controls and the final iOS Control Centre are recording/player UI and were excluded. The recordings show variants; they do not establish a precise sidebar transition duration or responsive breakpoint. Motion timing and layout adaptation remain implementation choices, tested against the application.

## Already included versus additional changes

The candidate already had warm-neutral surfaces, near-white cards, restrained borders/shadows, outline navigation icons, collapse/focus modes, source search, compact engineering tables, separated evidence panels and reduced-motion support. These remain.

Additional refinements inset the desktop sidebar by 12 px while preserving its grid allocation and existing responsive/overlay behaviour; use a calm grey selection surface; and give standalone evidence blocks the shared 16 px card radius. Charts retain their existing containers, coordinates and interaction contracts. Nested controls and table cells are not turned into additional cards.

Inter 4.1 is now bundled locally with its SIL Open Font License. The requested stack is `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; body 400, UI labels 500, headings/buttons 600. CSS uppercase treatments are removed; engineering acronyms and source identifiers retain their meaning. Large headings use approximately −1.5% tracking; technical numbers use tabular figures. Local HTML/print and schematic exports embed font bytes on explicit export, rather than relying on a remote font service or adding a large eager script payload.

Medical/financial features, artificial progress, account menus, billing, notifications and decorative counters from the examples are not product requirements. Their visual structures informed the existing engineering UI only.

## Verification status

The interruption-point candidate `e45b4af4fdb06ca7931bdc2ebc907e7960ada2a9` passed full review, deployed browser acceptance and its performance comparison. That evidence predates these refinements and is not evidence that this new candidate passed. New checks include actual Inter face loading at 400/500/600, portable offline report rendering, fixed-resource font request/caching/retry contracts and the existing all-route, layout, numerical and privacy suites. Local rendered/functional/font verification is recorded in the implementation ledger. Remote candidate CI/deployment remains pending because publication was blocked by automatic approval review.
