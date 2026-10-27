"""Technical probe only: serve one already-generated owned MP4 with real HTTP Range.

This is not the Veyra media session implementation and has no access to cameras or secrets.
"""

import argparse
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse

parser = argparse.ArgumentParser()
parser.add_argument("--file", required=True)
args = parser.parse_args()
media_file = Path(args.file).resolve(strict=True)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/", response_class=HTMLResponse)
def player():
    return (
        '<!doctype html><html><body><video controls muted src="/media.mp4"></video></body></html>'
    )


@app.get("/media.mp4")
def media():
    return FileResponse(media_file, media_type="video/mp4")


uvicorn.run(app, host="127.0.0.1", port=19995, log_level="warning")
