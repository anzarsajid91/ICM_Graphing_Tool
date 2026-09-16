from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from hashlib import sha256
from pathlib import Path
from typing import Any

import pandas as pd


class Quantity(str, Enum):
    DEPTH = "depth"
    LEVEL = "level"
    FLOW = "flow"
    VELOCITY = "velocity"
    RAINFALL = "rainfall"


class SeriesRole(str, Enum):
    OBSERVED = "observed"
    MODELLED = "modelled"
    COMPARISON = "comparison"
    RAINFALL = "rainfall"


@dataclass(frozen=True)
class SourceDescriptor:
    source_id: str
    reference: str
    content_sha256: str
    parser: str
    parser_version: str
    raw_metadata: dict[str, Any] = field(default_factory=dict)
    import_audit: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_path(cls, path: Path, parser: str, parser_version: str, **kwargs: Any) -> "SourceDescriptor":
        digest = sha256(path.read_bytes()).hexdigest()
        return cls(source_id=f"src:{digest[:16]}", reference=path.name, content_sha256=digest,
                   parser=parser, parser_version=parser_version, **kwargs)


@dataclass(frozen=True)
class SeriesDescriptor:
    series_id: str
    source_id: str
    role: SeriesRole
    quantity: Quantity
    canonical_unit: str
    original_unit: str | None = None
    monitor: str | None = None
    scenario: str | None = None
    vertical_datum: str | None = None
    sign_convention: str | None = None
    timestamp_convention: str = "instantaneous"
    time_basis: str = "model clock/unspecified"


@dataclass
class SeriesData:
    descriptor: SeriesDescriptor
    timestamps: pd.DatetimeIndex
    values: pd.Series
    quality_flags: pd.Series | None = None

    def frame(self, value_name: str = "value") -> pd.DataFrame:
        out = pd.DataFrame({"timestamp": self.timestamps, value_name: self.values.to_numpy()})
        if self.quality_flags is not None:
            out["quality_flag"] = self.quality_flags.to_numpy()
        return out


@dataclass(frozen=True, order=True)
class ExclusionPeriod:
    start: datetime
    end: datetime
    reason: str
    source: str = "user"
    exclusion_id: str | None = None

    def __post_init__(self) -> None:
        if self.end <= self.start:
            raise ValueError("Exclusion end must be after start")
        if not self.reason.strip():
            raise ValueError("Exclusion reason is required")
        if self.exclusion_id is None:
            payload = f"{self.start.isoformat()}|{self.end.isoformat()}|{self.reason}|{self.source}"
            object.__setattr__(self, "exclusion_id", f"exc:{sha256(payload.encode()).hexdigest()[:12]}")

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["start"] = self.start.isoformat()
        d["end"] = self.end.isoformat()
        return d


@dataclass(frozen=True)
class AnalysisConfig:
    observed_series_id: str | None = None
    modelled_series_ids: tuple[str, ...] = ()
    analysis_start: datetime | None = None
    analysis_end: datetime | None = None
    max_interpolation_gap_seconds: float = 900.0
    threshold_observed: float | None = None
    threshold_modelled: float | None = None
    spill_window_hours: tuple[int, int] = (12, 24)
    exclusions: tuple[ExclusionPeriod, ...] = ()
    time_basis: str = "model clock/unspecified"
    method_versions: tuple[tuple[str, str], ...] = ()

    def stable_hash(self) -> str:
        import json
        payload = asdict(self)
        return sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


@dataclass(frozen=True)
class AnalysisResult:
    config_hash: str
    source_hashes: tuple[str, ...]
    calculation_version: str
    metrics: dict[str, Any] = field(default_factory=dict)
    events: tuple[dict[str, Any], ...] = ()
    coverage: dict[str, Any] = field(default_factory=dict)
    warnings: tuple[str, ...] = ()
    audit: dict[str, Any] = field(default_factory=dict)


@dataclass
class Workspace:
    schema_version: int
    name: str
    source_references: dict[str, dict[str, Any]] = field(default_factory=dict)
    mappings: dict[str, Any] = field(default_factory=dict)
    analysis: dict[str, Any] = field(default_factory=dict)
    exclusions: list[dict[str, Any]] = field(default_factory=list)
    annotations: list[dict[str, Any]] = field(default_factory=list)
    presentation: dict[str, Any] = field(default_factory=dict)

    def add_exclusion(self, exclusion: ExclusionPeriod) -> None:
        self.exclusions.append(exclusion.to_dict())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
