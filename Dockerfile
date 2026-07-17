# syntax=docker/dockerfile:1
ARG PYTHON_VERSION=3.13-slim

FROM python:${PYTHON_VERSION} AS builder
WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=bind,source=requirements.txt,target=requirements.txt \
    python -m pip install --user -r requirements.txt

FROM python:${PYTHON_VERSION} AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/home/appuser/.local/bin:$PATH

WORKDIR /app

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/home/appuser" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

COPY --from=builder /root/.local /home/appuser/.local
COPY --chown=appuser:appuser . .

RUN chown -R appuser:appuser /home/appuser

USER appuser

EXPOSE 8000
CMD uvicorn app.main:app --host=0.0.0.0 --port=8000