from typing import Literal, Self

from pydantic import Field, model_validator

from . import contracts as c


class CameraCreate(c.CameraCreate):
    group_name: str | None = Field(default=None, min_length=1, max_length=100)
    location: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def normalize(self) -> Self:
        for field in ("name", "group_name", "location"):
            value = getattr(self, field)
            if value is not None:
                if not value.strip():
                    raise ValueError("names cannot be blank")
                setattr(self, field, value.strip())
        return self


class CameraUpdate(c.CameraUpdate):
    group_name: str | None = Field(default=None, min_length=1, max_length=100)
    location: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def normalize(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field is required")
        for field in self.model_fields_set:
            value = getattr(self, field)
            if value is None and field not in {"group_name", "location"}:
                raise ValueError("null is not a change")
            if isinstance(value, str):
                if not value.strip():
                    raise ValueError("names cannot be blank")
                setattr(self, field, value.strip())
        return self


class Camera(c.Camera):
    video_width: int | None = Field(default=None, gt=0, le=8192)
    video_height: int | None = Field(default=None, gt=0, le=8192)
    group_name: str | None = None
    location: str | None = None
    connection_error: c.ErrorDetail | None = None
    source_media: "SourceMedia | None" = None


class CameraList(c.WireModel):
    items: list[Camera]


class SourceMedia(c.WireModel):
    kind: Literal["prerecorded", "synthetic"]
    asset_id: str = Field(pattern=r"^[a-z0-9_-]{1,64}$")
    title: str = Field(min_length=1, max_length=200)
    creator: str = Field(min_length=1, max_length=200)
    source_url: str | None = Field(default=None, pattern=r"^https://")
    license: str = Field(min_length=1, max_length=100)
    license_url: str | None = Field(default=None, pattern=r"^https://")
    changes: str = Field(max_length=500)
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class CameraSource(c.CameraSource):
    label: str | None = None
    source_media: SourceMedia | None = None


class CameraSourceList(c.WireModel):
    items: list[CameraSource]


class Recording(c.Recording):
    source_media: SourceMedia | None = None


class RecordingList(c.WireModel):
    items: list[Recording]
    next_cursor: str | None = None
