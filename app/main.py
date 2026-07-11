import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.cores.database import engine
from app.cores.limiter import limiter
from app.services.transcription import get_whisper_model
from app.routers import auth, care_homes, handover, residents, shifts, user

# Issue #19 fix: configure logging once, at startup, instead of having no
# logging configuration anywhere in the project. Ship JSON/structured
# output to a log aggregator in production by swapping the formatter here.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Issue #24 fix: load the Whisper model at startup (fail fast / warm the
    # model) instead of lazily on the first transcription request, so the
    # first real user isn't the one who pays the multi-second load cost —
    # and a missing/corrupt model file fails the deploy, not a request.
    logger.info("Warming Whisper model before accepting traffic")
    get_whisper_model()
    yield


app = FastAPI(lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(auth.router)
app.include_router(care_homes.router)
app.include_router(residents.router)
app.include_router(handover.router)
app.include_router(shifts.router)
app.include_router(user.router)


@app.get("/")
def status_check():
    return {"message": "Handover Voice Summarizer Project is running successfully!"}


@app.get("/health/db")
def health_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"database": "connected"}

# Issue #23 note: no CORS middleware is added here because there is no
# frontend yet. If a separate frontend origin (e.g. a local Vite dev
# server) or a non-browser client (mobile app) needs to call this API
# cross-origin, add:
#
#   from fastapi.middleware.cors import CORSMiddleware
#   app.add_middleware(
#       CORSMiddleware,
#       allow_origins=[...],       # explicit allow-list, never "*" with credentials
#       allow_credentials=True,
#       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
#       allow_headers=["Authorization", "Content-Type"],
#   )