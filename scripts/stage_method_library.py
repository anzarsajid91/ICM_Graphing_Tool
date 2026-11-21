"""Stage a searchable index of the repository's engineering method text."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


METHODS = {
    "Missingness": ("Evidence", "General", "data", "time-series"),
    "Time basis and alignment": ("Verification", "General", "verification", "overview"),
    "Integration": ("Evidence", "General", "data", "time-series"),
    "Spill intervals and 12/24 counting": ("Spills", "UK", "spills", "assessment"),
    "Exclusion periods": ("Evidence", "General", "data", "time-series"),
    "Storage screening": ("Spills", "General", "spills", "storage-routing"),
    "Source diagnostics": ("Evidence", "General", "data", "time-series"),
    "Circular-pipe capacity and design flow preview": ("Hydraulics", "General", "hydraulics", "capacity"),
    "Fixed-factor pipe system screening and pump duty": ("Hydraulics", "General", "hydraulics", "system-curve"),
    "England continuation-flow screening": ("Design flows", "England", "hydraulics", "formula-a"),
    "Hydraulic structures and supplied ratings": ("Hydraulics", "General", "hydraulics", "structures"),
}
REFERENCES = {
    "www.gov.uk", "www.scottishwater.co.uk", "www.sepa.org.uk", "www1.eere.energy.gov",
    "help.autodesk.com", "www.hec.usace.army.mil", "www.usbr.gov",
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
            if urlsplit(url).netloc not in REFERENCES:
                raise ValueError(f"Method library link requires review: {url}")
            references.append({"label": " ".join(label.split()), "url": url})
        body = MARKDOWN_LINK.sub(lambda match: match[1], section)
        paragraphs = [" ".join(part.replace("**", "").replace("`", "").split())
                      for part in re.split(r"\n\s*\n", body) if part.strip()]
        pages.append(dict(name=name, category=category, jurisdiction=jurisdiction, workspace=workspace, page=page,
                          paragraphs=paragraphs, references=references))
    destination.write_text(json.dumps({"schema_version": 1, "methods": pages}, ensure_ascii=False) + "\n", encoding="utf-8")
