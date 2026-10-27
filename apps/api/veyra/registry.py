"""Static capabilities: discoverable contracts, not a general-purpose execution interface."""

from uuid import UUID

from pydantic import Field

from .contracts import (
    Capability,
    Feature,
    FeatureId,
    FeatureTarget,
    LayoutCreate,
    NavigationAction,
    RecordingTarget,
    SearchRequest,
    WireModel,
)


class DiscoverInput(WireModel):
    query: str = Field(min_length=1, max_length=200)


class EmptyInput(WireModel):
    pass


class NavigateInput(WireModel):
    feature_id: FeatureId


class OpenRecordingInput(WireModel):
    recording_id: UUID
    offset_ms: int = Field(ge=0)


FEATURES = [
    Feature(
        id=feature_id,
        title=title,
        description=description,
        keywords=keywords,
        implemented=False,
        action=NavigationAction(label=f"Open {title}", target=FeatureTarget(feature_id=feature_id)),
    )
    for feature_id, title, description, keywords in [
        ("live", "Live view", "Watch authorized cameras together.", ["watch", "stream", "live"]),
        ("cameras", "Cameras", "Register approved camera sources.", ["add", "camera", "register"]),
        ("layouts", "Layouts", "Save camera arrangements.", ["grid", "layout", "multi-camera"]),
        (
            "recordings",
            "Recordings",
            "Review recorded footage.",
            ["playback", "timeline", "history"],
        ),
        ("search", "Video search", "Find indexed video with natural language.", ["find", "search"]),
        ("events", "Activity", "Review grounded observations.", ["event", "activity", "motion"]),
    ]
]

CAPABILITIES = [
    Capability(
        name=name,
        description=description,
        permission=permission,
        effect=effect,
        confirmation=confirmation,
        implemented=implemented,
        input_schema=model.model_json_schema(),
    )
    for name, description, permission, effect, confirmation, implemented, model in [
        (
            "features.discover",
            "Find UI features from the static catalog.",
            "vms:read",
            "read",
            "never",
            True,
            DiscoverInput,
        ),
        (
            "features.navigate",
            "Propose navigation to a known feature.",
            "vms:read",
            "navigation",
            "never",
            False,
            NavigateInput,
        ),
        (
            "cameras.list",
            "List cameras visible to this principal.",
            "vms:read",
            "read",
            "never",
            False,
            EmptyInput,
        ),
        (
            "layouts.create",
            "Create a saved camera layout.",
            "layouts:write",
            "write",
            "explicit_request",
            False,
            LayoutCreate,
        ),
        (
            "video.search",
            "Search indexed, consented recording metadata.",
            "vms:read",
            "read",
            "never",
            False,
            SearchRequest,
        ),
        (
            "recordings.open",
            "Propose playback of an authorized recording at an offset.",
            "vms:read",
            "navigation",
            "never",
            False,
            OpenRecordingInput,
        ),
    ]
]


def discover_features(query: str | None = None) -> list[Feature]:
    if not query:
        return FEATURES
    words = query.casefold().split()
    return [
        feature
        for feature in FEATURES
        if any(
            word in " ".join([feature.title, feature.description, *feature.keywords]).casefold()
            for word in words
        )
    ]


def recording_navigation(recording_id: UUID, offset_ms: int) -> NavigationAction:
    return NavigationAction(
        label="Play recording",
        target=RecordingTarget(recording_id=recording_id, offset_ms=offset_ms),
    )
