# Handover Voice Summarizer

A voice-first shift handover system for care homes. Care workers record a short voice note about a resident at the end of a shift; it's transcribed locally with Whisper, summarized into a structured report by Gemini AI, and urgent items are pushed to managers in real time.

## Why

Written shift handovers get rushed, skipped, or lose detail in the handoff between teams. This replaces that with: talk for 30 seconds, get a structured, searchable report, and make sure anything urgent reaches a manager immediately — without staff having to stop and type.

## How it works

1. A care worker records a voice note about a resident on the web app or mobile app.
2. The audio is transcribed locally via **Whisper** (`base` model) — nothing is sent to a third party for transcription.
3. The transcript is summarized into a structured handover report by **Gemini**.
4. The report is saved and surfaced in the shift feed. Urgent items trigger a real-time notification to managers over WebSockets.

## Tech stack

**Backend**
- FastAPI, SQLAlchemy, Alembic
- PostgreSQL
- Celery + Redis (async transcription/summarization, scheduled jobs — e.g. auto clock-out for stale shifts, cleanup of expired pending signups)
- JWT auth (python-jose), OTP email verification (Resend) with rate limiting (slowapi)
- WebSockets for live urgent-handover notifications
- Whisper (local transcription), Gemini (`gemini-2.5-flash`) for summarization

**Web frontend**
- React + Vite, Tailwind, React Router, Axios

**Mobile**
- Expo / React Native (SDK 54)
- `expo-secure-store` for JWT storage
- Shares the same API layer and design system as the web app

**Infra**
- Docker (backend + frontend containers, Gunicorn/Nginx)
- GitHub Actions CI: Postgres service container, Alembic migrations, pytest

## Project structure

```
app/
  routers/       # auth, residents, shifts, handover, notifications, assignments, audit, websocket
  models/        # SQLAlchemy models
  schemas/       # Pydantic schemas
  services/      # transcription.py (Whisper), summarizer.py (Gemini), email.py, push_notification.py
  cores/         # config, database, security
alembic/          # migrations
frontend/         # React/Vite manager dashboard
mobile/           # Expo/React Native app (feature/expo-mobile branch)
tests/            # pytest suite
```

## Getting started (backend)

```bash
python -m venv venv
source venv/bin/activate   # venv\Scripts\activate on Windows
pip install -r requirements.txt

cp .env.example .env       # fill in DB, Redis, Gemini, Resend credentials
alembic upgrade head

uvicorn app.main:app --reload
```

Run the Celery worker and beat scheduler alongside the API (required for transcription, summarization, and scheduled jobs):

```bash
celery -A app.cores.celery_app worker --pool=threads --loglevel=info
celery -A app.cores.celery_app beat --loglevel=info
```

## Getting started (web frontend)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Getting started (mobile)

```bash
cd mobile
npm install
npx expo start --tunnel
```

The mobile app expects the backend to be reachable via the tunnel/LAN URL configured in its API layer.

## Docker

```bash
docker build -t handover-backend .
```

See `README.Docker.md` for container-specific notes. A full `docker-compose.yml` orchestrating API, worker, beat, Postgres, Redis, and the frontend is in progress as part of deployment work.

## Environment variables

At minimum, the backend expects:

```
DATABASE_URL=
REDIS_URL=
SECRET_KEY=
GEMINI_API_KEY=
RESEND_API_KEY=
```

See `.env` / `.env.example` for the full list used by your environment.

## Status

- ✅ Auth (JWT + OTP email verification), care homes / residents / shifts CRUD
- ✅ Local Whisper transcription, Gemini summarization, handover notes + feed
- ✅ Celery Beat scheduled jobs, CI pipeline (GitHub Actions)
- ⏳ Urgent-handover email wiring, full pytest coverage, production Dockerfile/deployment
- 🚧 Mobile app (Expo/React Native) — feature parity with web in progress

## License

Proprietary — internal project. Not licensed for external use or redistribution.
