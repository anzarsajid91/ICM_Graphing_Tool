"""Synthetic reference benchmark; not a release-performance claim."""
import platform,sys,time,tracemalloc
import numpy as np
import pandas as pd
from icm_workbench.analysis.comparison import compare_scenarios
from icm_workbench.plotting import downsample_gap_aware
N=262_800;rng=np.random.default_rng(42);t=pd.date_range("2025-01-01",periods=N,freq="2min");base=0.4+0.08*np.sin(np.arange(N)/700)+0.01*rng.normal(size=N);obs=pd.DataFrame({"timestamp":t,"flow":base});obs.loc[50_000:50_199,"flow"]=np.nan;obs.loc[180_000:180_499,"flow"]=np.nan;scenarios={f"Model {i+1}":(pd.DataFrame({"timestamp":t,"flow":base*(1+(i-10)*0.002)+0.005*rng.normal(size=N)}),"flow") for i in range(20)}
tracemalloc.start();start=time.perf_counter();compare_scenarios(obs,"flow",scenarios,max_gap_seconds=300);metrics=time.perf_counter()-start;_,peak=tracemalloc.get_traced_memory();tracemalloc.stop();start=time.perf_counter();x,_=downsample_gap_aware(obs.timestamp,obs.flow,max_points=5000);downsample=time.perf_counter()-start
print(f"Python: {sys.version.split()[0]} | {platform.platform()}");print(f"Rows: {N:,}; model scenarios: {len(scenarios)}");print(f"20-scenario metric pass: {metrics:.3f} s");print(f"Peak tracemalloc: {peak/1024/1024:.1f} MiB");print(f"Gap-aware downsample: {downsample:.3f} s; display points: {len(x):,}")
