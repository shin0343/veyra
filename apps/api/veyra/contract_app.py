"""Runnable foundation. Product operations stay explicit 501s until their workstream ships."""

import secrets
from typing import Annotated
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi import Path as PathParam
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import contracts as c
from .registry import CAPABILITIES, discover_features
from .settings import get_settings

security = HTTPBearer(auto_error=False)


def require_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> str:
    token = get_settings().veyra_dev_token.get_secret_value()
    if not token or token == "replace-with-a-long-random-local-token":
        raise HTTPException(503, "AUTH_NOT_CONFIGURED")
    if credentials is None or not secrets.compare_digest(credentials.credentials, token):
        raise HTTPException(401, "UNAUTHORIZED")
    return "local-operator"


ERRORS = {
    401: {"model": c.ErrorResponse, "description": "Missing or invalid bearer token"},
    403: {"model": c.ErrorResponse, "description": "Operation or resource not permitted"},
    404: {"model": c.ErrorResponse, "description": "Resource unavailable to principal"},
    409: {"model": c.ErrorResponse, "description": "Version or idempotency conflict"},
    422: {"model": c.ErrorResponse, "description": "Invalid typed request"},
    501: {"model": c.ErrorResponse, "description": "Contract-only in Phase 01"},
    503: {"model": c.ErrorResponse, "description": "Required dependency unavailable"},
    500: {"model": c.ErrorResponse, "description": "Unexpected internal error"},
}

app = FastAPI(
    title="Veyra API",
    version="0.1.0",
    responses=ERRORS,
    description="Frozen Phase 01 contract. Routes marked contract-only return 501.",
)


@app.middleware("http")
async def request_identity(request: Request, call_next):
    request.state.request_id = uuid4()
    try:
        response = await call_next(request)
    except Exception:
        response = error_response(request, 500, "INTERNAL_ERROR")
    response.headers["X-Request-ID"] = str(request.state.request_id)
    response.headers["Cache-Control"] = "no-store"
    return response


def error_response(request: Request, status: int, code: str, fields=None) -> JSONResponse:
    body = c.ErrorResponse(
        request_id=getattr(request.state, "request_id", uuid4()),
        error=c.ErrorDetail(
            code=code,
            message={
                "NOT_IMPLEMENTED": "This operation is contract-only in Phase 01.",
                "VALIDATION_ERROR": "Request does not match the API contract.",
                "AUTH_NOT_CONFIGURED": "Set a private local development token on the server.",
                "DEPENDENCY_UNAVAILABLE": "The required service is unavailable.",
            }.get(code, "The request could not be authorized or completed."),
            retryable=status == 503 and code != "AUTH_NOT_CONFIGURED",
            fields=fields or [],
        ),
    )
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"), headers=headers)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    code = str(exc.detail) if isinstance(exc, HTTPException) else "NOT_FOUND"
    return error_response(request, exc.status_code, code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not echo raw request values; source credentials may appear in rejected input.
    fields = [".".join(map(str, error["loc"])) for error in exc.errors()]
    return error_response(request, 422, "VALIDATION_ERROR", fields)


@app.get("/health/live", response_model=c.Health, operation_id="healthLive", tags=["health"])
def health_live():
    return c.Health(status="ok")


@app.get("/health/ready", response_model=c.Health, operation_id="healthReady", tags=["health"])
def health_ready():
    try:
        with psycopg.connect(
            get_settings().database_url.get_secret_value(),
            connect_timeout=2,
            options="-c statement_timeout=2000",
        ) as connection:
            # Check migration presence as well as connectivity, never silently create tables.
            row = connection.execute(
                "SELECT version FROM schema_migrations WHERE version = '001_initial'"
            ).fetchone()
            if row is None:
                raise HTTPException(503, "DEPENDENCY_UNAVAILABLE")
    except psycopg.Error:
        raise HTTPException(503, "DEPENDENCY_UNAVAILABLE") from None
    return c.Health(status="ready")


router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_principal)])
Idempotency = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)]
Cursor = Annotated[str | None, Query(max_length=512)]
PageLimit = Annotated[int, Query(ge=1, le=100)]


def pending():
    raise HTTPException(501, "NOT_IMPLEMENTED")


@router.get("/features", response_model=c.FeatureList, operation_id="listFeatures", tags=["agent"])
def features(query: Annotated[str | None, Query(max_length=200)] = None):
    return c.FeatureList(items=discover_features(query))


@router.get(
    "/agent/capabilities",
    response_model=c.CapabilityList,
    operation_id="listCapabilities",
    tags=["agent"],
)
def capabilities():
    return c.CapabilityList(items=CAPABILITIES)


@router.get(
    "/camera-sources",
    response_model=c.CameraSourceList,
    operation_id="listCameraSources",
    tags=["cameras"],
    summary="List sources (contract-only)",
)
def camera_sources():
    pending()


@router.get(
    "/cameras",
    response_model=c.CameraList,
    operation_id="listCameras",
    tags=["cameras"],
    summary="List cameras (contract-only)",
)
def cameras():
    pending()


@router.post(
    "/cameras",
    response_model=c.Camera,
    status_code=201,
    operation_id="createCamera",
    tags=["cameras"],
    summary="Register camera (contract-only)",
)
def create_camera(body: c.CameraCreate, idempotency_key: Idempotency):
    pending()


@router.get(
    "/cameras/{camera_id}",
    response_model=c.Camera,
    operation_id="getCamera",
    tags=["cameras"],
    summary="Get camera (contract-only)",
)
def camera(camera_id: UUID):
    pending()


@router.patch(
    "/cameras/{camera_id}",
    response_model=c.Camera,
    operation_id="updateCamera",
    tags=["cameras"],
    summary="Update camera (contract-only)",
)
def update_camera(camera_id: UUID, body: c.CameraUpdate, idempotency_key: Idempotency):
    pending()


@router.post(
    "/cameras/{camera_id}/live-session",
    response_model=c.MediaSession,
    operation_id="createLiveSession",
    tags=["media"],
    summary="Create short-lived authorized media session (contract-only)",
)
def live_session(camera_id: UUID):
    pending()


@router.get(
    "/layouts",
    response_model=c.LayoutList,
    operation_id="listLayouts",
    tags=["layouts"],
    summary="List layouts (contract-only)",
)
def layouts():
    pending()


@router.post(
    "/layouts",
    response_model=c.Layout,
    status_code=201,
    operation_id="createLayout",
    tags=["layouts"],
    summary="Save layout (contract-only)",
)
def create_layout(body: c.LayoutCreate, idempotency_key: Idempotency):
    pending()


@router.get(
    "/layouts/{layout_id}",
    response_model=c.Layout,
    operation_id="getLayout",
    tags=["layouts"],
    summary="Get layout (contract-only)",
)
def layout(layout_id: UUID):
    pending()


@router.put(
    "/layouts/{layout_id}",
    response_model=c.Layout,
    operation_id="replaceLayout",
    tags=["layouts"],
    summary="Replace layout with version check (contract-only)",
)
def replace_layout(layout_id: UUID, body: c.LayoutReplace, idempotency_key: Idempotency):
    pending()


@router.get(
    "/recordings",
    response_model=c.RecordingList,
    operation_id="listRecordings",
    tags=["recordings"],
    summary="List recordings (contract-only)",
)
def recordings(
    camera_id: UUID | None = None,
    start: c.AwareDatetime | None = None,
    end: c.AwareDatetime | None = None,
    cursor: Cursor = None,
    limit: PageLimit = 50,
):
    pending()


@router.get(
    "/recordings/{recording_id}",
    response_model=c.Recording,
    operation_id="getRecording",
    tags=["recordings"],
    summary="Get recording (contract-only)",
)
def recording(recording_id: UUID):
    pending()


@router.get(
    "/recordings/{recording_id}/segments",
    response_model=c.SegmentList,
    operation_id="listSegments",
    tags=["recordings"],
    summary="List finalized segments (contract-only)",
)
def segments(recording_id: UUID):
    pending()


@router.post(
    "/playback-sessions",
    response_model=c.MediaSession,
    operation_id="createPlaybackSession",
    tags=["media"],
    summary="Resolve playback window (contract-only)",
)
def playback_session(body: c.PlaybackRequest):
    pending()


@router.get(
    "/media/sessions/{session_id}/{resource}",
    response_class=Response,
    operation_id="readMediaResource",
    tags=["media"],
    summary="Read session-bound manifest or media bytes (contract-only)",
    responses={
        200: {
            "description": "Authorized bytes; supports Range for MP4",
            "content": {"video/mp4": {}, "application/vnd.apple.mpegurl": {}, "video/mp2t": {}},
        },
        206: {"description": "Partial byte range"},
        416: {"model": c.ErrorResponse, "description": "Invalid byte range"},
    },
)
def read_media(
    session_id: UUID,
    resource: Annotated[str, PathParam(pattern=r"^[a-zA-Z0-9_-]+\.(m3u8|mp4|m4s|ts)$")],
    range_header: Annotated[str | None, Header(alias="Range", max_length=100)] = None,
):
    pending()


@router.get(
    "/events",
    response_model=c.EventList,
    operation_id="listEvents",
    tags=["events"],
    summary="List grounded events (contract-only)",
)
def events(
    camera_id: UUID | None = None,
    start: c.AwareDatetime | None = None,
    end: c.AwareDatetime | None = None,
    cursor: Cursor = None,
    limit: PageLimit = 50,
):
    pending()


@router.get(
    "/cameras/{camera_id}/activity",
    response_model=c.ActivityHistogram,
    operation_id="getActivity",
    tags=["events"],
    summary="Activity histogram (contract-only)",
)
def activity(
    camera_id: UUID,
    start: c.AwareDatetime,
    end: c.AwareDatetime,
    bucket_seconds: Annotated[int, Query(ge=10, le=3600)] = 60,
):
    pending()


@router.post(
    "/search",
    response_model=c.SearchResponse,
    operation_id="searchVideo",
    tags=["search"],
    summary="Search indexed video (contract-only)",
)
def search(body: c.SearchRequest):
    pending()


@router.post(
    "/analysis-jobs",
    response_model=c.AnalysisJob,
    status_code=202,
    operation_id="createAnalysisJob",
    tags=["analysis"],
    summary="Enqueue consented cloud analysis (contract-only)",
)
def create_analysis(body: c.AnalysisJobCreate, idempotency_key: Idempotency):
    pending()


@router.get(
    "/analysis-jobs/{job_id}",
    response_model=c.AnalysisJob,
    operation_id="getAnalysisJob",
    tags=["analysis"],
    summary="Poll analysis job (contract-only)",
)
def analysis_job(job_id: UUID):
    pending()


@router.get(
    "/rules",
    response_model=c.RuleList,
    operation_id="listRules",
    tags=["events"],
    summary="Reserved rule listing (contract-only, secondary scope)",
)
def rules():
    pending()


@router.post(
    "/agent/messages",
    response_model=c.AgentResponse,
    operation_id="sendAgentMessage",
    tags=["agent"],
    summary="Run bounded Muse tool loop (contract-only)",
)
def agent_message(body: c.AgentMessage, idempotency_key: Idempotency):
    pending()


@router.post(
    "/agent/confirmations/{confirmation_id}",
    response_model=c.AgentResponse,
    operation_id="decideConfirmation",
    tags=["agent"],
    summary="Approve or reject a bound action (contract-only)",
)
def confirm(confirmation_id: UUID, body: c.ConfirmationDecision, idempotency_key: Idempotency):
    pending()


app.include_router(router)
