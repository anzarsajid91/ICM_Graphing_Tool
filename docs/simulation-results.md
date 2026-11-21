# Simulation results intake and review

## Export from InfoWorks ICM

In the InfoWorks ICM Results menu, choose **CSV export**. Add the required
simulation and a Selection List for the assets under review. Choose the object
class and individual result attribute. Use the **Results** timestep, enable
the header and unit rows and use native metric units where possible. Download
one CSV per simulation, object class and attribute. Keep the run identifier,
scenario, event, model revision and vertical datum with the file.

The [Autodesk 2026 CSV Export dialog](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-30AFF9A8-86D6-418C-A17F-127D09EC8B4D.htm)
defines the header, units and timestep choices. The Autodesk result field
references distinguish time-varying [node results](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-18FD4962-1E97-491A-AD6E-6DF35191301D.htm)
and [link results](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-174D9482-C7A3-4A12-B8E3-993F2C088F46.htm)
from independent simulation extrema. Link-end depth, absolute level and total
head have different definitions. Flood depth is referenced to a node's flood
level. Some 2D flood volumes are notional values. Preserve those distinctions
when interpreting results.

## Import contract v1

Open **Network Schematic → Simulation results** and choose the local CSV. Set
the header record and date column and indicate whether the following record
contains units. Preview shows the first 12 nonempty records and six columns.
Record numbers count blank records and quoted multiline fields count once.
The published reader accepts comma-delimited UTF-8, optionally with a BOM,
or UTF-16 with a byte-order marker. Select the ISO or DMY project-clock
interpretation and explicitly confirm that the source contains instantaneous
samples. Dates with explicit offsets, invalid calendar dates, repeated times
and out-of-order timestamps require resolution before indexing.

Provide a simulation ID, model revision, scenario, event, source attribute,
quantity, supported unit and result location. Node and link identities are
typed. A link uses the ICM table, upstream node ID and suffix. Keep leading
zeros. For absolute level and total head, supply the vertical datum. Mapped
columns must be unique. A declared unit row must be compatible with the
selected units. Signed values, including reverse flow, retain their sign.
Blank cells and the optional explicitly configured nonnumeric sentinel are
missing. Numeric zero is a sample. Malformed numbers block the import.

The local index retains the selected labels, mappings and canonical units,
along with an ordered source fingerprint. The fingerprint takes SHA-256 of
each consecutive 1 MiB byte block, concatenates the binary hashes and hashes
that sequence with SHA-256. The source size accompanies the digest. This
algorithm is named `sha256-of-ordered-1MiB-sha256-blocks-v1` in the result
metadata. Match exported run metadata with the current model before drawing
any conclusions from a result.

## Resource and verification limits

The browser worker reads the original File in 1 MiB chunks, builds a shared
time axis and retains selected results in column-major, chunked Float64 arrays.
Sources are session memory. Removing a source releases its worker reference.
Cancellation and validation failures leave previously indexed sources in
place. The worker allows up to 16 sources, up to 64 MiB of combined typed
sample allocations and up to 2 GiB per source file. The explicit mapping
form accepts up to 100 mapped columns per import. JavaScript objects, text
and temporary parsing buffers add to the typed-data allocation. Exporting
fewer assets, attributes or time periods reduces work at the source.

The sample slider and play controls advance through recorded sample positions.
Unequal result timesteps remain unequal in reported timestamps. The current
review screen reports entire-file extrema for one selected series and their
timestamps. Indexed reads support exact-time frames and bounded time windows.
There is no interpolation, extrapolation or numerical decimation.

## Portable results package v1

Select **Download portable results** for an indexed source. Hydra Bench
writes a local `.hbresults` file containing the mapped series only. Use
**Portable results package** to preview and explicitly index that file in
another session. Review the model revision, scenario and asset mapping
before applying playback. Keep the native result export for independent
source verification. A package's declared original fingerprint identifies
source provenance and can be checked against the original file.

The format is public and uncompressed. It begins with the eight ASCII
bytes `HBRES001`, a little-endian unsigned 32-bit UTF-8 JSON length, then
the JSON header. The header declares `schemaVersion`, `count`,
`rowsPerChunk`, simulation, model revision, scenario, event, project-clock
format, temporal support, original source fingerprint, missing-source
token and the ordered columns. Each column retains its typed asset,
source column index, quantity, location, datum, canonical and original
units, attribute label, source heading and optional source unit label.

For `C` result columns, a full block contains
`min(4096, floor(1048576 / (8 × (C + 1))))` samples. The last block contains
the remaining samples without padding. Each block starts with one shared
array of project-clock millisecond values. An array for each result column
follows in header order. Every entry is an IEEE 754 binary64 little-endian
value. A quiet NaN represents a missing result. Signed values and zero
remain samples. Infinity is invalid. The reader enforces the schema and
byte size, reviews declared role and units, validates strictly increasing
times and counts missing measurements before using the source. It trims
neither time periods nor values to fit the memory budget.

The package fingerprint `sha256-of-hbresults-header-and-blocks-v1` hashes
the combined prefix and JSON bytes and then each binary block. It hashes
the ordered concatenation of those binary digests. This identifies the
package read locally. No content is sent to a server. Import cancellation
preserves other indexed sources. The same 64 MiB typed-data budget applies
to indexed packages and CSVs together. Preview has an 8 MiB header ceiling
and rejects impossible block layouts, lengths and metadata. Neither method
uses hidden persistence, archive expansion or a proprietary binary reader.

## Review on the schematic and long section

Open **Simulation playback** in the detailed schematic. Choose an indexed
source, review the original model revision and typed asset mapping and
choose the display bounds in the stated unit. Apply the results layer to the
current native geometry. The legend is fixed during playback. Unmapped
assets keep their schematic style. A matched asset with no value at the
exact timestamp has a hollow marker or dashed link. Link arrows still
show nominal topology. Read the signed value from the asset label.

For node level sources, enter the geometry datum to synchronize an open
long section. The entered datum must match the source result datum. The
profile draws discrete samples at the corresponding nodes, shows the exact
project-clock time, and reports freeboard only where a compatible imported
ground elevation is available. The temporary playback layer takes display
precedence over an individually saved level overlay. It leaves saved
geometry, route settings, and evidence unchanged. Reimporting geometry or
removing the source clears the layer. Its session index remains local.

The initial desktop smoke tests use a synthetic, explicitly mapped export
following the documented CSV options. ICM-generated fixtures across versions
and locales are still needed. The registry retains only local session data.
File-backed retrieval above the in-memory budget, automated revision
binding, conduit-end profiles, windowed transport and scenario comparison
remain outstanding.
