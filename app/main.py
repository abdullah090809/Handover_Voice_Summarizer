import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.cores.database import engine
from app.cores.limiter import limiter
from app.routers import auth, care_homes, handover, residents, shifts, user

app = FastAPI()

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── API routers — must be registered BEFORE the frontend catch-all below,
# so exact API paths (e.g. /login, /care-homes) are matched first and never
# shadowed by the catch-all route that serves the React app. ──
app.include_router(auth.router)
app.include_router(care_homes.router)
app.include_router(residents.router)
app.include_router(handover.router)
app.include_router(shifts.router)
app.include_router(user.router)


@app.get("/status")
def status():
    # Moved from "/" so the frontend can be served at the root path instead.
    return {"message": "Handover Voice Summarizer Project is running successfully!"}


@app.get("/health/db")
def health_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"database": "connected"}


# ── Frontend static serving ──
# frontend/dist is a sibling of app/, i.e. repo_root/frontend/dist
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

app.mount(
    "/assets",
    StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")),
    name="assets",
)


@app.get("/")
async def serve_frontend_root():
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    # Catch-all for React Router's client-side routes (e.g. /dashboard,
    # /shifts) so refreshing on those pages doesn't 404 — FastAPI hands them
    # index.html and React Router takes over from there. Only reached if no
    # API route above already matched.
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))