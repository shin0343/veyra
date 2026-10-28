"""Local single-workspace VMS with a bounded Muse application control plane."""

import json
import logging
import secrets
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Depends, FastAPI, Header, Query, Request
from fastapi import Path as PathParam
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import (
    agent_models,
    agent_tools,
    explore,
    index_models,
    index_store,
    models,
    retrieval,
    store,
)
from . import contracts as c
from .agent import Agent
from .config import Settings, SourceRegistry
from .contract_app import router as frozen_router
from .db import Database, Problem
from .media_client import MediaClient
from .pipeline import Pipeline
from .sessions import Sessions

logger = logging.getLogger("veyra")
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())
logger.setLevel(logging.INFO)
logger.propagate = False
security = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app):
    settings = Settings()
    app.state.settings = settings
    app.state.sources = SourceRegistry(settings)
    app.state.database = Database(settings.database_url.get_secret_value())
    app.state.agent = Agent(settings, app.state.database)
    app.state.search = retrieval.SearchService(settings, app.state.database)
    app.state.media = MediaClient(settings)
    app.state.sessions = Sessions(settings, app.state.database, app.state.media)
    app.state.pipeline = Pipeline(settings, app.state.database, app.state.sources, app.state.media)
    app.state.pipeline.start()
    yield
    app.state.pipeline.stop()
    app.state.media.close()


ERRORS = {
    status: {"model": c.ErrorResponse} for status in [401, 403, 404, 409, 416, 422, 500, 501, 503]
}

app = FastAPI(
    title="Veyra API",
    version="0.1.0",
    lifespan=lifespan,
    responses=ERRORS,
    description="Phase 05 consented video indexing, grounded search and activity data.",
)


def error_response(request, status, code, message, retryable=False, fields=None):
    content = c.ErrorResponse(
        request_id=getattr(request.state, "request_id", uuid4()),
        error=c.ErrorDetail(code=code, message=message, retryable=retryable, fields=fields or []),
    )
    return JSONResponse(
        content.model_dump(mode="json"),
        status_code=status,
        headers={"WWW-Authenticate": "Bearer"} if status == 401 else None,
    )


@app.middleware("http")
async def identify(request: Request, call_next):
    request.state.request_id = uuid4()
    try:
        response = await call_next(request)
    except Exception as error:
        logger.error(
            json.dumps(
                {
                    "event": "request_failed",
                    "error_type": type(error).__name__,
                    "request_id": str(request.state.request_id),
                }
            )
        )
        response = error_response(
            request, 500, "INTERNAL_ERROR", "This request could not be completed."
        )
    response.headers["X-Request-ID"] = str(request.state.request_id)
    response.headers["Cache-Control"] = "private, no-store"
    return response


@app.exception_handler(Problem)
async def problem(request: Request, exc: Problem):
    return error_response(request, exc.status, exc.code, exc.message, exc.retryable)


@app.exception_handler(psycopg.Error)
async def database_error(request: Request, exc: psycopg.Error):
    # Never emit SQL, DSNs, credentials or driver messages.
    logger.warning(json.dumps({"event": "database_unavailable", "error_type": type(exc).__name__}))
    return error_response(
        request, 503, "DATABASE_UNAVAILABLE", "Database storage is unavailable.", True
    )


@app.exception_handler(RequestValidationError)
async def validation(request: Request, exc: RequestValidationError):
    return error_response(
        request,
        422,
        "VALIDATION_ERROR",
        "Request does not match the API contract.",
        fields=[".".join(map(str, e["loc"])) for e in exc.errors()],
    )


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    code = "NOT_IMPLEMENTED" if exc.status_code == 501 else "NOT_FOUND"
    return error_response(
        request,
        exc.status_code,
        code,
        "This operation is not implemented."
        if exc.status_code == 501
        else "The requested resource is not available.",
    )


def require_principal(
    request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]
) -> str:
    settings = request.app.state.settings
    token = settings.veyra_dev_token.get_secret_value()
    if not token or token == "replace-with-a-long-random-local-token":
        raise Problem(503, "AUTH_NOT_CONFIGURED", "Configure a private server-side operator token.")
    supplied = credentials.credentials if credentials else ""
    if secrets.compare_digest(supplied, token):
        return "local-operator"
    viewer = settings.veyra_viewer_token.get_secret_value()
    if viewer and secrets.compare_digest(supplied, viewer):
        return "local-viewer"
    raise Problem(401, "UNAUTHORIZED", "A valid bearer token is required.")


Principal = Annotated[str, Depends(require_principal)]
Idempotency = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)]
Cursor = Annotated[str | None, Query(max_length=512)]
PageLimit = Annotated[int, Query(ge=1, le=100)]
router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_principal)])


def mutate(request, principal, operation, key, payload, callback):
    if principal != "local-operator":
        raise Problem(403, "FORBIDDEN", "This operation requires workspace operator access.")
    status, body = request.app.state.database.mutate(principal, operation, key, payload, callback)
    request.app.state.pipeline.wake()
    return Response(status_code=status) if status == 204 else JSONResponse(body, status_code=status)


@app.get("/health/live", response_model=c.Health, operation_id="healthLive", tags=["health"])
def live():
    return c.Health(status="ok")


@app.get("/health/ready", response_model=c.Health, operation_id="healthReady", tags=["health"])
def ready(request: Request):
    with request.app.state.database.connect() as db:
        if not db.execute(
            "SELECT 1 FROM schema_migrations WHERE version='006_demo_media'"
        ).fetchone():
            raise Problem(503, "DATABASE_UNAVAILABLE", "Apply the VMS database migrations.", True)
    return c.Health(status="ready")


@router.get("/features", response_model=c.FeatureList, operation_id="listFeatures")
def features(query: Annotated[str | None, Query(max_length=200)] = None):
    return c.FeatureList(items=agent_tools.discover_features(query))


@router.get(
    "/agent/capabilities",
    response_model=agent_models.CapabilityList,
    operation_id="listCapabilities",
)
def capabilities():
    return agent_models.CapabilityList(items=[tool.public() for tool in agent_tools.TOOLS.values()])


@router.post(
    "/agent/messages", response_model=agent_models.AgentResponse, operation_id="sendAgentMessage"
)
def agent_message(
    body: c.AgentMessage, idempotency_key: Idempotency, principal: Principal, request: Request
):
    return request.app.state.agent.message(principal, idempotency_key, body)


@router.post(
    "/agent/confirmations/{confirmation_id}",
    response_model=agent_models.AgentResponse,
    operation_id="decideConfirmation",
)
def confirm(
    confirmation_id: UUID,
    body: agent_models.ConfirmationDecision,
    idempotency_key: Idempotency,
    principal: Principal,
    request: Request,
):
    return request.app.state.agent.confirm(principal, confirmation_id, body, idempotency_key)


@router.get(
    "/camera-sources", response_model=models.CameraSourceList, operation_id="listCameraSources"
)
def camera_sources(request: Request):
    return models.CameraSourceList(items=request.app.state.sources.public())


@router.get(
    "/cameras/{camera_id}/thumbnail",
    operation_id="getCameraThumbnail",
    response_class=FileResponse,
    responses={200: {"content": {"image/jpeg": {}}}},
)
def camera_thumbnail(camera_id: UUID, request: Request):
    with request.app.state.database.connect() as db:
        camera = store.get_camera(db, camera_id)
    source = request.app.state.sources.get(camera["source_id"])
    if not source or not source.get("poster"):
        raise Problem(404, "THUMBNAIL_UNAVAILABLE", "No video-derived preview is available.")
    return FileResponse(source["poster"], media_type="image/jpeg")


@router.get("/cameras", response_model=models.CameraList, operation_id="listCameras")
def cameras(request: Request):
    with request.app.state.database.connect() as db:
        rows = store.list_cameras(db)
        return models.CameraList(
            items=[store.camera_model(row, request.app.state.sources) for row in rows]
        )


@router.get("/cameras/{camera_id}", response_model=models.Camera, operation_id="getCamera")
def camera(camera_id: UUID, request: Request):
    with request.app.state.database.connect() as db:
        return store.camera_model(store.get_camera(db, camera_id), request.app.state.sources)


@router.post("/cameras", response_model=models.Camera, status_code=201, operation_id="createCamera")
def create_camera(
    body: models.CameraCreate, idempotency_key: Idempotency, principal: Principal, request: Request
):
    return mutate(
        request,
        principal,
        "createCamera",
        idempotency_key,
        body.model_dump(mode="json"),
        lambda db: store.create_camera(db, body, request.app.state.sources),
    )


@router.patch("/cameras/{camera_id}", response_model=models.Camera, operation_id="updateCamera")
def update_camera(
    camera_id: UUID,
    body: models.CameraUpdate,
    idempotency_key: Idempotency,
    principal: Principal,
    request: Request,
):
    return mutate(
        request,
        principal,
        f"updateCamera:{camera_id}",
        idempotency_key,
        body.model_dump(mode="json", exclude_unset=True),
        lambda db: store.update_camera(db, camera_id, body),
    )


@router.delete("/cameras/{camera_id}", status_code=204, operation_id="deleteCamera")
def delete_camera(
    camera_id: UUID, idempotency_key: Idempotency, principal: Principal, request: Request
):
    return mutate(
        request,
        principal,
        f"deleteCamera:{camera_id}",
        idempotency_key,
        {},
        lambda db: store.delete_camera(db, camera_id),
    )


@router.post(
    "/cameras/{camera_id}/live-session",
    response_model=c.MediaSession,
    operation_id="createLiveSession",
)
def live_session(camera_id: UUID, principal: Principal, request: Request):
    return request.app.state.sessions.live(principal, camera_id)


@router.get("/layouts", response_model=c.LayoutList, operation_id="listLayouts")
def layouts(request: Request):
    with request.app.state.database.connect() as db:
        return c.LayoutList(items=store.list_layouts(db))


@router.get("/layouts/{layout_id}", response_model=c.Layout, operation_id="getLayout")
def layout(layout_id: UUID, request: Request):
    with request.app.state.database.connect() as db:
        return store.get_layout(db, layout_id)


@router.post("/layouts", response_model=c.Layout, status_code=201, operation_id="createLayout")
def create_layout(
    body: c.LayoutCreate, idempotency_key: Idempotency, principal: Principal, request: Request
):
    return mutate(
        request,
        principal,
        "createLayout",
        idempotency_key,
        body.model_dump(mode="json"),
        lambda db: store.save_layout(db, body),
    )


@router.put("/layouts/{layout_id}", response_model=c.Layout, operation_id="replaceLayout")
def replace_layout(
    layout_id: UUID,
    body: c.LayoutReplace,
    idempotency_key: Idempotency,
    principal: Principal,
    request: Request,
):
    return mutate(
        request,
        principal,
        f"replaceLayout:{layout_id}",
        idempotency_key,
        body.model_dump(mode="json"),
        lambda db: store.save_layout(db, body, layout_id),
    )


@router.get("/recordings", response_model=models.RecordingList, operation_id="listRecordings")
def recordings(
    request: Request,
    camera_id: UUID | None = None,
    start: c.AwareDatetime | None = None,
    end: c.AwareDatetime | None = None,
    cursor: Cursor = None,
    limit: PageLimit = 50,
):
    with request.app.state.database.connect() as db:
        return store.list_recordings(db, camera_id, start, end, cursor, limit)


@router.get(
    "/recordings/{recording_id}", response_model=models.Recording, operation_id="getRecording"
)
def recording(recording_id: UUID, request: Request):
    with request.app.state.database.connect() as db:
        return store.recording_model(store.get_recording(db, recording_id))


@router.get(
    "/recordings/{recording_id}/segments", response_model=c.SegmentList, operation_id="listSegments"
)
def segments(recording_id: UUID, request: Request):
    with request.app.state.database.connect() as db:
        store.get_recording(db, recording_id)
        rows = db.execute(
            """SELECT id,recording_id,started_at,duration_ms,offset_ms,status
            FROM segments WHERE recording_id=%s ORDER BY offset_ms LIMIT 10000""",
            (recording_id,),
        ).fetchall()
        return c.SegmentList(items=[c.Segment(**row) for row in rows])


@router.post(
    "/playback-sessions", response_model=c.MediaSession, operation_id="createPlaybackSession"
)
def playback_session(body: index_models.PlaybackRequest, principal: Principal, request: Request):
    return request.app.state.sessions.playback(principal, body)


@router.get(
    "/media/sessions/{session_id}/{resource}",
    response_class=Response,
    operation_id="readMediaResource",
    responses={206: {"description": "MP4 byte range"}, 416: {"model": c.ErrorResponse}},
)
def read_media(
    session_id: UUID,
    resource: Annotated[str, PathParam(pattern=r"^[a-zA-Z0-9_-]+\.(m3u8|mp4|m4s|ts)$")],
    principal: Principal,
    request: Request,
    range_header: Annotated[str | None, Header(alias="Range", max_length=100)] = None,
):
    return request.app.state.sessions.read(principal, session_id, resource, range_header, request)


@router.post(
    "/analysis-jobs",
    response_model=index_models.AnalysisJob,
    status_code=202,
    operation_id="createAnalysisJob",
    tags=["analysis"],
)
def create_analysis(
    body: index_models.AnalysisJobCreate,
    idempotency_key: Idempotency,
    principal: Principal,
    request: Request,
):
    return mutate(
        request,
        principal,
        "createAnalysisJob",
        idempotency_key,
        body.model_dump(mode="json", exclude_unset=True),
        lambda db: index_store.enqueue(db, body, request.app.state.settings),
    )


@router.get(
    "/analysis-jobs/{job_id}",
    response_model=index_models.AnalysisJob,
    operation_id="getAnalysisJob",
    tags=["analysis"],
)
def analysis_job(job_id: UUID, request: Request):
    with request.app.state.database.connect() as db:
        return index_store.get_job(db, job_id)


@router.get(
    "/recordings/{recording_id}/index",
    response_model=index_models.RecordingIndex,
    operation_id="getRecordingIndex",
    tags=["analysis"],
)
def recording_index(recording_id: UUID, request: Request):
    with request.app.state.database.connect() as db:
        recording = store.get_recording(db, recording_id)
        store.get_camera(db, recording["camera_id"])
        rows = index_store.index_rows(
            db, recording_id, index_store.version(request.app.state.settings)
        )
        return index_models.RecordingIndex(
            recording_id=recording_id,
            items=[
                index_models.SegmentIndex(
                    **{key: row[key] for key in index_models.SegmentIndex.model_fields}
                )
                for row in rows
            ],
        )


@router.get(
    "/analysis-usage",
    response_model=index_models.Usage,
    operation_id="getAnalysisUsage",
    tags=["analysis"],
)
def analysis_usage(principal: Principal, request: Request):
    agent_tools.authorize(principal, "analysis:write")
    with request.app.state.database.connect() as db:
        return index_store.usage(db, settings=request.app.state.settings)


@router.post(
    "/search",
    response_model=index_models.SearchResponse,
    operation_id="searchVideo",
    tags=["search"],
)
def search(body: index_models.SearchRequest, request: Request):
    return request.app.state.search.search(body)


@router.get(
    "/cameras/{camera_id}/activity",
    response_model=index_models.ActivityHistogram,
    operation_id="getActivity",
    tags=["events"],
)
def activity(
    camera_id: UUID,
    start: c.AwareDatetime,
    end: c.AwareDatetime,
    request: Request,
    bucket_seconds: Annotated[int, Query(ge=10, le=3600)] = 60,
):
    with request.app.state.database.connect() as db:
        return retrieval.activity(
            db, request.app.state.settings, camera_id, start, end, bucket_seconds
        )


@router.get("/events", response_model=c.EventList, operation_id="listEvents", tags=["events"])
def events(
    request: Request,
    camera_id: UUID | None = None,
    start: c.AwareDatetime | None = None,
    end: c.AwareDatetime | None = None,
    cursor: Cursor = None,
    limit: PageLimit = 50,
    kind: Literal["motion", "observation"] | None = None,
    curated_only: bool = False,
):
    with request.app.state.database.connect() as db:
        return retrieval.list_events(
            db, request.app.state.settings, camera_id, start, end, cursor, limit, kind, curated_only
        )


@router.post(
    "/index-query",
    response_model=index_models.SearchResponse,
    operation_id="queryIndex",
    tags=["search"],
)
def index_query(body: explore.IndexQuery, request: Request):
    """Filter stored observations without a model call; same evidence shape as search."""
    with request.app.state.database.connect() as db:
        return explore.query(db, request.app.state.settings, body)


@router.get(
    "/index-coverage",
    response_model=explore.IndexCoverage,
    operation_id="getIndexCoverage",
    tags=["search"],
)
def index_coverage(request: Request, curated_only: bool = False):
    with request.app.state.database.connect() as db:
        return explore.coverage(db, request.app.state.settings, curated_only)


@router.post(
    "/activity-query",
    response_model=explore.ActivityList,
    operation_id="queryActivity",
    tags=["events"],
)
def activity_query(body: explore.ActivityQuery, request: Request):
    with request.app.state.database.connect() as db:
        return explore.activities(db, request.app.state.settings, body)


@router.get(
    "/recordings/{recording_id}/frame",
    operation_id="getRecordingFrame",
    response_class=FileResponse,
    responses={200: {"content": {"image/jpeg": {}}}},
    tags=["search"],
)
def recording_frame(
    recording_id: UUID,
    request: Request,
    offset_ms: Annotated[int, Query(ge=0, le=7 * 24 * 3600 * 1000)],
    segment_id: UUID | None = None,
):
    with request.app.state.database.connect() as db:
        path = explore.frame(db, request.app.state.settings, recording_id, offset_ms, segment_id)
    return FileResponse(path, media_type="image/jpeg")


# Preserve remaining frozen rule endpoints and their typed 501 responses.
implemented = {route.operation_id for route in router.routes}
for frozen in frozen_router.routes:
    if frozen.operation_id not in implemented:
        router.add_api_route(
            frozen.path.removeprefix("/api/v1"),
            frozen.endpoint,
            methods=list(frozen.methods),
            response_model=frozen.response_model,
            status_code=frozen.status_code,
            operation_id=frozen.operation_id,
            tags=frozen.tags,
            summary=frozen.summary,
        )
app.include_router(router)
