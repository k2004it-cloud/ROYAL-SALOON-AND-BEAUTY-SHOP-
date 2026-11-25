from __future__ import annotations

import sys
from email.message import Message
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode

from fastapi import FastAPI, Request
from fastapi.responses import Response

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.salon_api import DATABASE_URL, SalonHandler, init_db  # noqa: E402

if not DATABASE_URL:
    raise RuntimeError("SALON_DATABASE_URL must be configured for Vercel deployments.")

# Validate the remote schema once per warm function instance. The schema itself
# is managed by the versioned Supabase migrations.
init_db()


class VercelSalonHandler(SalonHandler):
    """Adapt the existing API handler to a single Vercel HTTP invocation."""

    def __init__(self, method: str, path: str, headers, body: bytes) -> None:
        self.command = method
        self.path = path
        self.headers = Message()
        for name, value in headers.items():
            self.headers[name] = value
        self.headers["Content-Length"] = str(len(body))
        self.rfile = BytesIO(body)
        self.wfile = BytesIO()
        self.response_status = 200
        self.response_headers: list[tuple[str, str]] = []

    def send_response(self, code: int, message: str | None = None) -> None:
        self.response_status = code

    def send_header(self, keyword: str, value: str) -> None:
        self.response_headers.append((keyword, value))

    def end_headers(self) -> None:
        return

    def log_request(self, code="-", size="-") -> None:
        return


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
API_METHODS = ["GET", "POST", "PATCH", "DELETE"]


@app.api_route("/{path:path}", methods=API_METHODS)
@app.api_route("/", methods=API_METHODS)
async def salon_api(request: Request) -> Response:
    body = await request.body()
    path_segments = request.query_params.get("vercel_path")

    if path_segments is None:
        request_path = request.url.path
        path_segments = request_path.removeprefix("/api").strip("/")

    api_path = "/api" + (f"/{path_segments}" if path_segments else "")
    query_items = [
        (key, value)
        for key, value in request.query_params.multi_items()
        if key != "vercel_path"
    ]
    query_string = urlencode(query_items, doseq=True)
    handler_path = f"{api_path}?{query_string}" if query_string else api_path

    handler = VercelSalonHandler(
        request.method.upper(), handler_path, request.headers, body
    )
    method_handler = getattr(handler, f"do_{request.method.upper()}", None)
    if method_handler is None:
        return Response(status_code=405, headers={"Allow": ", ".join(API_METHODS)})

    method_handler()
    response_headers: dict[str, str] = {}
    for name, value in handler.response_headers:
        response_headers[name] = value

    return Response(
        content=handler.wfile.getvalue(),
        status_code=handler.response_status,
        headers=response_headers,
    )
