---
name: pwa-runtime-ux
description: "Use when setting up the PWA manifest, service worker, offline detection, app installability, and mobile-first runtime behavior. For this repo it is currently shelved because no PWA runtime infrastructure exists yet."
argument-hint: "Describe the PWA requirement and whether you want to implement infra now or keep this as a future spec."
---

# PWA & Runtime UX (Shelved)

Status: **SHELVED for now in this repo**.

This skill exists as a forward-looking spec only. The current `frontend/` repo has no
PWA infrastructure implemented yet:

- No `public/manifest.json`
- No service worker setup
- No `next-pwa` dependency/config
- No worker-station routes/components yet

## What this means operationally

- Do not assume offline behavior exists.
- Do not enforce worker-station UX constraints unless the corresponding feature is being built.
- If a request is not explicitly about PWA runtime setup, route work to:
  - `structure-guard` (file placement)
  - `client-data-state` (data and TanStack Query)
  - `ui-form-standards` (forms/UI)

## Reactivation trigger

Unshelve this skill only when user asks to implement PWA runtime (manifest/SW/installability)
or worker-station offline UX.

When reactivated, first define:

1. Target routes/scopes for offline shell.
2. Caching policy boundaries (app shell only vs API payloads).
3. Install UX requirements.
4. Worker station path/IA and language constraints.

Then implement incrementally with tests/checklists.
