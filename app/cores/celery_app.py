from celery import Celery
from app.cores.config import settings

celery_app = Celery(
    "handover",
    broker=f"redis://{settings.redis_host}:{settings.redis_port}/0",
    backend=f"redis://{settings.redis_host}:{settings.redis_port}/0",
    include=["app.tasks"],
)