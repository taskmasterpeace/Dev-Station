# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Dev Dashboard is a lightweight web UI and CLI to manage multiple dev servers from one place. **Use this instead of running `npm run dev` directly in terminals** - it provides clean start/stop, proper process tree killing (important on Windows), and health monitoring.

## Commands

```bash
# Start the dashboard server (required before using CLI)
node server.js
# Or: npm start

# CLI commands (server must be running)
node cli.js status              # Show all projects
node cli.js status <id>         # Show single project
node cli.js start <id>          # Start a project
node cli.js stop <id>           # Stop a project
node cli.js restart <id>        # Restart a project
node cli.js logs <id>           # Show recent logs (last 50 lines)
node cli.js list                # List all project IDs
node cli.js open <id>           # Open project in browser
node cli.js start-all           # Start all projects
node cli.js stop-all            # Stop all projects
```

## API Endpoints

Server runs on port 4000. Web UI at http://localhost:4000

```bash
GET  /api/status              # All project statuses
GET  /api/status/:id          # Single project status
POST /api/start/:id           # Start project
POST /api/stop/:id            # Stop project
POST /api/restart/:id         # Restart project
GET  /api/logs/:id?lines=N    # Get logs
POST /api/logs/:id/clear      # Clear logs
POST /api/projects            # Add project
PUT  /api/projects/:id        # Update project
DELETE /api/projects/:id      # Delete project
POST /api/start-all           # Start all
POST /api/stop-all            # Stop all
GET  /api/browse?path=...     # Browse folders
GET  /api/drives              # List drives (Windows)
```

## Architecture

```
server.js                    # Express + WebSocket server (port 4000)
    ├── ProcessManager       # Spawns/kills processes, captures stdout/stderr
    │   ├── LogBuffer        # Ring buffer (500 lines) per project
    │   └── HealthMonitor    # Detects log spam, crash loops, zombie processes
    └── config.js            # Reads/writes projects.json

cli.js                       # Stateless HTTP client to server API
public/                      # Vanilla HTML/CSS/JS frontend
```

**Key flows:**
- `ProcessManager.startProject()` spawns with `shell: true`, pipes stdout/stderr to LogBuffer, broadcasts via WebSocket
- `ProcessManager.stopProject()` uses `tree-kill` for proper Windows process tree cleanup
- WebSocket broadcasts: `init` (all status), `log` (real-time), `status` (state changes), `project_added/updated/deleted`

**Health thresholds:**
- Log spam: >100 lines/sec for 5+ seconds
- Crash loop: 3+ restarts in 60 seconds
- Zombie: No output for 5 minutes while "running"

## Project Configuration

Edit `projects.json` directly or use web UI/API:
```json
{
  "id": "my-project",
  "name": "My Project",
  "folder": "D:/git/my-project",
  "command": "npm run dev",
  "port": 3000
}
```

## Dependencies

- `express` - HTTP server
- `ws` - WebSocket for real-time logs
- `tree-kill` - Properly kills process trees on Windows
