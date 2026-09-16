from datetime import datetime
import pandas as pd
from icm_workbench.domain import ExclusionPeriod
from icm_workbench.analysis.exclusions import normalise_exclusions,apply_exclusions,audit_exclusions

def test_multiple_overlapping_exclusions_merge_and_keep_reasons():
    a=ExclusionPeriod(datetime(2026,1,1,0,2),datetime(2026,1,1,0,5),"EDM fault");b=ExclusionPeriod(datetime(2026,1,1,0,4),datetime(2026,1,1,0,7),"model corruption");merged=normalise_exclusions([a,b]);assert len(merged)==1;assert merged[0].start==a.start and merged[0].end==b.end;assert "EDM fault" in merged[0].reason and "model corruption" in merged[0].reason

def test_apply_exclusion_masks_values_not_timestamps():
    df=pd.DataFrame({"timestamp":pd.date_range("2026-01-01",periods=5,freq="min"),"v":range(5)});exc=ExclusionPeriod(datetime(2026,1,1,0,1),datetime(2026,1,1,0,3),"bad logger");out,audit=apply_exclusions(df,[exc],["v"]);assert len(out)==5;assert out.loc[1:2,"v"].isna().all();assert audit["excluded_rows"]==2;assert audit_exclusions([exc])["excluded_hours"]==2/60
