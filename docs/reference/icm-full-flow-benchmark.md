# InfoWorks ICM full-flow capacity benchmark

Use a new synthetic InfoWorks network. Add four ordinary circular conduits
with one barrel, no sediment, and Colebrook–White roughness. Give each conduit
its own upstream node and downstream outfall. Use the network's normal
InfoWorks solution settings and record the conduit solution model as shown.
Use metres for length and invert levels and millimetres for circular dimensions
and roughness. Set circular width and height to the same value where both
fields are editable.

| Synthetic case | Diameter (mm) | Length (m) | US invert (m) | DS invert (m) | Top and bottom roughness (mm) | Independent reference (L/s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HB01 | 300 | 100 | 10.200 | 10.000 | 1.50 | 43.632987 |
| HB02 | 450 | 100 | 10.500 | 10.000 | 1.50 | 202.647909 |
| HB03 | 900 | 100 | 10.100 | 10.000 | 1.50 | 562.339300 |
| HB04 | 450 | 100 | 10.500 | 10.000 | 0.15 | 262.815812 |

1. Run **Network → Validate network** for the synthetic scenario.
2. Export or copy the four conduit rows to CSV or Excel. Include **Link ID**
   (or US node ID, link suffix and DS node ID), **Conduit type**, **Solution
   model**, **Shape**, **Width / Height** (or circular diameter), **Length**,
   **US / DS invert level**, **Gradient**, **Roughness type**,
   **Top / Bottom roughness**, **Number of barrels**, **Sediment depth** and
   **Conduit full capacity** (database field `capacity`).
3. Include the ICM version and build from About, the display units for each
   numeric field (especially capacity and gradient), and any validation
   warning affecting these rows. Preserve available precision. If the network
   CSV omits calculated capacity, include it from the validated conduit grid
   or object properties with the same IDs. A simulation is unnecessary.

The independent values solve the original Colebrook–White residual by
bisection in Darcy friction factor, using gravity 9.80665 m/s² and kinematic
viscosity 1.0 × 10⁻⁶ m²/s. They matched the HydraBench full-pipe solver within
6 × 10⁻¹⁴ L/s for these cases. The ICM comparison remains pending. The reference
values are not ICM outputs. When comparing, retain the ICM raw capacity and
units, convert to L/s, and report absolute and relative differences alongside
the precision of the ICM export. This exercise covers full-flow capacity under
the selected configuration. Partially full flow and dynamic solver behaviour
require separate evidence.

[Autodesk conduit fields and validation-calculated capacity](https://help.autodesk.com/cloudhelp/2026/ENU/ICMLIVE-Help/files/GUID-1306601E-4A25-4FBE-AE9A-01E06BF4986E.htm)
