# Performance evidence

These are development measurements, not release guarantees. The target environment must be benchmarked separately.

Synthetic reference: 262,800 timestamps at 2-minute spacing, one observed flow channel with two deliberate gaps, and 20 modelled flow scenarios. Calculations use full-resolution inputs; display downsampling is separate.

Development-container runs on 16 September 2026:

- Python 3.13.5; Linux 6.18.44 x86_64 / glibc 2.41
- 20-scenario calibration metric pass: **4.016–4.097 s** across two consecutive development runs
- peak Python allocation observed by `tracemalloc`: **164.5 MiB**
- gap-aware downsampling to a nominal 5,000-point display budget: **0.069–0.077 s**, producing 4,943 points

The 4.016–4.097 s result is a full 20-scenario metric pass, not the warm single-chart refresh target. The downsampling result covers display-array preparation only, not browser rendering. Neither is presented as proof that G6's UI timing targets pass.

Reproduce with `python scripts/benchmark_workbench.py`. Target-Windows cold/warm import, actual Dash refresh, zoom rendering, event/spill analysis, export size, process RSS and repeated open/close/cancellation remain acceptance measurements.
