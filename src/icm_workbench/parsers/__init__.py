from pathlib import Path
from .common import ParsedData
from .csv import parse_csv
from .fdv import parse_fdv
from .rainfall import parse_rainfall_r

def parse_file(path):
    p=Path(path);low=p.name.lower()
    if low.endswith((".fdv",".fdv.txt")):return parse_fdv(p)
    if low.endswith((".r",".r.txt")) and not low.endswith(".fdv.txt"):return parse_rainfall_r(p)
    if low.endswith(".csv"):return parse_csv(p)
    raise ValueError(f"Unsupported file format: {p.name}")
__all__=["ParsedData","parse_file","parse_csv","parse_fdv","parse_rainfall_r"]
