"""Compatibility shim for the browser bundle.

Advanced engineering calculations live in :mod:`icm_workbench.advanced_api`.
"""
from icm_workbench import advanced_api as _impl

globals().update({
    name: getattr(_impl, name)
    for name in dir(_impl)
    if not name.startswith("__")
})
