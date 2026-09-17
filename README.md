# Handover Voice Summarizer

A voice-first shift handover system for care homes. Care workers record a short voice note about a resident at the end of a shift; it's transcribed locally with Whisper, summarized into a structured report by Gemini, and urgent items are pushed to managers in real time.

## Why

Written shift handovers get rushed, skipped, or lose detail in the handoff between teams. This replaces that with: talk for 30 seconds, get a structured, searchable report, and make sure anything urgent reaches a manager immediately — without staff having to stop and type.

## How it works

1. A care worker records a voice note about a resident on the web app or mobile app.
2. The audio is transcribed locally via **Whisper** (`turbo` model) — nothing is sent to a third party for transcription.
3. The transcript is summarized into a structured handover report by **Gemini** (`gemini-2.5-flash`).
4. The report is saved and surfaced in the shift feed. Urgent items trigger a real-time notification to managers over WebSockets, and a push notification on mobile.

## Tech stack

**Backend**
- FastAPI, SQLAlchemy, Alembic
- PostgreSQL, Redis
- Celery (prefork pool, concurrency=1 — see note below) + Celery Beat for async transcription/summarization and scheduled jobs (auto clock-out for stale shifts, cleanup of expired pending signups)
- JWT auth (python-jose), OTP email verification with rate limiting (slowapi)
- Cloudflare Turnstile bot-protection config on signup
- WebSockets (via a Redis pub/sub channel, so it works across multiple API workers) for live urgent-handover notifications
- Push notifications to registered mobile devices
- Append-only audit log middleware
- Whisper (local transcription), Gemini (summarization)
- Gmail SMTP for outgoing email

**Web frontend**
- React + Vite, React Router
- Plain CSS (no Tailwind), `fetch`-based API client (no Axios)

**Mobile**
- Expo / React Native (SDK 54), file-based routing
- `expo-secure-store` for JWT storage
- Shares the same API and design language as the web app

**Infra**
- Docker, multi-stage build, non-root container user
- Gunicorn + Uvicorn workers behind Nginx; migrations run as a separate one-shot Compose service before the API starts
- GitHub Actions CI: Postgres + Redis service containers, Alembic migrations, pytest
- `locustfile.py` for load testing

## Project structure

```
app/
  routers/       # auth, residents, shifts, handover, notifications, push_notifications, assignments, audit, websocket
  models/        # SQLAlchemy models
  schemas/       # Pydantic schemas
  services/      # transcription.py (Whisper), summarizer.py (Gemini), email.py, push_notification.py
  middleware/    # audit logging middleware
  cores/         # config, database, security, celery_app, circuit_breaker
alembic/          # migrations
frontend/         # React/Vite manager dashboard + Nginx config for deployment
mobile/           # Expo/React Native app
tests/            # pytest suite (390+ tests)
compose.yaml      # full stack: db, redis, migration, api, celery_worker, celery_beat, frontend
```

## Getting started (backend)

```bash
python -m venv venv
source venv/bin/activate   # venv\Scripts\activate on Windows
pip install -r requirements.txt

cp .env.example .env       # fill in DB, Redis, Gemini, Turnstile, Gmail SMTP credentials
alembic upgrade head

uvicorn app.main:app --reload
```

Run the Celery worker and beat scheduler alongside the API (required for transcription, summarization, and scheduled jobs):

```bash
celery -A app.cores.celery_app.celery_app worker --pool=threads --loglevel=info
celery -A app.cores.celery_app.celery_app beat --loglevel=info
```

## Getting started (web frontend)

```bash
cd frontend
npm install
npm run dev
```

## Getting started (mobile)

```bash
cd mobile
npm install
npx expo start --tunnel
```

The mobile app expects the backend to be reachable via the tunnel/LAN URL configured in its API layer.

## Running with Docker (full stack)

```bash
cp .env.example .env       # fill in real values
docker compose up --build
```

This brings up Postgres, Redis, a one-shot migration runner, the API (Gunicorn + Uvicorn workers), the Celery worker, Celery Beat, and the Nginx-served frontend. The API container exposes no host port — all traffic reaches it through Nginx at `http://localhost:5173`, which proxies `/api/` and `/ws` to the API.

> **Note:** the Celery worker runs with `--pool=prefork --concurrency=1` in Compose. Each forked worker process loads its own copy of the Whisper model into memory; running more than one at a time on a small host risks the OOM killer taking down a worker mid-transcription. Raise this only once you've confirmed the host has memory to spare.

See `README.Docker.md` for the generic Docker Desktop notes generated with the project scaffold.

### Deploying to a VPS

The stack above is deployable as-is on a VPS, with two things you should add before putting it in front of real users:

- **TLS.** Nginx currently serves plain HTTP on port 80. Put it behind Certbot/Let's Encrypt, or a TLS-terminating reverse proxy (Caddy, Traefik), before handling real login credentials.
- **Production `.env`.** Use strong, unique `SECRET_KEY`, `DATABASE_PASSWORD`, and `REDIS_PASSWORD` values — don't reuse the ones from local development.

## Environment variables

See `.env.example` for the full list. At minimum you'll need:

```
DATABASE_HOSTNAME, DATABASE_PORT, DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD, TEST_DATABASE_NAME
SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
GEMINI_API_KEY
TURNSTILE_SECRET_KEY
SEED_MANAGER_EMAIL, SEED_MANAGER_PASSWORD, SEED_MANAGER_USERNAME
GMAIL_SMTP_USER, GMAIL_SMTP_PASSWORD   # use a Gmail App Password, not your real password
REDIS_PASSWORD
```

## Status

- ✅ Auth (JWT + OTP email verification), residents / shifts / assignments CRUD
- ✅ Local Whisper transcription, Gemini summarization, handover notes + feed
- ✅ Real-time urgent-handover notifications (WebSocket + push), append-only audit log
- ✅ Celery Beat scheduled jobs, 390+ pytest tests, CI pipeline (GitHub Actions)
- ✅ Production Docker Compose stack (API, worker, beat, Postgres, Redis, Nginx-fronted frontend) — deployable on a VPS
- ⏳ TLS/HTTPS termination for the deployed stack
- 🚧 Mobile app (Expo/React Native) — feature parity with web in progress

## License

Proprietary — internal project. Not licensed for external use or redistribution.