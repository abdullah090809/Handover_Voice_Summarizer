from celery import Celery
from kombu import Queue, Exchange
from app.cores.config import settings

redis_auth = f":{settings.redis_password}@" if settings.redis_password else ""
_broker = f"redis://{redis_auth}{settings.redis_host}:{settings.redis_port}/0"

celery_app = Celery(
    "handover",
    broker=_broker,
    backend=f"redis://{redis_auth}{settings.redis_host}:{settings.redis_port}/0",
    include=["app.tasks"],
)

# ---------------------------------------------------------------------------
# Item 26: Dead-letter queue (DLQ)
# Tasks that have permanently exhausted their retries are routed to
# "handover.dlq" so they can be inspected without blocking the main queue.
# ---------------------------------------------------------------------------
_default_exchange = Exchange("handover", type="direct")
_dlq_exchange = Exchange("handover.dlq", type="direct")

celery_app.conf.task_queues = (
    Queue("celery", _default_exchange, routing_key="celery"),
    Queue("handover.dlq", _dlq_exchange, routing_key="handover.dlq"),
)
celery_app.conf.task_default_queue = "celery"
celery_app.conf.task_default_exchange = "handover"
celery_app.conf.task_default_routing_key = "celery"

# After all retries are exhausted Celery calls the task's on_failure hook.
# We route those permanently failed messages to the DLQ via a custom handler
# set on each task (see app/tasks.py process_handover_note on_failure).
celery_app.conf.task_reject_on_worker_lost = True  # re-queue if worker is killed mid-task
celery_app.conf.task_acks_late = True  # belt-and-suspenders for acks_late at task level