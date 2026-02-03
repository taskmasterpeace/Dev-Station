const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const ProcessManager = require('./lib/process-manager');
const config = require('./lib/config');

const PORT = 4000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Process manager instance
const pm = new ProcessManager();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected');

  // Send initial status
  ws.send(JSON.stringify({
    type: 'init',
    projects: pm.getAllStatus()
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Hook up process manager events
pm.onLog = (projectId, entry) => {
  broadcast({
    type: 'log',
    project: projectId,
    stream: entry.stream,
    line: entry.line,
    timestamp: entry.timestamp
  });
};

pm.onStatusChange = (projectId, status, pid, exitCode = null) => {
  broadcast({
    type: 'status',
    project: projectId,
    status,
    pid,
    exitCode,
    data: pm.getStatus(projectId)
  });
};

// API Routes

// Get all project statuses (with external process detection)
app.get('/api/status', async (req, res) => {
  const net = require('net');
  const statuses = pm.getAllStatus();

  // Quick port check - just see if something is listening (no full scan)
  const portChecks = statuses
    .filter(s => s.port && s.status !== 'running')
    .map(s => new Promise(resolve => {
      const socket = new net.Socket();
      socket.setTimeout(100);
      socket.once('connect', () => {
        socket.destroy();
        resolve({ id: s.id, port: s.port, listening: true });
      });
      socket.once('error', () => resolve({ id: s.id, port: s.port, listening: false }));
      socket.once('timeout', () => {
        socket.destroy();
        resolve({ id: s.id, port: s.port, listening: false });
      });
      socket.connect(s.port, '127.0.0.1');
    }));

  try {
    const results = await Promise.all(portChecks);
    results.forEach(r => {
      if (r.listening) {
        const status = statuses.find(s => s.id === r.id);
        if (status) status.externalPid = true; // Just mark as external, don't need actual PID
      }
    });
  } catch {}

  res.json({ success: true, data: statuses });
});

// Get single project status
app.get('/api/status/:id', (req, res) => {
  const status = pm.getStatus(req.params.id);
  if (!status) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }
  res.json({ success: true, data: status });
});

// Start a project
app.post('/api/start/:id', async (req, res) => {
  const result = await pm.startProject(req.params.id);
  res.json(result);
});

// Stop a project
app.post('/api/stop/:id', async (req, res) => {
  const result = await pm.stopProject(req.params.id);
  res.json(result);
});

// Restart a project
app.post('/api/restart/:id', async (req, res) => {
  const result = await pm.restartProject(req.params.id);
  res.json(result);
});

// Get logs for a project
app.get('/api/logs/:id', (req, res) => {
  const lines = parseInt(req.query.lines) || 100;
  const logs = pm.getLogs(req.params.id, lines);
  res.json({ success: true, data: logs });
});

// Clear logs for a project
app.post('/api/logs/:id/clear', (req, res) => {
  pm.clearLogs(req.params.id);
  res.json({ success: true });
});

// Add new project
app.post('/api/projects', (req, res) => {
  const { id, name, folder, command, port } = req.body;

  if (!id || !name || !folder || !command) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const result = config.addProject({ id, name, folder, command, port: port || null });

  if (result.success) {
    broadcast({ type: 'project_added', project: config.getProject(id) });
  }

  res.json(result);
});

// Update project
app.put('/api/projects/:id', (req, res) => {
  const result = config.updateProject(req.params.id, req.body);

  if (result.success) {
    broadcast({ type: 'project_updated', project: result.project });
  }

  res.json(result);
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  // Stop project first if running
  const status = pm.getStatus(req.params.id);
  if (status && status.status === 'running') {
    await pm.stopProject(req.params.id);
  }

  const result = config.deleteProject(req.params.id);

  if (result.success) {
    broadcast({ type: 'project_deleted', projectId: req.params.id });
  }

  res.json(result);
});

// Start all projects
app.post('/api/start-all', async (req, res) => {
  const projects = config.loadProjects();
  const results = [];

  for (const project of projects) {
    const status = pm.getStatus(project.id);
    if (status.status !== 'running') {
      results.push(await pm.startProject(project.id));
    }
  }

  res.json({ success: true, results });
});

// Stop all projects
app.post('/api/stop-all', async (req, res) => {
  const projects = config.loadProjects();
  const results = [];

  for (const project of projects) {
    const status = pm.getStatus(project.id);
    if (status.status === 'running') {
      results.push(await pm.stopProject(project.id));
    }
  }

  res.json({ success: true, results });
});

// Browse folders API
app.get('/api/browse', (req, res) => {
  let dirPath = req.query.path || 'D:/git';

  // Normalize path
  dirPath = path.normalize(dirPath);

  try {
    // Check if path exists
    if (!fs.existsSync(dirPath)) {
      return res.json({ success: false, error: 'Path does not exist' });
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return res.json({ success: false, error: 'Not a directory' });
    }

    // Read directory contents
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Filter to only directories and sort
    const folders = entries
      .filter(entry => {
        try {
          return entry.isDirectory() && !entry.name.startsWith('.');
        } catch {
          return false;
        }
      })
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name).replace(/\\/g, '/')
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Get parent directory
    const parent = path.dirname(dirPath).replace(/\\/g, '/');

    res.json({
      success: true,
      current: dirPath.replace(/\\/g, '/'),
      parent: parent !== dirPath.replace(/\\/g, '/') ? parent : null,
      folders
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Kill an external process by port (finds PID first)
app.post('/api/kill-port/:port', async (req, res) => {
  const { exec } = require('child_process');
  const port = parseInt(req.params.port);
  if (!port || isNaN(port)) {
    return res.status(400).json({ success: false, error: 'Invalid port' });
  }

  try {
    // Find PID listening on this port
    const netstatOutput = await new Promise((resolve, reject) => {
      exec('netstat -ano', { encoding: 'utf8' }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    let pid = null;
    netstatOutput.split('\n').forEach(line => {
      const match = line.match(/TCP\s+[\d.]+:(\d+)\s+[\d.]+:\d+\s+LISTENING\s+(\d+)/);
      if (match && parseInt(match[1]) === port) {
        pid = parseInt(match[2]);
      }
    });

    if (!pid) {
      return res.json({ success: false, error: 'No process found on port' });
    }

    // Kill it
    const treeKill = require('tree-kill');
    return new Promise((resolve) => {
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) {
          treeKill(pid, 'SIGKILL', (err2) => {
            if (err2) {
              res.json({ success: false, error: err2.message });
            } else {
              res.json({ success: true, pid });
            }
            resolve();
          });
        } else {
          res.json({ success: true, pid });
          resolve();
        }
      });
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Kill an external process by PID
app.post('/api/kill/:pid', async (req, res) => {
  const pid = parseInt(req.params.pid);
  if (!pid || isNaN(pid)) {
    return res.status(400).json({ success: false, error: 'Invalid PID' });
  }

  const treeKill = require('tree-kill');

  return new Promise((resolve) => {
    treeKill(pid, 'SIGTERM', (err) => {
      if (err) {
        // Try force kill
        treeKill(pid, 'SIGKILL', (err2) => {
          if (err2) {
            res.json({ success: false, error: err2.message });
          } else {
            res.json({ success: true });
          }
          resolve();
        });
      } else {
        res.json({ success: true });
        resolve();
      }
    });
  });
});

// Scan for running processes on ports
app.get('/api/scan', async (req, res) => {
  const { exec } = require('child_process');

  // Get all configured project ports
  const projects = config.loadProjects();
  const projectPorts = new Map();
  projects.forEach(p => {
    if (p.port) projectPorts.set(p.port, p);
  });

  // We'll scan ALL listening ports and filter for dev-like processes
  const portsToScan = new Set([...projectPorts.keys()]);

  try {
    // Get netstat output
    const netstatOutput = await new Promise((resolve, reject) => {
      exec('netstat -ano', { encoding: 'utf8' }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    // Parse ALL listening ports
    const listening = new Map();
    netstatOutput.split('\n').forEach(line => {
      const match = line.match(/TCP\s+[\d.]+:(\d+)\s+[\d.]+:\d+\s+LISTENING\s+(\d+)/);
      if (match) {
        const port = parseInt(match[1]);
        const pid = parseInt(match[2]);
        // Only include ports in typical dev range (1000-65535) and skip system ports
        if (port >= 1024 && !listening.has(port)) {
          listening.set(port, pid);
        }
      }
    });

    // Get all process info in ONE PowerShell call (much faster!)
    const pids = [...new Set([...listening.values()])];
    const processInfo = new Map();

    try {
      const psOutput = await new Promise((resolve) => {
        exec(`powershell -Command "Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path | ConvertTo-Json"`,
          { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => resolve(stdout || '[]'));
      });
      const processes = JSON.parse(psOutput || '[]');
      const procArray = Array.isArray(processes) ? processes : [processes];
      procArray.forEach(p => {
        if (p && p.Id) {
          processInfo.set(p.Id, { name: p.ProcessName || 'unknown', path: p.Path || '' });
        }
      });
    } catch {}

    // Build results
    const results = [];
    const devProcesses = ['node', 'python', 'python3', 'ruby', 'java', 'php', 'go', 'deno', 'bun'];

    for (const [port, pid] of listening) {
      const info = processInfo.get(pid) || { name: 'unknown', path: '' };
      const processName = info.name;
      const commandLine = info.path;

      // Only include dev-like processes OR configured project ports
      const isDevProcess = devProcesses.some(dp => processName.toLowerCase().includes(dp));
      const isProjectPort = projectPorts.has(port);

      if (!isDevProcess && !isProjectPort) continue;

      // Determine if it's managed by dashboard
      const dashboardStatus = pm.getStatus(projectPorts.get(port)?.id);
      const isManagedByDashboard = dashboardStatus?.status === 'running';

      const project = projectPorts.get(port);
      results.push({
        port,
        pid,
        processName,
        commandLine,
        projectId: project?.id || null,
        projectName: project?.name || null,
        managedByDashboard: isManagedByDashboard,
        status: isManagedByDashboard ? 'managed' : (project ? 'external' : 'unknown')
      });
    }

    // Sort by port
    results.sort((a, b) => a.port - b.port);

    res.json({ success: true, data: results });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get drives (Windows)
app.get('/api/drives', (req, res) => {
  const drives = [];
  // Check common drive letters
  for (const letter of 'CDEFGHIJ') {
    const drivePath = `${letter}:/`;
    try {
      if (fs.existsSync(drivePath)) {
        drives.push({ name: `${letter}:`, path: drivePath });
      }
    } catch {
      // Drive not accessible
    }
  }
  res.json({ success: true, drives });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await pm.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await pm.shutdown();
  process.exit(0);
});

// Start server
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║         DEV DASHBOARD RUNNING             ║
  ╠═══════════════════════════════════════════╣
  ║  URL: http://localhost:${PORT}               ║
  ║  API: http://localhost:${PORT}/api/status    ║
  ╚═══════════════════════════════════════════╝
  `);
});
