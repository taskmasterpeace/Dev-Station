# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

DevStation is a lightweight web UI and CLI to manage multiple dev servers, Docker containers, and databases from one place. No build step — vanilla HTML/CSS/JS frontend served by Express. Windows-first but cross-platform.

## Commands

```bash
# Start the dashboard server
npm start                       # or: node server.js

# Change port (default 4000, auto-finds next open port if busy)
set DEVSTATION_PORT=5000 && npm start     # Windows
DEVSTATION_PORT=5000 npm start            # macOS/Linux

# CLI (server must be running)
node cli.js status              # Show all projects
node cli.js start <id>          # Start a project
node cli.js stop <id>           # Stop a project
node cli.js logs <id>           # Show recent logs

# Build standalone executables (uses pkg)
npm run build                   # All platforms
npm run build:win               # Windows only
```

No test suite or linter is configured.

## Architecture

```
server.js                    # Express + WebSocket server, all API routes
lib/
  process-manager.js         # Spawns/kills child processes via shell, manages state
  log-buffer.js              # Ring buffer (500 lines) per project
  health-monitor.js          # Detects log spam, crash loops, zombie processes
  config.js                  # Reads/writes projects.json (file-based, no DB)
cli.js                       # Stateless HTTP client that talks to server API
public/                      # Vanilla HTML/CSS/JS frontend (no framework, no build)
  index.html                 # Single-page app
  app.js                     # All frontend logic
  style.css                  # All styles
projects.json                # Project configuration (created on first run)
```

### Key design decisions

- **Single server.js** contains all Express routes, WebSocket handling, Docker exec calls, database port probing, and port scanning. Not split into route files.
- **Port auto-discovery**: `findOpenPort()` uses temporary `net.createServer` to probe ports starting at `DEVSTATION_PORT` (default 4000) up to +50. Writes the active port to `.devstation-port` so `cli.js` can discover it. The WebSocket server uses `noServer: true` — the HTTP upgrade handler is attached only after a successful port bind, preventing race conditions.
- **Process spawning** uses `shell: true` and `tree-kill` for proper Windows process tree cleanup. Environment variables including `FORCE_COLOR=1` and the project's `port`/`env` fields are passed through.
- **WebSocket messages** (not REST polling) drive the frontend: `init` (full state), `log` (real-time lines), `status` (state changes), `project_added/updated/deleted`. A polling fallback via `setInterval` on `/api/status` provides resilience.
- **No database** — config lives in `projects.json` (read from disk on every call, intentionally no caching so external edits are picked up), logs are in-memory ring buffers only.
- **Status resolution**: The `processes` Map only holds live processes (entries deleted on exit). `lastStatus` Map preserves final state (`crashed`/`stopped`). `getStatus()` checks live first, then `lastStatus`, then defaults to `stopped`.
- **Batch operations** (`start-all`, `stop-all`) are sequential `for...of` with `await`, not parallel, to avoid hammering the system.

### API surface

Server endpoints fall into four groups:
1. **Projects CRUD**: `GET/POST/PUT/DELETE /api/projects`
2. **Process control**: `POST /api/start/:id`, `/stop/:id`, `/restart/:id`, `GET /api/logs/:id`
3. **Docker**: `GET /api/docker`, `POST /api/docker/:action/:id`, `GET /api/docker/logs/:id` — shells out to `docker` CLI
4. **Databases**: `GET /api/databases` — probes ports 5432, 27017, 6379, 3306
5. **Utilities**: `GET /api/scan` (port scan), `GET /api/browse` (folder browser), `GET /api/drives` (Windows drive list)

### Health monitoring thresholds

- Log spam: >100 lines/sec sustained for 5+ seconds
- Crash loop: 3+ restarts within 60 seconds
- Zombie: No stdout/stderr for 5 minutes while status is "running"

## Project configuration

`projects.json` is an array of objects:
```json
{
  "id": "my-project",
  "name": "My Project",
  "folder": "D:/git/my-project",
  "command": "npm run dev",
  "port": 3000,
  "env": { "NODE_ENV": "development" }
}
```

The `env` field is optional and merged into the spawned process environment.

### Data flow: process output to browser

`spawn stdout/stderr` → `LogBuffer.push()` → `HealthMonitor.recordLogLine()` → `pm.onLog` callback → `broadcast({ type: 'log' })` → WebSocket → `app.js appendLog()` → DOM element with `.textContent` (XSS-safe).

Status changes follow the same broadcast path but trigger card re-render via `outerHTML` replacement. Config mutations write to disk synchronously then broadcast `project_added/updated/deleted`.

### pkg build notes

Compiled executables detect `process.pkg` to resolve paths. `projects.json` and `.devstation-port` are written next to the `.exe` (not inside the read-only snapshot). `public/` is bundled as assets.

## Dependencies

Only three runtime dependencies: `express`, `ws`, `tree-kill`. Dev dependency `pkg` is used for building standalone executables.
