# JARVIS

A personal, Iron Man-style AI assistant. **One backend brain**, three thin
clients (desktop, phone, Tesla), and node agents that let JARVIS control
your computers.

> Status: **Day 1 — scaffolding.** Structure + draft schema in place;
> brain, auth, and streaming chat land next. Nothing is deployed yet.

## Architecture

```
                 ┌──────────── apps/web (Vercel) ────────────┐
  Desktop PWA ─► │  THE BRAIN: streaming Claude + tool-use,  │
  Phone PWA   ─► │  pgvector memory, proactive cron          │ ─► Resend (email)
  Tesla /car  ─► │  clients: (hud) desktop+phone · /car      │ ─► Web Push
                 └───────────────────┬───────────────────────┘
                                     │ Supabase Realtime (outbound only)
                     ┌───────────────┼───────────────┬───────────────┐
                 MacBook           HP (Win)      Samsung (Win)     ROG (Win)   ← node agents
```

- **Brain + clients** — `apps/web` (Next.js App Router + TS + Tailwind)
- **Node agents** — `apps/node-agent` (Tauri; built Days 14-17)
- **Shared protocol/types** — `packages/shared` (`@jarvis/shared`)
- **Database** — `supabase/` (Postgres, auth, pgvector, Realtime, cron)

## Monorepo

npm workspaces (Node 20). Common commands from the repo root:

```bash
npm install          # install all workspaces
npm run dev          # run the brain/clients (apps/web) locally
npm run build        # production build of apps/web
npm run lint
```

## Setup

1. `npm install` at the repo root.
2. Copy `.env.example` → `apps/web/.env.local` and fill values (see below).
3. Apply the database schema (`supabase/migrations/0001_init.sql`) once the
   Supabase project + embedding provider are chosen.
4. `npm run dev`.

## Environment variables

See [`.env.example`](./.env.example) for the full, commented list. Grouped by
when they're needed: **Day 1** (Anthropic, Supabase), **memory** (embedding
provider — decision #1), **alerts** (Resend, web push), **voice** (Week 2:
Picovoice / Deepgram / ElevenLabs), **Google** (calendar/gmail), **Tesla**
(later). All secrets are server-side only.

## Open decisions (before schema is applied)

1. **Embeddings provider** → sets `vector(N)` in memory. Voyage-3-lite (512,
   recommended) · Supabase gte-small (384, free) · OpenAI 3-small (1536).
2. Desktop always-on wake word runs in the **native node agent**, not the PWA.
3. STT: browser Web Speech API (free) for v1 → Deepgram (streaming) later.
4. Wake-on-LAN is LAN-local (needs a peer node on the HP's subnet).
5. New paid services to approve: ElevenLabs, Deepgram.

## Security (see spec §7)

Single-user lock + 2FA · all keys server-side · per-device revocable keys ·
phone confirmation for irreversible actions · full audit log · kill switch.
