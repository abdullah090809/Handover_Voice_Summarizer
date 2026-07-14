import logging
import os
import asyncio
from contextlib import asynccontextmanager

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from sqlalchemy import text
# pyrefly: ignore [missing-import]
from slowapi.errors import RateLimitExceeded
# pyrefly: ignore [missing-import]
from slowapi import _rate_limit_exceeded_handler

from app.cores.database import engine
from app.cores.limiter import limiter
from app.services.transcription import get_whisper_model
from app.routers import auth, handover, residents, shifts, user, websocket, notifications

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
    app.state.main_loop = asyncio.get_running_loop()
    yield


app = FastAPI(lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal Server Error"}
    )

# pyrefly: ignore [missing-import]
from fastapi.exceptions import RequestValidationError
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": "Validation Error", "details": exc.errors()}
    )

# pyrefly: ignore [missing-import]
from fastapi import HTTPException
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail, "detail": exc.detail}
    )

app.include_router(auth.router)
app.include_router(residents.router)
app.include_router(handover.router)
app.include_router(shifts.router)
app.include_router(user.router)
app.include_router(websocket.router)
app.include_router(notifications.router)


@app.get("/")
def status_check():
    return {"message": "Handover Voice Summarizer Project is running successfully!"}


@app.get("/health/db")
def health_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"database": "connected"}

# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)