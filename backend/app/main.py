from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.database import Base, SessionLocal, engine
from app.routers import (
    ai,
    assistant,
    dashboard,
    documents,
    mappings,
    partners,
    reports,
    settings,
    transactions,
)
from app.seed import ensure_seed_data


def _frontend_dist_dir() -> Path:
    custom = os.getenv("EDI_NEXUS_FRONTEND_DIST")
    if custom:
        return Path(custom).resolve()
    return (Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_seed_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="EDI NEXUS API",
    description="Electronic Data Interchange Management Information System API",
    version="0.5.0",
    lifespan=lifespan,
)

_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
_env_origins = os.getenv("EDI_NEXUS_CORS_ORIGINS", "")
_cors_origins = [o.strip() for o in _env_origins.split(",") if o.strip()] or _default_origins

# Restrict CORS strictly to configured local origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", []) if x != "body")
        msg = err.get("msg", "Invalid value")
        messages.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "; ".join(messages) or "Invalid request payload."},
    )


@app.exception_handler(IntegrityError)
async def integrity_exception_handler(_request: Request, _exc: IntegrityError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Database integrity constraint violated (duplicate identifier or invalid foreign key reference)."},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(_request: Request, _exc: SQLAlchemyError):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Database operation failed safely."},
    )


@app.get("/api/health")
def health_check():
    dist_index = _frontend_dist_dir() / "index.html"
    return {
        "status": "ok",
        "version": app.version,
        "database": "sqlite",
        "frontendPackaged": dist_index.is_file(),
    }


app.include_router(ai.router)
app.include_router(dashboard.router)
app.include_router(transactions.router)
app.include_router(documents.router)
app.include_router(partners.router)
app.include_router(mappings.router)
app.include_router(reports.router)
app.include_router(assistant.router)
app.include_router(settings.router)

_dist_dir = _frontend_dist_dir()
_assets_dir = _dist_dir / "assets"
if _assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="frontend-assets")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_packaged_spa(full_path: str):
    """Serve built Vite SPA assets and React Router routes when frontend/dist exists."""
    normalized = full_path.lstrip("/")
    if normalized == "api" or normalized.startswith("api/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API endpoint not found.")

    dist_root = _frontend_dist_dir()
    index_file = dist_root / "index.html"
    if not index_file.is_file():
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "service": "EDI NEXUS API",
                "status": "running",
                "message": "Frontend build not found at frontend/dist. Run 'npm run build' in frontend/ or start Vite dev server on port 5173.",
            },
        )

    if normalized:
        candidate = (dist_root / normalized).resolve()
        if candidate.is_relative_to(dist_root) and candidate.is_file():
            return FileResponse(candidate)

    return FileResponse(index_file)

