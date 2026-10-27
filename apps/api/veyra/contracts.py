"""Frozen v0.1.0 wire contract. Product endpoints are explicitly contract-only in Phase 01."""

from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorDetail(WireModel):
    code: str
    message: str
    retryable: bool = False
    fields: list[str] = Field(default_factory=list)


class ErrorResponse(WireModel):
    request_id: UUID
    error: ErrorDetail


class Health(WireModel):
    status: Literal["ok", "ready"]
    version: Literal["0.1.0"] = "0.1.0"


class CameraCreate(WireModel):
    name: str = Field(min_length=1, max_length=100)
    source_id: str = Field(pattern=r"^[a-z0-9_-]{1,64}$")
    cloud_analysis_allowed: bool = False


class CameraUpdate(WireModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    enabled: bool | None = None
    cloud_analysis_allowed: bool | None = None


class Camera(WireModel):
    id: UUID
    name: str
    source_id: str
    enabled: bool
    cloud_analysis_allowed: bool
    status: Literal["unknown", "online", "offline", "error", "disabled"]
    last_observed_at: AwareDatetime | None
    created_at: AwareDatetime


class CameraList(WireModel):
    items: list[Camera]


class CameraSource(WireModel):
    id: str
    mode: Literal["pull", "publisher"]


class CameraSourceList(WireModel):
    items: list[CameraSource]


class LayoutCell(WireModel):
    position: int = Field(ge=0, le=8)
    camera_id: UUID


class LayoutCreate(WireModel):
    name: str = Field(min_length=1, max_length=100)
    columns: Literal[1, 2, 3]
    cells: list[LayoutCell] = Field(min_length=1, max_length=9)

    @model_validator(mode="after")
    def unique_cells(self) -> "LayoutCreate":
        if len({c.position for c in self.cells}) != len(self.cells):
            raise ValueError("cell positions must be unique")
        if len({c.camera_id for c in self.cells}) != len(self.cells):
            raise ValueError("camera IDs must be unique")
        return self


class LayoutReplace(LayoutCreate):
    expected_version: int = Field(ge=1)


class Layout(LayoutCreate):
    id: UUID
    version: int = Field(ge=1)
    created_at: AwareDatetime
    updated_at: AwareDatetime


class LayoutList(WireModel):
    items: list[Layout]


class Recording(WireModel):
    id: UUID
    camera_id: UUID
    started_at: AwareDatetime
    ended_at: AwareDatetime | None
    status: Literal["recording", "ready", "failed", "deleted"]
    available_duration_ms: int = Field(ge=0)


class RecordingList(WireModel):
    items: list[Recording]
    next_cursor: str | None


class Segment(WireModel):
    id: UUID
    recording_id: UUID
    started_at: AwareDatetime
    duration_ms: int = Field(gt=0)
    offset_ms: int = Field(ge=0)
    status: Literal["ready", "deleted", "failed"]


class SegmentList(WireModel):
    items: list[Segment]


class PlaybackRequest(WireModel):
    recording_id: UUID
    offset_ms: int = Field(ge=0)
    duration_ms: int = Field(default=30000, ge=1000, le=300000)


class MediaSession(WireModel):
    id: UUID
    transport: Literal["hls", "mp4"]
    url: str = Field(pattern=r"^/api/v1/media/sessions/")
    expires_at: AwareDatetime
    # The media starts here, not necessarily at the requested offset (keyframe alignment).
    actual_start_offset_ms: int = Field(ge=0)
    seek_offset_ms: int = Field(ge=0)


FeatureId = Literal["live", "cameras", "layouts", "recordings", "search", "events"]


class FeatureTarget(WireModel):
    kind: Literal["feature"] = "feature"
    feature_id: FeatureId


class LayoutTarget(WireModel):
    kind: Literal["layout"] = "layout"
    layout_id: UUID


class CameraTarget(WireModel):
    kind: Literal["camera_live"] = "camera_live"
    camera_id: UUID


class RecordingTarget(WireModel):
    kind: Literal["recording"] = "recording"
    recording_id: UUID
    offset_ms: int = Field(ge=0)


NavigationTarget = Annotated[
    FeatureTarget | LayoutTarget | CameraTarget | RecordingTarget, Field(discriminator="kind")
]


class NavigationAction(WireModel):
    kind: Literal["navigate"] = "navigate"
    label: str
    target: NavigationTarget


class Feature(WireModel):
    id: FeatureId
    title: str
    description: str
    keywords: list[str]
    implemented: bool
    action: NavigationAction


class FeatureList(WireModel):
    items: list[Feature]


class Event(WireModel):
    id: UUID
    camera_id: UUID
    recording_id: UUID
    segment_id: UUID
    kind: Literal["motion", "observation"]
    started_at: AwareDatetime
    ended_at: AwareDatetime
    summary: str
    provenance: Literal["ffmpeg_motion", "muse"]
    model_id: str | None
    evidence_offset_ms: int = Field(ge=0)


class EventList(WireModel):
    items: list[Event]
    next_cursor: str | None


class ActivityBucket(WireModel):
    start: AwareDatetime
    end: AwareDatetime
    event_count: int = Field(ge=0)
    coverage_ms: int = Field(ge=0)


class ActivityHistogram(WireModel):
    camera_id: UUID
    buckets: list[ActivityBucket]


class SearchRequest(WireModel):
    query: str = Field(min_length=1, max_length=2000)
    camera_ids: list[UUID] = Field(default_factory=list, max_length=16)
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None
    limit: int = Field(default=10, ge=1, le=50)

    @model_validator(mode="after")
    def ordered_window(self) -> "SearchRequest":
        if self.start and self.end and self.start >= self.end:
            raise ValueError("start must precede end")
        return self


class SearchHit(WireModel):
    segment_id: UUID
    camera_id: UUID
    recording_id: UUID
    start: AwareDatetime
    end: AwareDatetime
    offset_ms: int = Field(ge=0)
    summary: str
    evidence_text: str
    model_id: str
    indexed_at: AwareDatetime
    relevance: float = Field(
        ge=0, le=1, description="Rank normalized within response, not confidence"
    )
    action: NavigationAction


class SearchResponse(WireModel):
    query: str
    retrieval: Literal["postgres_fts"] = "postgres_fts"
    coverage: Literal["none", "partial", "complete"]
    items: list[SearchHit]


class AnalysisJobCreate(WireModel):
    recording_id: UUID
    # Explicitly acknowledge cloud transfer; camera consent must also be true.
    allow_cloud_upload: Literal[True]


class AnalysisJob(WireModel):
    id: UUID
    recording_id: UUID
    state: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    progress: float = Field(ge=0, le=1)
    attempts: int = Field(ge=0)
    error: ErrorDetail | None
    created_at: AwareDatetime
    updated_at: AwareDatetime


class Rule(WireModel):
    id: UUID
    name: str
    camera_id: UUID
    kind: Literal["motion"]
    enabled: bool


class RuleList(WireModel):
    items: list[Rule]


Permission = Literal["vms:read", "layouts:write", "analysis:write"]


class Capability(WireModel):
    name: str
    description: str
    permission: Permission
    effect: Literal["read", "navigation", "write"]
    confirmation: Literal["never", "explicit_request", "always"]
    implemented: bool
    input_schema: dict[str, Any]


class CapabilityList(WireModel):
    items: list[Capability]


class AgentMessage(WireModel):
    conversation_id: UUID | None = None
    message: str = Field(min_length=1, max_length=4000)


class Confirmation(WireModel):
    id: UUID
    summary: str
    expires_at: AwareDatetime


class ActionSucceeded(WireModel):
    status: Literal["succeeded"] = "succeeded"
    tool_call_id: str
    tool_name: str
    message: str
    resource_id: UUID | None = None
    navigation: NavigationAction | None = None


class ActionNeedsConfirmation(WireModel):
    status: Literal["confirmation_required"] = "confirmation_required"
    tool_call_id: str
    tool_name: str
    confirmation: Confirmation


class ActionFailed(WireModel):
    status: Literal["failed"] = "failed"
    tool_call_id: str
    tool_name: str
    error: ErrorDetail


ActionResult = Annotated[
    ActionSucceeded | ActionNeedsConfirmation | ActionFailed, Field(discriminator="status")
]


class AgentResponse(WireModel):
    conversation_id: UUID
    run_id: UUID
    status: Literal["completed", "awaiting_confirmation", "failed"]
    message: str
    actions: list[ActionResult]


class ConfirmationDecision(WireModel):
    approved: bool
