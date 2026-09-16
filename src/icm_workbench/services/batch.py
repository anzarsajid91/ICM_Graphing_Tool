from dataclasses import dataclass
from typing import Any
@dataclass
class BatchItem:
    item_id:str
    payload:dict[str,Any]
def run_batch(items,runner,*,should_cancel=None,on_progress=None):
    items=list(items);results=[]
    for index,item in enumerate(items,start=1):
        if should_cancel and should_cancel():results.append({"item_id":item.item_id,"status":"cancelled"});break
        try:results.append({"item_id":item.item_id,"status":"ok","result":runner(item.payload)})
        except Exception as exc:results.append({"item_id":item.item_id,"status":"error","error":f"{type(exc).__name__}: {exc}"})
        if on_progress:on_progress(index,len(items),item.item_id)
    return results
