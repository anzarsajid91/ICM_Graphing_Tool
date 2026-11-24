# Synthetic review evidence

The coordinator reproduced the three views on the live v3.0.1 build,
`ccc36427c12f003e5d9b1fee61632770b31952cc`, in desktop Chromium
140.0.7339.186 at 1440×1000. The two specialists collected their own evidence
separately. The captured network has 101 source nodes and 101 source links,
a CSO, pumping station, weir, two discharges and two monitor associations.

| Surface | Observed in fitted view | Capture |
| --- | --- | --- |
| Detailed network | 101 points, 101 connectors, 30 visible labels, 2 monitor markers | [Detailed](detailed.jpg) |
| Engineering schematic | 14 points, 14 connectors, 14 visible labels, 2 monitor markers | [Engineering](engineering.jpg) |
| Strategic asset diagram | 14 points, 14 connectors, 11 visible labels, 2 monitor markers. Two feeder groups replace 9 and 6 source nodes respectively. | [Strategic](strategic.jpg) |
| Strategic SVG publication | The diagram opens in a standalone view with legend and title. The title wraps inside the word “network” despite having available width. | [Rendered export](strategic-export.jpg) · [SVG](strategic.svg) |

For this fixture, the coordinator verified ordered source paths, exact
source-link accounting and downstream reachability among retained points in
both schematic plans. The original nodes and links matched after all view and
export changes. The guard observed 31 requests and zero violations during
this run. The three layouts and exported Strategic diagram were inspected
visually. These results cover this fixture, browser and window size.
[Measured results](schematic-facts.json)

To reproduce, use the repository's Node and Playwright dependencies. The script
loads the live build by default and fails if its commit differs from the reviewed
revision. For an exact build served locally, set `ICM_BASE_URL` and
`GITHUB_SHA`. New runs output all three screenshots, all three SVGs and the
measured results. The export title intentionally exercises a word that crosses
the current fixed character boundary.

```sh
npm ci --ignore-scripts
npx playwright install chromium
ICM_EVIDENCE_DIR=/tmp/hydra-schematic-review \
  node docs/reviews/v3.0.1/evidence/reproduce-schematic.mjs
```

[Network fixture](branched-network.csv) ·
[Monitor locations](monitor-locations.csv) ·
[Reproduction script](reproduce-schematic.mjs)

## Specialist evidence and replay

The versioned dossier retains the original independent records, their
checksums, cross-review notes and linked synthetic inputs, captures, logs and
exports. The specialist scripts preserve the paths used during their run. To
replay on a different checkout, run a scratch copy with the production checkout
and evidence roots set to local paths. The two shared network inputs above
replace the original `v301/baseline` fixture paths. Keep the browser version,
application SHA, source values, analysis bounds, mappings and guard contract
fixed for a baseline replay. For a new candidate, record its exact SHA and any
changed support or interaction behavior.
[Technical run register](../technical/runs.md) ·
[Design evidence index](../design/EVIDENCE-INDEX.md)
