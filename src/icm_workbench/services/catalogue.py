from hashlib import sha256
from pathlib import Path
SUPPORTED_SUFFIXES=(".csv",".fdv",".fdv.txt",".r",".r.txt")
def catalogue_folder(root):
    base=Path(root).expanduser().resolve()
    if not base.exists() or not base.is_dir():raise ValueError(f"Data folder does not exist: {base}")
    rows=[]
    for p in sorted(base.iterdir(),key=lambda x:x.name.lower()):
        if p.is_file() and p.name.lower().endswith(SUPPORTED_SUFFIXES):rows.append({"name":p.name,"relative_path":p.name,"size_bytes":p.stat().st_size,"sha256":sha256(p.read_bytes()).hexdigest()})
    return rows
def safe_source_path(root,relative_reference):
    base=Path(root).expanduser().resolve();target=(base/relative_reference).resolve()
    if target!=base and base not in target.parents:raise ValueError("Source path resolves outside the registered data root")
    return target
