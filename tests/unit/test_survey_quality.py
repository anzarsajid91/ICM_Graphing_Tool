import numpy as np
import pandas as pd

from icm_workbench.analysis.rainfall import multi_gauge_rainfall_assessment
from icm_workbench.analysis.review import weekly_data_assessment


def test_weekly_fdv_quality_flags_six_hour_flatline_and_range():
    ts=pd.date_range("2026-01-05",periods=8*60//2+1,freq="2min")
    frame=pd.DataFrame({"timestamp":ts,"depth":np.r_[np.full(181,0.5),np.linspace(0.5,11.0,len(ts)-181)]})
    row=weekly_data_assessment(frame).iloc[0]
    assert row["flatline_minutes"]>=360
    assert row["out_of_range_count"]>0
    assert row["rag"]=="Red"


def _gauge(start,days,depths):
    interval=60
    timestamps=[];values=[]
    for day in range(days):
        for hour in range(24):
            timestamps.append(pd.Timestamp(start)+pd.Timedelta(days=day,hours=hour))
            values.append(float(depths[day]))
    return pd.DataFrame({"timestamp":timestamps,"rainfall":values}),"rainfall",interval


def test_multi_gauge_rainfall_flags_repeated_zero_response():
    gauges={
        "RG-A":_gauge("2026-01-01",3,[0,0,0]),
        "RG-B":_gauge("2026-01-01",3,[0.2,0.2,0.2]),
        "RG-C":_gauge("2026-01-01",3,[0.2,0.2,0.2]),
    }
    result=multi_gauge_rainfall_assessment(gauges)
    flagged={x["gauge"]:x for x in result["gauges"]}
    assert flagged["RG-A"]["zero_response_strikes"]==3
    assert flagged["RG-A"]["repeated_zero_response"] is True
    assert result["non_uniform_day_count"]==3
