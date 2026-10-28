"""Phase 05 additive wire types and strict, intentionally narrow model outputs."""

import re
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import ConfigDict, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from . import contracts as c
from .agent_models import RuntimeNavigationAction

PROMPT_VERSION = "observable-video-2"
SCHEMA_VERSION = "observations-2"
PIPELINE_VERSION = "video-index-1"


class AnalysisJobCreate(c.AnalysisJobCreate):
    max_segments: int = Field(default=30, ge=1, le=30, strict=True)


Category = Literal[
    "person",
    "bicycle",
    "motorcycle",
    "car",
    "truck",
    "bus",
    "dog",
    "cat",
    "bird",
    "bag",
    "package",
    "door",
    "other",
]
Attribute = Literal[
    "red",
    "blue",
    "green",
    "yellow",
    "orange",
    "purple",
    "pink",
    "black",
    "white",
    "gray",
    "brown",
    "jacket",
    "shirt",
    "pants",
    "shorts",
    "hat",
    "helmet",
    "backpack",
    "moving",
    "stationary",
    "open",
    "closed",
]
EventType = Literal[
    "person_visible",
    "vehicle_visible",
    "animal_visible",
    "walking",
    "running",
    "cycling",
    "object_carried",
    "door_movement",
]
UNSAFE = re.compile(
    r"\b(face recognition|identity matching|male|female|man|woman|boy|girl|child|"
    r"elderly|teenager|young|adult|older|senior|middle[- ]aged|age|gender|"
    r"masculine|feminine|criminal|burglar|thief|suspect|suspicious|stealing|ethnicity|race)\b",
    re.I,
)


class Strict(c.WireModel):
    model_config = ConfigDict(extra="forbid", strict=True)


Color = Literal[
    "red", "blue", "green", "yellow", "orange", "purple", "pink", "black", "white", "gray", "brown"
]


class Apparel(Strict):
    kind: Literal["jacket", "shirt", "pants", "shorts", "hat", "helmet", "backpack"]
    colors: list[Color] = Field(max_length=5)


class ObjectConstraint(Strict):
    category: Category
    attributes: list[Attribute] = Field(max_length=12)
    apparel: list[Apparel] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def color_binding(self):
        colors = {
            "red",
            "blue",
            "green",
            "yellow",
            "orange",
            "purple",
            "pink",
            "black",
            "white",
            "gray",
            "brown",
        }
        clothes = {"jacket", "shirt", "pants", "shorts", "hat", "helmet", "backpack"}
        if (
            self.category == "person"
            and colors.intersection(self.attributes)
            and clothes.intersection(self.attributes)
        ):
            raise PydanticCustomError(
                "apparel_color_binding", "Bind apparel colors to a specific garment"
            )
        return self


class VisibleObject(ObjectConstraint):
    evidence: str = Field(min_length=1, max_length=500)


class Observation(Strict):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    caption: str = Field(min_length=1, max_length=1000)
    evidence: str = Field(min_length=1, max_length=1500)
    objects: list[VisibleObject] = Field(max_length=20)
    event_types: list[EventType] = Field(max_length=8)
    uncertainty: Literal["low", "medium", "high"]
    uncertainty_notes: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def supported(self):
        if self.end_ms <= self.start_ms:
            raise PydanticCustomError("observation_interval", "Invalid observation interval")
        if UNSAFE.search(
            " ".join(
                [
                    self.caption,
                    self.evidence,
                    self.uncertainty_notes,
                    *(obj.evidence for obj in self.objects),
                ]
            )
        ):
            raise PydanticCustomError("unsupported_inference", "Unsupported inference")
        return self


class VideoAnalysis(Strict):
    observations: list[Observation] = Field(max_length=20)


class SearchIntent(Strict):
    camera_names: list[str] = Field(max_length=16)
    start: c.AwareDatetime | None = Field(
        description="JSON null unless specified; otherwise an ISO 8601 UTC instant. "
        "Never an empty string."
    )
    end: c.AwareDatetime | None = Field(
        description="JSON null unless specified; otherwise an ISO 8601 UTC instant. "
        "Never an empty string."
    )
    objects: list[ObjectConstraint] = Field(max_length=8)
    event_types: list[EventType] = Field(max_length=8)
    motion_only: bool
    keywords: list[str] = Field(max_length=12)
    unsupported_reason: (
        Literal["identity", "demographics", "intent", "ambiguous_time", "unsupported_constraint"]
        | None
    ) = Field(
        description="JSON null for a supported request. Never use strings 'none', 'null' or ''. "
        "Otherwise choose exactly one of the enumerated unsupported reasons."
    )

    @field_validator("camera_names", "keywords")
    @classmethod
    def bounded_text(cls, values):
        if any(
            not item.strip() or len(item) > 100 or any(ord(c) < 32 for c in item) for item in values
        ):
            raise ValueError("Invalid search term")
        return values

    @model_validator(mode="after")
    def ordered(self):
        if self.start and self.end and self.start >= self.end:
            raise ValueError("Invalid time range")
        return self


class SearchRequest(c.SearchRequest):
    curated_only: bool = False
    timezone: str = Field(default="UTC", max_length=80)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Use an IANA timezone") from None
        return value


class StructuredSearch(SearchIntent):
    curated_only: bool = False
    camera_ids: list[UUID] = Field(default_factory=list, max_length=16)
    limit: int = Field(default=10, ge=1, le=50)


class SegmentIndex(c.WireModel):
    segment_id: UUID
    state: Literal["waiting", "queued", "running", "succeeded", "failed", "cancelled"]
    pipeline_version: str
    analyzed_start_ms: int | None
    analyzed_end_ms: int | None
    error_code: str | None
    processing_ms: int


class Usage(c.WireModel):
    requests: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    bytes_uploaded: int = 0
    reserved_usd: float = 0
    estimated_usd: float | None = None
    billing: Literal["unknown"] = "unknown"
    daily_request_limit: int | None = None
    daily_limit_usd: float | None = None
    admission_used_usd: float | None = None
    admission_remaining_usd: float | None = None
    remaining_requests: int | None = None
    admission_enabled: bool | None = None
    observed_at: c.AwareDatetime | None = None
    latest_usage_at: c.AwareDatetime | None = None
    billing_updated_at: c.AwareDatetime | None = None


class AnalysisJob(c.AnalysisJob):
    pipeline_version: str
    selected_segments: int
    selected_duration_ms: int
    processing_ms: int
    segments: list[SegmentIndex]
    usage: Usage


class RecordingIndex(c.WireModel):
    recording_id: UUID
    items: list[SegmentIndex]


class Evidence(c.WireModel):
    metadata_id: UUID | None
    event_id: UUID | None = None
    kind: Literal["recording_interval"] = "recording_interval"
    recording_id: UUID
    segment_id: UUID
    start_offset_ms: int
    end_offset_ms: int
    boundary_accuracy: Literal["model_estimated_within_verified_clip", "sampled_pixel_change"] = (
        "model_estimated_within_verified_clip"
    )


class PlaybackRequest(c.PlaybackRequest):
    segment_id: UUID | None = None


class SearchHit(c.SearchHit):
    action: RuntimeNavigationAction
    camera_name: str
    metadata_id: UUID | None
    objects: list[VisibleObject]
    event_types: list[EventType]
    uncertainty: Literal["low", "medium", "high"]
    uncertainty_notes: str
    prompt_version: str
    schema_version: str
    provenance: dict
    evidence: Evidence
    playback_request: PlaybackRequest


class SearchResponse(c.SearchResponse):
    items: list[SearchHit]
    explanation: str
    constraints: StructuredSearch
    available_ms: int
    analyzed_ms: int
    latency_ms: int


class ActivityBucket(c.ActivityBucket):
    analyzed_ms: int
    motion_ms: int
    motion_sampled_ms: int
    event_density_per_minute: float
    playback: list[RuntimeNavigationAction]


class ActivityHistogram(c.ActivityHistogram):
    buckets: list[ActivityBucket]
    motion_definition: str = "Low-resolution pixel change; not object or intent recognition."
    event_definition: str = "Muse observation occurrences counted once at their start."
