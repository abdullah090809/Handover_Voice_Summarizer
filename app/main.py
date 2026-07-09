from fastapi import FastAPI
from sqlalchemy import text
from app.cores.database import engine
from app.routers import auth, care_homes, handover, residents, shifts

app = FastAPI()

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