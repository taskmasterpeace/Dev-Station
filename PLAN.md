# Dev Dashboard - Implementation Plan

> A lightweight web-based dev server manager with API control for AI automation.

---

## Overview

A single-page web app that runs locally to manage multiple development servers across different projects. No more juggling terminal windows.

**Location:** `D:/git/dev-dashboard`
**Port:** `4000`
**Stack:** Node.js + Express + vanilla HTML/CSS/JS (keep it simple, no React needed)

---

## Core Features

### 1. Project Management
- Add/edit/remove projects
- Each project has:
  - `id` - unique slug (e.g., "hyh", "ad-lab")
  - `name` - display name (e.g., "Hey You're Hired")
  - `folder` - absolute path (e.g., "D:/git/yourehired")
  - `command` - start command (e.g., "npm run dev")
  - `port` - expected port (e.g., 3003) - for status display
  - `color` - optional accent color for UI

### 2. Server Control
- **Start** - spawn process, capture stdout/stderr
- **Stop** - kill process gracefully (SIGTERM), then force (SIGKILL) after 5s
- **Restart** - stop then start
- Status indicators:
  - 🟢 Running
  - 🔴 Stopped
  - 🟡 Starting...
  - 🟠 Warning (high log output detected)
  - 🔵 Stopping...

### 3. Log Viewer
- Real-time log streaming via WebSocket
- Click "Logs" button to expand inline log panel
- Keep last 500 lines in memory per project
- Color-code: stdout (white), stderr (red)
- "Clear" button to reset log buffer
- "Copy" button to copy logs to clipboard

### 4. Health Monitoring / Bug Detection
Detect when a server might be stuck or bugging out:

| Condition | Indicator | Threshold |
|-----------|-----------|-----------|
| Log spam | 🟠 Warning | >100 lines/second for 5+ seconds |
| Crash loop | 🔴 Crash Loop | Restarted 3+ times in 60 seconds |
| Memory spike | 🟠 High Memory | >1GB RSS (optional, if we track) |
| Zombie process | 🟠 Unresponsive | No output for 5+ min after start |

Show a badge/indicator on the project card when issues detected.

### 5. API Endpoints (for AI control)

```
GET  /api/status              - Get all projects and their status
GET  /api/status/:id          - Get single project status
POST /api/start/:id           - Start a project
POST /api/stop/:id            - Stop a project
POST /api/restart/:id         - Restart a project
GET  /api/logs/:id            - Get recent logs (last 100 lines)
GET  /api/logs/:id?lines=500  - Get more lines

POST /api/projects            - Add new project
PUT  /api/projects/:id        - Update project config
DELETE /api/projects/:id      - Remove project
```

**Response format:**
```json
{
  "success": true,
  "data": {
    "id": "hyh",
    "name": "Hey You're Hired",
    "status": "running",
    "pid": 12345,
    "port": 3003,
    "uptime": 3600,
    "warnings": ["high_log_output"],
    "lastOutput": "Ready on http://localhost:3003"
  }
}
```

---

## File Structure

```
dev-dashboard/
├── server.js           # Main Express server
├── lib/
│   ├── process-manager.js   # Spawn/kill processes, track state
│   ├── log-buffer.js        # Ring buffer for logs per project
│   ├── health-monitor.js    # Detect log spam, crashes, etc.
│   └── config.js            # Load/save projects.json
├── public/
│   ├── index.html      # Single page app
│   ├── style.css       # Dark theme, clean UI
│   └── app.js          # Frontend JS, WebSocket connection
├── projects.json       # Saved project configurations
├── package.json
└── PLAN.md             # This file
```

---

## UI Design

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  DEV DASHBOARD                              [+ Add Project] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟢 Hey You're Hired                    localhost:3003│   │
│  │    D:/git/yourehired                                 │   │
│  │    Uptime: 2h 34m                                    │   │
│  │    [Stop] [Restart] [Logs] [Edit] [×]               │   │
│  │                                                      │   │
│  │  ┌─ Logs ──────────────────────────────────────┐    │   │
│  │  │ > Ready on http://localhost:3003            │    │   │
│  │  │ > Compiled successfully                      │    │   │
│  │  │ > GET / 200 in 45ms                         │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔴 Ad Lab                              localhost:3001│   │
│  │    D:/git/mkm/ad-lab                                 │   │
│  │    [Start] [Edit] [×]                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟠 MKM Backend                    ⚠ Log spam detected│   │
│  │    D:/git/mkm/backend               localhost:8000   │   │
│  │    [Stop] [Restart] [Logs] [Edit] [×]               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Color Scheme (Dark Theme)
- Background: `#0a0a0a`
- Card background: `#1a1a1a`
- Card border: `#333`
- Primary accent: `#3b82f6` (blue)
- Success: `#22c55e` (green)
- Warning: `#f59e0b` (amber)
- Error: `#ef4444` (red)
- Text: `#e5e5e5`
- Muted text: `#888`

### Add/Edit Project Modal
```
┌─────────────────────────────────────┐
│  Add Project                    [×] │
├─────────────────────────────────────┤
│  Name:    [Hey You're Hired      ] │
│  ID:      [hyh                   ] │
│  Folder:  [D:/git/yourehired     ] │
│  Command: [npm run dev           ] │
│  Port:    [3003                  ] │
│                                     │
│            [Cancel] [Save]          │
└─────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Core Backend (45 min)
1. Initialize npm project with dependencies:
   - `express` - web server
   - `ws` - WebSocket for real-time logs
   - `tree-kill` - properly kill process trees on Windows

2. Implement `process-manager.js`:
   - `startProject(id)` - spawn child process
   - `stopProject(id)` - kill process tree
   - `getStatus(id)` - return current state
   - Store running processes in memory Map
   - Pipe stdout/stderr to log buffer

3. Implement `log-buffer.js`:
   - Ring buffer class (fixed size array)
   - `push(line)` - add line, drop oldest if full
   - `getAll()` - return all lines
   - `clear()` - reset buffer

4. Implement `config.js`:
   - `loadProjects()` - read from projects.json
   - `saveProjects()` - write to projects.json
   - Handle file not existing (create empty)

### Phase 2: API Routes (30 min)
1. Set up Express routes for all endpoints
2. Add error handling middleware
3. Test with curl/Postman

### Phase 3: Health Monitor (30 min)
1. Track log lines per second per project
2. Track restart count with timestamps
3. Emit warnings when thresholds exceeded
4. Clear warnings when resolved

### Phase 4: Frontend (45 min)
1. Build static HTML structure
2. Style with CSS (dark theme)
3. Implement JavaScript:
   - Fetch initial state from `/api/status`
   - WebSocket connection for real-time updates
   - Event handlers for buttons
   - Add/Edit project modal
   - Collapsible log panels

### Phase 5: Polish (20 min)
1. Add auto-reconnect for WebSocket
2. Add keyboard shortcuts (R = restart all, S = stop all)
3. Save window scroll position
4. Add "Start All" / "Stop All" buttons
5. Show toast notifications for actions

---

## WebSocket Protocol

Server broadcasts to all clients on state changes:

```json
// Project status changed
{
  "type": "status",
  "project": "hyh",
  "status": "running",
  "pid": 12345
}

// New log line
{
  "type": "log",
  "project": "hyh",
  "stream": "stdout",
  "line": "Ready on http://localhost:3003"
}

// Warning triggered
{
  "type": "warning",
  "project": "hyh",
  "warning": "high_log_output",
  "message": "Detected 150 lines/sec for 5 seconds"
}

// Warning cleared
{
  "type": "warning_cleared",
  "project": "hyh",
  "warning": "high_log_output"
}
```

---

## Default Projects to Pre-configure

```json
[
  {
    "id": "hyh",
    "name": "Hey You're Hired",
    "folder": "D:/git/yourehired",
    "command": "npm run dev",
    "port": 3003
  },
  {
    "id": "ad-lab",
    "name": "Ad Lab",
    "folder": "D:/git/mkm/ad-lab",
    "command": "npm run dev",
    "port": 3001
  }
]
```

---

## Future Enhancements (Not for v1)

- [ ] System tray icon (Electron wrapper)
- [ ] Auto-start on Windows boot
- [ ] CPU/Memory usage graphs
- [ ] Log search/filter
- [ ] Project groups/folders
- [ ] Port conflict detection
- [ ] One-click "Open in VS Code"
- [ ] One-click "Open in Browser"
- [ ] Slack/Discord notifications for crashes
- [ ] Multi-machine support (remote servers)

---

## Commands to Run

```bash
# Install dependencies
cd D:/git/dev-dashboard
npm init -y
npm install express ws tree-kill

# Start the dashboard
node server.js

# Access at
http://localhost:4000
```

---

## Testing Checklist

- [ ] Add a project via UI
- [ ] Start a project, verify 🟢 status
- [ ] View logs in real-time
- [ ] Stop a project, verify 🔴 status
- [ ] Restart a project
- [ ] Edit project settings
- [ ] Delete a project
- [ ] API: `curl localhost:4000/api/status`
- [ ] API: `curl -X POST localhost:4000/api/start/hyh`
- [ ] API: `curl -X POST localhost:4000/api/stop/hyh`
- [ ] Trigger log spam warning (run a script that prints fast)
- [ ] Verify WebSocket reconnects after server restart
- [ ] Test on fresh machine (no projects.json yet)

---

## Notes for AI Builder

1. **Windows paths** - Use forward slashes or escape backslashes properly
2. **Process killing on Windows** - Use `tree-kill` package, not just `process.kill()`
3. **Shell command** - Use `spawn` with `shell: true` for npm commands on Windows
4. **Keep it simple** - No build step, no bundler, just vanilla JS
5. **Auto-save** - Save projects.json after any change
6. **Graceful shutdown** - Stop all processes when dashboard server exits

---

*Plan created: 2026-02-01*
