from __future__ import annotations

from celery import Celery

from config import JUDGE_GLOBAL_TIMEOUT_SECONDS, REDIS_URL

celery_app = Celery(
    "matrix_oj_clone",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Hong_Kong",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=JUDGE_GLOBAL_TIMEOUT_SECONDS,
    task_soft_time_limit=max(5, JUDGE_GLOBAL_TIMEOUT_SECONDS - 5),
)
