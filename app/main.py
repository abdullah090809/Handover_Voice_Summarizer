from fastapi import FastAPI
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.cores.database import engine
from app.cores.limiter import limiter
from app.routers import auth, care_homes, handover, residents, shifts

app = FastAPI()

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(auth.router)
app.include_router(care_homes.router)
app.include_router(residents.router)
app.include_router(handover.router)
app.include_router(shifts.router)

@app.get("/")
def root():
    return {"message": "Handover Voice Summarizer Project is running successfully!"}


@app.get("/health/db")
def health_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"database": "connected"}