# Hydra Bench v2.1 release review

The Explorer changes are staged in PR #111 on top of the distinct v2.0.1 patch
in PR #110. Review required CI against each PR's final commit. The production
release is subject to the repository's protected main and owner release record.

## Change and security impact

New navigation edits the existing browser-local camera and SVG presentation.
The asset inspector uses text nodes for imported attributes and custom values.
Time-series references use existing source fingerprints and channel identities.
The upload button calls the shared local file input. No dependency, network
destination, worker protocol, request payload or release gate changes.

The schematic persists the new optional fields in the existing local workspace
snapshot and network key. The storage claim SC-03 retains its wording and scope.
The updated evidence digest covers the reviewed storage and display changes.
Revised exports keep compatible local edits and bindings. Changed substantive
source attributes invalidate linked results. Source attributes and units remain
separate from the existing mapped calculation fields, and ICM is never updated.

The v2.1 milestone labels PR #111 as a release candidate and starts the v2.1
line only after its numbered merge. The SC-06 review confirms that the build
version remains an identity label. Security status, limitations and release
gates remain unchanged.

## Verification

The existing Chromium and Firefox interaction job runs the extended Network
Explorer test. The test uses synthetic native CSV and local source files.
The importer unit tests exercise supported node/link tables, raw values and
units, multiline values, metadata provenance, unsupported units, invalid data,
migration and compatible reimport. Existing engineering suites retain their
calculations, 12/24 count and RAG assertions. The existing context test checks
Flow Survey, Verification and real calculated Detriment handoffs. The dense
layout test covers 400 points and 399 connectors.

Desktop pointer and keyboard interaction is tested in Chromium and Firefox.
Native touch events are exercised through Chromium touch emulation. Physical
touch hardware and Firefox pinch emulation are outside this tested scope.
