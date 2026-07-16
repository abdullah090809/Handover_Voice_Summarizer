# Handover — Care Home Shift Management (Frontend)

A complete React redesign of the shift handover frontend, built against your
existing FastAPI backend with no changes to any endpoint, model, or business
logic. Every screen maps to real, working API calls — nothing here is a mock.

## Stack

- React 18 + Vite (no Tailwind — a hand-built CSS design system in `src/styles/`, zero build-step risk)
- React Router 6 for navigation
- `lucide-react` for icons
- Native `fetch` + native `MediaRecorder`/WebSocket APIs — no other runtime dependencies

## Getting started

```bash
cd carehome-frontend
npm install
cp .env.example .env   # then edit .env, see below
npm run dev
```

The app runs at `http://localhost:5173` by default.

### Configure `.env`

| Variable | What it's for |
|---|---|
| `VITE_API_BASE_URL` | Your FastAPI backend URL, e.g. `http://127.0.0.1:8000` |
| `VITE_WS_BASE_URL` | Same host, `ws://` scheme, for the live `/ws/handovers` feed |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile **site key** used on the sign-in form |

The backend's CORS middleware already allows all origins (`allow_origins=["*"]`
in `main.py`), so no backend changes are needed to talk to this frontend from
`localhost:5173` or wherever you deploy it.

**Turnstile note:** only `/login` requires a Turnstile token (register/verify/
forgot/reset do not, per the backend's schemas). For local development, use
Cloudflare's published always-pass test key `1x00000000000000000000AA` as
`VITE_TURNSTILE_SITE_KEY`, and set the backend's `TURNSTILE_SECRET_KEY` to
Cloudflare's matching test secret `1x0000000000000000000000000000000AA`. For
production, create a real widget in your Cloudflare dashboard and use that
site key here, with its secret on the backend.

## What changed from your brief, and why

Your brief described five roles (Caregiver, Nurse, Senior Carer, Manager,
Administrator) and a Care Home Management module. The backend only implements
two roles — `care_worker` and `manager` — and is scoped to a single care home
(no `CareHome` model or router exists). Per your confirmation, this build
targets exactly those two roles and skips the multi-home module, so that
every control in the UI is backed by a real, working endpoint.

One deliberate UX correction versus the old frontend: managers can now see
the **Handovers** and **Shifts** sections (the old app hid both tabs for
managers). The backend already scopes these correctly for managers — they
can view any team member's shifts via `?worker_id=`, and only managers are
permitted to delete a handover note — so hiding those tabs left managers
unable to do part of their job through the UI. That's fixed here.

## Project structure

```
src/
  lib/            API client, auth/toast/confirm/websocket contexts, format helpers
  components/     Reusable UI: Modal, Badge, cards, forms, Sidebar/Topbar shell
  pages/          One file per route: Dashboard, Handovers, Residents, Shifts,
                  Team, Notifications, Profile, and the combined AuthPage
  styles/         Design system: tokens, base reset, components, layout, pages
```

## Design system highlights

- **Palette:** deep ink-navy surfaces, warm paper background, one confident
  teal accent — no gradients, no glassmorphism.
- **Type:** IBM Plex Sans for UI chrome, Source Serif 4 specifically for the
  body of handover summaries and transcripts (comfortable long-form reading
  was the top priority for that screen), IBM Plex Mono for timestamps/IDs.
- **Urgency spine:** low/medium/high isn't just a badge colour — it's a
  left-edge accent bar on cards and a dot on timeline entries, so severity is
  scannable by shape, not just by reading text.
- Full states for empty/loading/error/success are implemented per screen, not
  just designed in the abstract.

## A note on this environment

This sandbox has no internet access, so I could not run `npm install` or
preview a live build here — the code was written and manually reviewed
(import graph, bracket balance, icon names, and every payload cross-checked
against the actual FastAPI schemas/routers) but not compiled. Please run
`npm run build` after `npm install` and let me know if anything doesn't
compile cleanly — happy to fix it immediately.
