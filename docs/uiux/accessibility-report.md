# Accessibility and responsive review

This is an evidence-bounded WCAG 2.2 AA review, not certification.

Verified browser contracts: explicit navigation names/current route, secondary
ArrowLeft/Right/Home/End selection with focus retained, offscreen rail/closed
Inspector inert, overlay Inspector close focus, Escape return, source-picker
Escape return, analysis-dialog focus containment/return, detriment drawer close
return, focus outlines, reduced-motion pill suppression and governed token
contrast. `uiux-contracts.mjs` passed on the deployed candidate. Independent cloud
review verified keyboard route changes, Back, Inspector open/Escape and focus
restoration at 1363×936.

Contrast assertions require primary/secondary text ≥4.5:1 and control outlines /
focus ≥3:1 on both main and soft surfaces. Secondary text was darkened from the
provisional #777A78 to #626660. Control borders were adjusted to #858D85 after
measuring the soft surface. This is a token-level check, not a claim that every
legacy chart/SVG annotation or semantic tint satisfies the same ratio.

Network comparison cells now provide explicit Green/Amber/Red agreement text,
retaining exact values and existing classifications. Survey summaries and monthly
review retain status words, numerical labels and reviewed versus calculated
outcomes. Unknown/partial/stale states remain distinct. Engineering-series colours
are unchanged. All chart/native control and report choices remain available.

The route harness captured all 17 pages at 1920, 1440, 1280, 1024, 768 and 390 px.
Loaded workflows also cover 1440/1024 assignment, 390 detriment/About, 780 survey,
820 network and 1440/780 report actions. Mobile navigation remains an overlay;
selected secondary tabs scroll into view. Wide engineering tables retain local
horizontal scrolling. Native forms preserve their browser semantics. No promise
is made of desktop analysis parity on a phone.

Known gaps: exhaustive screen-reader traversal; physical touch and text zoom/high
contrast across every loaded state; all chart modebar accessible names; every
legacy colour annotation; every conditional dialog and row action combination.
Chromium-produced PDF files are not tagged PDFs (verified `pdfinfo`), so accessible
PDF conformance is not claimed. The token and keyboard tests do not close these
gaps. These require a dedicated acceptance pass before an unrestricted AA claim.

Asset analysis now uses native modal background isolation and a true backdrop, with cancellation and route exit releasing it. The browser suite explicitly checks :modal, outside-pointer focus isolation and route-close. Final branch checks, rather than earlier screenshots, are authoritative for this later change. The empty schematic instruction is split into two lines and its SVG bounds tested at 390 px.
