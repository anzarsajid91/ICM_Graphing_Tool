# Browser dependency package

Normal Pages operation uses same-origin, checked-in Plotly 3.1.0, SheetJS CE
0.20.3 and Pyodide 0.29.4, including NumPy, pandas and their dependency closure.
`web/vendor/manifest.json` records exact versions, upstream URLs, byte counts and
SHA-256 hashes. Every Pages build verifies all listed files and rejects unlisted
or altered vendor content. No build-time download or CDN fallback is used.

SheetJS 0.20.3 was obtained from the publisher's authoritative distribution:
https://docs.sheetjs.com/docs/getting-started/installation/standalone/
It replaces the legacy npm 0.18.5 build. Upstream license notices are retained,
including Python-wheel notices. Vendoring pins reviewed bytes; it does not imply
that future vulnerabilities cannot affect them. Updates must refresh the manifest
and pass the workbook and cumulative browser gates.

Association imports accept XLSX ZIP archives up to 20 MiB, 2,000 entries and
100 MiB declared expanded content. Individual entries, encryption, ZIP64,
truncated directories and suspicious expansion are rejected before parsing.
Worksheet materialisation is bounded to 10,000 rows and 256 columns, with at
most 100 sheets. These limits apply to the small association workbook, not FDV,
CSV or rainfall time series. Errors preserve the last successful association.

Interactive HTML reports embed the packaged Plotly bundle so the downloaded
report does not require a CDN. A genuine bundle failure retains the existing
explicit static-SVG fallback.

The Python/JavaScript/worker architecture and engineering equations are unchanged
by this dependency packaging. The vendored runtime adds approximately 25 MiB to
the release artifact; only required files are loaded by the browser.
