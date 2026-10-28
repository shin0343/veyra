"""Additive Phase 04 runtime types; frozen frontend contracts remain reproducible."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from . import contracts as c


class RuntimeRecordingTarget(c.RecordingTarget):
    segment_id: UUID | None = None


RuntimeNavigationTarget = Annotated[
    c.FeatureTarget | c.LayoutTarget | c.CameraTarget | RuntimeRecordingTarget,
    Field(discriminator="kind"),
]


class RuntimeNavigationAction(c.NavigationAction):
    target: RuntimeNavigationTarget


class RuntimeActionSucceeded(c.ActionSucceeded):
    navigation: RuntimeNavigationAction | None = None


RuntimeActionResult = Annotated[
    RuntimeActionSucceeded | c.ActionNeedsConfirmation | c.ActionFailed,
    Field(discriminator="status"),
]


class CameraDescriptor(c.WireModel):
    id: UUID
    name: str
    enabled: bool
    status: Literal["unknown", "online", "offline", "error", "disabled"]
    group_name: str | None
    location: str | None


class Capability(c.Capability):
    backend_handler: str
    navigation_destination: Literal["feature", "camera_live", "layout", "recording"] | None
    availability: Literal["available"] = "available"


class CapabilityList(c.WireModel):
    items: list[Capability]


class LayoutProposal(c.WireModel):
    confirmation: c.Confirmation
    tool_name: Literal["layouts.create"] = "layouts.create"
    layout: c.LayoutCreate
    cameras: list[CameraDescriptor]


class VerifiedResult(c.WireModel):
    tool_call_id: str
    tool_name: Literal["layouts.create"] = "layouts.create"
    resource_id: UUID
    verification: Literal["database_read_after_commit"] = "database_read_after_commit"
    layout: c.Layout


class AgentResponse(c.AgentResponse):
    interaction_state: Literal[
        "answered",
        "clarification_required",
        "awaiting_confirmation",
        "completed_verified",
        "committed_unverified",
        "rejected",
        "cancelled",
        "failed",
    ] = "answered"
    clarification: str | None = None
    actions: list[RuntimeActionResult]
    suggested_actions: list[RuntimeNavigationAction] = Field(default_factory=list)
    navigation_target: RuntimeNavigationTarget | None = None
    confirmation_request: LayoutProposal | None = None
    executed_operations: list[RuntimeActionSucceeded] = Field(default_factory=list)
    verified_results: list[VerifiedResult] = Field(default_factory=list)
    errors: list[c.ErrorDetail] = Field(default_factory=list)
    camera_candidates: list[CameraDescriptor] = Field(default_factory=list)


class ConfirmationDecision(c.ConfirmationDecision):
    model_config = ConfigDict(extra="forbid", strict=True)
