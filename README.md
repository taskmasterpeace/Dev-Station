# DevStation

A lightweight, cross-platform dashboard for managing multiple development servers, Docker containers, and databases from one place.

![DevStation Screenshot](https://via.placeholder.com/800x400?text=DevStation+Dashboard)

## Features

- **Dev Server Management** - Start, stop, restart development servers with one click
- **Real-time Logs** - View console output in real-time via WebSocket
- **Docker Integration** - List, start, stop, restart, and remove Docker containers
- **Database Detection** - Auto-detect running PostgreSQL, MongoDB, Redis, and MySQL
- **External Process Detection** - Find dev servers running outside the dashboard
- **Crash Detection** - Visual indicators when servers crash, with auto-expanded logs
- **Port Scanning** - Scan all ports for running dev servers
- **Light/Dark Themes** - Switch between themes in settings
- **Mobile Responsive** - Works on phones and tablets
- **CLI Tool** - Full command-line interface with JSON output for automation
- **Cross-Platform** - Works on Windows, macOS, and Linux

---

## Quick Start

### Windows

```batch
# Clone and install
git clone https://github.com/your-username/devstation.git
cd devstation
npm install

# Start the dashboard
start.bat
```

Or just double-click `start.bat`!

### macOS / Linux

```bash
# Clone and install
git clone https://github.com/your-username/devstation.git
cd devstation
npm install

# Start the dashboard
./start.sh

# Or manually
node server.js
```

Then open **http://localhost:4000** in your browser.

---

## Installation (Optional)

### Global Installation (Linux/macOS)

Run the install script to create global `devstation` and `devd` commands:

```bash
chmod +x install.sh
./install.sh
```

After installation:
- `devstation` - Starts the dashboard server
- `devd` - CLI tool for quick commands

### Standalone Executable (No Node.js Required)

Build standalone executables for distribution:

```bash
npm install
npm run build
```

This creates executables in the `dist/` folder:
- `devstation-win.exe` - Windows
- `devstation-linux` - Linux
- `devstation-macos` - macOS

Just copy the executable and run it - no Node.js installation needed!

---

## Usage

### Web UI

1. Open **http://localhost:4000**
2. Click **+ Add Project** to add your dev servers
3. Use **Start/Stop/Restart** buttons to manage servers
4. Click **Logs** to view real-time console output
5. Use the tabs to switch between Dev Servers, Docker, and Databases

### CLI Commands

```bash
# Check status of all projects
node cli.js status

# Start a project
node cli.js start <project-id>

# Stop a project
node cli.js stop <project-id>

# Restart a project
node cli.js restart <project-id>

# View recent logs
node cli.js logs <project-id>

# List all project IDs
node cli.js list

# Open project in browser
node cli.js open <project-id>

# Start/stop all projects
node cli.js start-all
node cli.js stop-all

# Scan for running dev servers
node cli.js scan

# Show help
node cli.js help
```

### JSON Output (for AI Agents/Scripts)

Add `--json` or `-j` to any command for machine-readable output:

```bash
node cli.js status --json
node cli.js start myproject -j
```

---

## Adding Projects

### Via Web UI

1. Click **+ Add Project**
2. Fill in:
   - **Name**: Display name (e.g., "My React App")
   - **ID**: Unique slug (e.g., "my-react-app")
   - **Folder Path**: Full path to project (e.g., "D:/git/my-react-app")
   - **Start Command**: How to start it (e.g., "npm run dev")
   - **Port**: (Optional) Port number for quick browser open

### Via projects.json

Edit `projects.json` directly:

```json
[
  {
    "id": "my-app",
    "name": "My Application",
    "folder": "D:/git/my-app",
    "command": "npm run dev",
    "port": 3000
  },
  {
    "id": "api-server",
    "name": "API Server",
    "folder": "D:/git/api",
    "command": "npm start",
    "port": 8080
  }
]
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift + S` | Start all projects |
| `Shift + X` | Stop all projects |
| `N` | Add new project |
| `Escape` | Close modals |

---

## Settings

Click the **⚙️** gear icon to access settings:

- **Theme** - Dark or Light mode
- **Auto-refresh interval** - How often to check for external processes
- **Default log lines** - Number of log lines to show
- **Auto-start** - Start all projects when dashboard launches

Settings are saved in your browser's localStorage.

---

## Docker Integration

The Docker tab shows all containers (running and stopped):

- **Start/Stop/Restart** containers
- **View logs** for any container
- **Remove** stopped containers

Requirements:
- Docker Desktop (Windows/macOS) or Docker Engine (Linux)
- Docker must be running

---

## Database Detection

The Databases tab automatically detects:

| Database | Default Port |
|----------|-------------|
| PostgreSQL | 5432 |
| MongoDB | 27017 |
| Redis | 6379 |
| MySQL | 3306 |

---

## External Process Detection

DevStation detects when dev servers are running outside the dashboard:

- **Yellow indicator** on the main list shows external processes
- **Adopt** - Kill external process and restart through dashboard
- **Kill** - Just kill the external process

Use **🔍 Scan Ports** to find all running dev servers on your machine.

---

## API Endpoints

DevStation exposes a REST API:

```bash
# Get all project status
GET /api/status

# Get single project status
GET /api/status/:id

# Start/stop/restart
POST /api/start/:id
POST /api/stop/:id
POST /api/restart/:id

# Start/stop all
POST /api/start-all
POST /api/stop-all

# Get logs
GET /api/logs/:id?lines=50

# Scan for dev servers
GET /api/scan

# Docker operations
GET /api/docker
POST /api/docker/start/:id
POST /api/docker/stop/:id
POST /api/docker/restart/:id
POST /api/docker/remove/:id
GET /api/docker/logs/:id

# Database detection
GET /api/databases
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVSTATION_PORT` | 4000 | Port for the dashboard server |

### Changing the Port

```bash
# Windows
set DEVSTATION_PORT=5000 && node server.js

# Linux/macOS
DEVSTATION_PORT=5000 node server.js
```

---

## Tech Stack

- **Backend**: Node.js, Express, WebSocket
- **Frontend**: Vanilla HTML/CSS/JS (no framework dependencies)
- **Process Management**: `tree-kill` for proper process tree termination
- **Bundling**: `pkg` for standalone executables

---

## Troubleshooting

### "ECONNREFUSED" error in CLI

The dashboard server isn't running. Start it first:

```bash
node server.js
```

### Port already in use

Another process is using port 4000. Either:
1. Kill that process
2. Use a different port: `DEVSTATION_PORT=5000 node server.js`

### Dev server won't start

Check the logs in DevStation. Common issues:
- Wrong folder path
- Wrong start command
- Missing dependencies (run `npm install` in project folder)

### External process detected

A dev server is running outside DevStation (e.g., from a terminal). Options:
1. **Adopt** - Kill it and restart through DevStation
2. **Kill** - Just kill the external process
3. Use DevStation from now on to avoid this

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Credits

Built by **Machine King Labs**

