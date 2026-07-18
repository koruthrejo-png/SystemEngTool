# ReqArch Suite

Desktop app for systems engineers: requirements management, architecture diagramming, interface management, and V&V. Project files use the `.reqarch` extension (SQLite).

## Stack

Electron + React + TypeScript + Vite (electron-vite) + Tailwind CSS + Zustand + better-sqlite3.

**Architecture** — 3 layers: React renderer → typed preload bridge (`window.api`) → main-process handlers → SQLite. The renderer never touches the database directly.

## Modules

| Pillar | Status |
|--------|--------|
| Requirements management | Complete (v1) |
| Architecture diagramming | Complete |
| Interfaces register | Complete |
| Verification & Validation | Planned |

## Development

```bash
npm install      # postinstall rebuilds better-sqlite3 for Electron
npm run dev      # launch app with HMR
npm run build    # typecheck + build
npm run typecheck
npm test         # vitest
```

Packaging: `npm run build:mac` / `build:win` / `build:linux`.

## Repository layout

```
src/main      main process — IPC handlers, SQLite access
src/preload   typed bridge exposing window.api
src/renderer  React UI
docs          specs, plans, vision
```

See `handoff.md` for current build state.
