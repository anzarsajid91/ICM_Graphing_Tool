# Unified design system

Status: foundation and shell implemented; rendered candidate acceptance pending.

## Foundation

Warm canvas #F0F0EE; surface #FCFCFC; elevated surface #FFFFFF;
text #202221; secondary text #626660 (darkened from the reference proposal for
small-text contrast); subtle border #E4E5E3; control border #8A918A (controls
must remain distinguishable). Primary action charcoal; restrained teal only for
focus/link/selection context. Existing observed red, model purple-blue, rainfall,
threshold and semantic RAG colours are retained. No external fonts or icon loads.
System sans-serif with Inter only when already installed. Tabular numerals for
engineering results; units never hidden. 13–14 px body; 12 px supporting text;
20–22 px page title; 16–18 px section headings. Spacing 4/8/12/16/24/32 px.
Surface radii 16 px; inputs/buttons 10 px; pills 999 px. Thin neutral borders and
one restrained elevation style. Status remains text + semantic colour, never
colour alone. Warning/error contrast takes precedence over subtle styling.

## Component contracts

| Family | Treatment | States and access |
|---|---|---|
| Primary navigation | Light rail; local stroke icons; calm selected surface | Current page + accessible name; collapsed icons retain names |
| Secondary navigation | Scrollable pill strip; white sliding active indicator | Existing button/route contract; arrows/Home/End, focus survives rebuild |
| Primary button | Charcoal, white text, 10 px radius | Immediate action; hover/focus/disabled/busy; no delayed handler |
| Secondary / quiet button | White or transparent; consistent geometry | Focus and selected/pressed visible; no hidden actions |
| Icon buttons | 28–36 px footprint; named local icon | Title and accessible name; keyboard click |
| Inputs/selects | Near-white, visible outline, consistent spacing | Native semantics; error/busy/disabled retain meaning |
| Checkbox/radio | Native, named, aligned label | Space and pointer; no new toggle semantics |
| Date/year/time | Native fields; compact small option sets only segmented | Many years/scenarios stay dropdown/multiselect |
| Metrics | Compact white tile, label then exact value | Never count through inaccurate values; status retained |
| Panels/disclosures | One intentional surface boundary; neutral headings | Existing collapse state, expanded semantics and all content retained |
| Tables | Compact rows, tabular numerals, quiet sticky header | Horizontal scroll for technical width; no units or IDs truncated |
| Status/validation | Small semantic pill/inline message | Current/Stale/Partial/Unknown/Blocked/Error all distinct |
| Popover/menu | White surface, fine border, restrained shadow | Escape close and focus return; no clipping behind panels |
| Inspector/drawer | Same surface/control rules as main content | Focus safety; no redraw/recalculation on cosmetic selection |
| Dialog | Clear labelled heading, close, contained overflow | Native dialog where already used; focus/restoration tested |
| Alerts/notifications | Small purposeful surface | No warning hidden by polish; local status announcements |
| Progress | Existing authoritative progress/cancel | No invented percentage; reduce motion preserves visible busy text |
| Loading/empty/error | Contextual concise state text | Never portray stale evidence as current; no fake metric skeleton |
| Chart toolbar/legend | Compact, clear, existing Plotly tools | No wheel zoom/rangeslider; trace toggles, export and cursor intact |
| File list/mapping | Compact identity rows and grouped semantic inputs | Original files, units and conversion contracts preserved |
| Schematic annotations | Count/duration first, details on demand | No coordinate, transform, routing, pointer/hit-test changes |
| Report/export controls | Consistent actions/readiness layout | Exact engineering evidence, options and units retained |

## Density and hierarchy

Graph focus maximises usable width; do not frame every chart with nested cards.
Technical tables are compact. Mapping forms retain sufficient room for quantity,
unit and source identity. Assessment order is conclusion → exception → evidence
→ method. Count and duration lead Spill/Network; validity warnings remain visible.
Calculated and engineer-reviewed survey outcomes remain separate.

## Motion

Hover 120 ms; press 140 ms; selection 200 ms; drawers 220 ms; popover 160 ms;
content opacity refresh 200 ms. Use opacity/indicator transforms; avoid layout
animation of graph/network containers and coordinate changes. Sidebar width changes
may use a content crossfade while layout settles, followed by one coalesced Plotly
resize; never animate values. Reduced-motion suppresses nonessential transitions
and spinner rotation while keeping labelled busy/progress state.

## Responsive and layers

1920/1440/1280: docked desktop shell where supported. 1024: overlay inspector.
768: compact rail, explicit expansion. 390: accessible navigation drawer and
stacked forms; technical tables scroll within their surface. Preserve existing
breakpoints where tests depend on them; resolve overflow in owning styles.
Layers: table 1, canvas tools 4–8, header 40, rail 50, popover 75, inspector 80–90,
analysis dialog 200, operation feedback 9999 (matching existing ownership).
No major framework or new dependency is justified.

## Accessibility acceptance

Visible focus, named controls, keyboard operation, semantic status, reduced
motion, sufficient contrast, no offscreen drawer in tab order, Escape/focus
restoration, and 200% scaling require rendered tests. Aim WCAG 2.2 AA; do not
claim blanket compliance from screenshots or source inspection.

## Rollback

Revert presentation commits together. Keep protected kernel/registry/worker/source
files unchanged and preserve all legacy selectors. Rebuild from the baseline
release pipeline. No stored-project migration is introduced by this redesign.
