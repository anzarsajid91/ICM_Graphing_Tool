"""Compatibility shim for the browser bundle.

Engineering calculations live in :mod:`icm_workbench.browser_api`.  This file
is retained so historical Pages artifacts and direct imports keep working.
"""
from icm_workbench import browser_api as _impl

globals().update({
    name: getattr(_impl, name)
    for name in dir(_impl)
    if not name.startswith("__")
})
