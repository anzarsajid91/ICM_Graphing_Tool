"""Stage a searchable index of the repository's engineering method text."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


METHODS = {
    "Missingness": ("Evidence", "General", "data", "time-series"),
    "Time basis and alignment": ("Verification", "General", "verification", "overview"),
    "Integration": ("Evidence", "General", "data", "time-series"),
    "Derived time-series intervals": ("Evidence", "General", "data", "time-series"),
    "Spill intervals and 12/24 counting": ("Spills", "UK", "spills", "assessment"),
    "Exclusion periods": ("Evidence", "General", "data", "time-series"),
    "Storage screening": ("Spills", "General", "spills", "storage-routing"),
    "Source diagnostics": ("Evidence", "General", "data", "time-series"),
    "Paired flow-monitor investigation": ("Flow survey", "General", "survey", "fdv-check"),
    "Spatial rainfall comparison": ("Flow survey", "UK", "survey", "rainfall-check"),
    "Flow survey verification suitability": ("Flow survey", "UK", "survey", "rainfall-check"),
    "Weekly flow survey review and volume balance": ("Flow survey", "UK", "survey", "volume-balance"),
    "Multi-event verification matrix": ("Verification", "UK", "graphs", "matrix"),
    "Circular-pipe capacity and design flow preview": ("Hydraulics", "General", "hydraulics", "capacity"),
    "Manning circular gravity sizing": ("Hydraulics", "General", "hydraulics", "gravity"),
    "Rectangular and trapezoidal gravity sizing": ("Hydraulics", "General", "hydraulics", "gravity"),
    "Darcy full-bore gravity sizing": ("Hydraulics", "General", "hydraulics", "gravity"),
    "Fixed-factor pipe system screening and pump duty": ("Hydraulics", "General", "hydraulics", "system-curve"),
    "England continuation-flow screening": ("Design flows", "England", "hydraulics", "formula-a"),
    "Modelled continuation during physical spills": ("Design flows", "General", "hydraulics", "formula-a"),
    "ICM land-use defaults for catchment review": ("Design flows", "General", "hydraulics", "formula-a"),
    "ICM model loading from Waste Water and Trade Waste events": ("Design flows", "General", "hydraulics", "formula-a"),
    "Scotland continuation-flow screening": ("Design flows", "Scotland", "hydraulics", "formula-a"),
    "Scotland municipal treatment design flows": ("Design flows", "Scotland", "hydraulics", "treatment-flow"),
    "England municipal treatment design flows": ("Design flows", "England", "hydraulics", "treatment-flow"),
    "Uisce Éireann new-network peak foul flow": ("Design flows", "Ireland", "hydraulics", "foul-loading"),
    "Circular gravity-section velocity and mean shear": ("Hydraulics", "General", "hydraulics", "section-check"),
    "Wales GN066 continuation-flow screening": ("Design flows", "Wales", "hydraulics", "formula-a"),
    "Ireland combined overflow design screening": ("Design flows", "Ireland", "hydraulics", "formula-a"),
    "Documented project continuation-flow method": ("Design flows", "General", "hydraulics", "formula-a"),
    "Hydraulic structures and supplied ratings": ("Hydraulics", "General", "hydraulics", "structures"),
    "Fully contracted V-notch weirs": ("Hydraulics", "General", "hydraulics", "structures"),
    "Simulation results and long-section interpretation": ("Network results", "General", "network", "simulation-results"),
    "Detriment criteria and matched report evidence": ("Detriment", "General", "detriment", "comparison"),
}
REFERENCES = {
    "www.gov.uk", "www.scottishwater.co.uk", "www.sepa.org.uk", "www1.eere.energy.gov",
    "help.autodesk.com", "www.hec.usace.army.mil", "www.usbr.gov",
}
EXACT_REFERENCES = {
    "https://www.ciwem.org/assets/pdf/Special%20Interest%20Groups/Urban%20Drainage%20Group/Code%20of%20Practice%20for%20the%20Hydraulic%20Modelling%20of%20Ur.pdf",
    "https://www.ciwem.org/assets/pdf/Special%20Interest%20Groups/Urban%20Drainage%20Group/WAPUG_User_Note_06.pdf",
    "https://unstats.un.org/unsd/envaccounting/waterGuidelines/Material/WMO_Guide_168_Vol_I_en_hydrological_practices.pdf",
    "https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/correlat.htm",
    "https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors",
    "https://www.fhwa.dot.gov/engineering/hydraulics/pubs/hif24006.pdf",
    "https://www.fhwa.dot.gov/engineering/hydraulics/pubs/hds4intr.pdf",
    "https://www.fhwa.dot.gov/engineering/hydraulics/pubs/08090/HDS4_608.pdf",
    "https://www.water.ie/sites/default/files/2025-08/Code-of-Practice-for-Wastewater-Infrastructure-CDS-5020-03-Rev-03.pdf",
    "https://www.emerald.com/jince/article/11/4/133/417643",
    "https://www.energy.gov/documents/doe-hdbk-1012-92vol3",
    "https://cdnfd.cyfoethnaturiol.cymru/2tihrspr/gn066-how-to-classify-storm-overflow-performance.pdf",
    "https://cdnfd.cyfoethnaturiol.cymru/gjjh10cu/gn021-unpermitted-storm-overflows.pdf",
    "https://www.epa.ie/publications/licensing--permitting/waste-water/UrbanWasteWater2.pdf",
}
MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\((https://[^\s)]+)\)")


def stage_method_library(root: Path, destination: Path) -> None:
    source = (root / "docs/methods.md").read_text(encoding="utf-8")
    extracted = re.split(r"^## (.+)$", source, flags=re.MULTILINE)
    sections = dict(zip(extracted[1::2], extracted[2::2]))
    pages = []
    for name, (category, jurisdiction, workspace, page) in METHODS.items():
        section = sections[name].strip()
        if not section:
            raise ValueError(f"Missing engineering method text for {name}")
        references = []
        for match in MARKDOWN_LINK.finditer(section):
            label, url = match.groups()
            if urlsplit(url).netloc not in REFERENCES and url not in EXACT_REFERENCES:
                raise ValueError(f"Method library link requires review: {url}")
            references.append({"label": " ".join(label.split()), "url": url})
        body = MARKDOWN_LINK.sub(lambda match: match[1], section)
        paragraphs = [" ".join(part.replace("**", "").replace("`", "").split())
                      for part in re.split(r"\n\s*\n", body) if part.strip()]
        pages.append(dict(name=name, category=category, jurisdiction=jurisdiction, workspace=workspace, page=page,
                          paragraphs=paragraphs, references=references))
    destination.write_text(json.dumps({"schema_version": 1, "methods": pages}, ensure_ascii=False) + "\n", encoding="utf-8")
