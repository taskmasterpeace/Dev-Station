#!/usr/bin/env node
/**
 * Dev Dashboard CLI
 *
 * Usage:
 *   node cli.js status              - Show all projects and their status
 *   node cli.js status <id>         - Show single project status
 *   node cli.js start <id>          - Start a project
 *   node cli.js stop <id>           - Stop a project
 *   node cli.js restart <id>        - Restart a project
 *   node cli.js logs <id>           - Show recent logs (last 50 lines)
 *   node cli.js list                - List all project IDs
 *   node cli.js open <id>           - Open project in browser
 *   node cli.js start-all           - Start all projects
 *   node cli.js stop-all            - Stop all projects
 */

const http = require('http');
const { exec } = require('child_process');

const BASE_URL = 'http://localhost:4000';

// Parse args - support --json flag anywhere
const args = process.argv.slice(2);
const jsonMode = args.includes('--json') || args.includes('-j');
const filteredArgs = args.filter(a => a !== '--json' && a !== '-j');
const [command, arg] = filteredArgs;

// JSON output helper
function output(data, type = 'success') {
  if (jsonMode) {
    console.log(JSON.stringify(data));
  } else if (type === 'error') {
    console.error(typeof data === 'string' ? data : data.error || 'Error');
  }
}

function exitCode(success) {
  process.exit(success ? 0 : 1);
}

async function api(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        console.error('ERROR: Dev Dashboard server not running');
        console.error('Start it with: node server.js (or start.bat)');
        process.exit(1);
      }
      reject(err);
    });

    req.end();
  });
}

function formatStatus(status) {
  const icons = {
    running: '🟢',
    stopped: '🔴',
    starting: '🟡',
    stopping: '🔵'
  };
  return icons[status] || '⚪';
}

function formatUptime(ms) {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function showStatus(id) {
  if (id) {
    const res = await api('GET', `/api/status/${id}`);
    if (!res.success) {
      if (jsonMode) { output(res); exitCode(false); return; }
      console.error(`ERROR: ${res.error}`);
      process.exit(1);
    }
    if (jsonMode) { output(res); return; }

    const p = res.data;
    console.log(`${formatStatus(p.status)} ${p.name} (${p.id})`);
    console.log(`   Status:  ${p.status}${p.externalPid ? ' (external)' : ''}`);
    console.log(`   Port:    ${p.port || '-'}`);
    console.log(`   Folder:  ${p.folder}`);
    console.log(`   Command: ${p.command}`);
    console.log(`   PID:     ${p.pid || '-'}`);
    console.log(`   Uptime:  ${formatUptime(p.uptime)}`);
    if (p.warnings?.length) {
      console.log(`   Warnings: ${p.warnings.join(', ')}`);
    }
    if (p.lastOutput) {
      console.log(`   Last:    ${p.lastOutput}`);
    }
  } else {
    const res = await api('GET', '/api/status');
    if (!res.success) {
      if (jsonMode) { output(res); exitCode(false); return; }
      console.error('ERROR: Failed to get status');
      process.exit(1);
    }
    if (jsonMode) { output(res); return; }

    if (res.data.length === 0) {
      console.log('No projects configured');
      return;
    }

    console.log('');
    console.log('  ID              STATUS     PORT    NAME');
    console.log('  ' + '-'.repeat(60));

    for (const p of res.data) {
      const port = p.port ? `:${p.port}` : '     ';
      const statusText = p.externalPid ? 'external' : p.status;
      const uptime = p.status === 'running' ? ` (${formatUptime(p.uptime)})` : '';
      console.log(`  ${formatStatus(p.status)} ${p.id.padEnd(14)} ${statusText.padEnd(10)} ${port.padEnd(6)}  ${p.name}${uptime}`);
    }
    console.log('');
  }
}

async function startProject(id) {
  if (!jsonMode) console.log(`Starting ${id}...`);
  const res = await api('POST', `/api/start/${id}`);
  if (jsonMode) { output({ success: res.success, id, pid: res.pid, error: res.error }); exitCode(res.success); return; }
  if (res.success) {
    console.log(`✓ Started ${id} (PID: ${res.pid})`);
  } else {
    console.error(`✗ Failed: ${res.error}`);
    process.exit(1);
  }
}

async function stopProject(id) {
  if (!jsonMode) console.log(`Stopping ${id}...`);
  const res = await api('POST', `/api/stop/${id}`);
  if (jsonMode) { output({ success: res.success, id, error: res.error }); exitCode(res.success); return; }
  if (res.success) {
    console.log(`✓ Stopped ${id}`);
  } else {
    console.error(`✗ Failed: ${res.error}`);
    process.exit(1);
  }
}

async function restartProject(id) {
  if (!jsonMode) console.log(`Restarting ${id}...`);
  const res = await api('POST', `/api/restart/${id}`);
  if (jsonMode) { output({ success: res.success, id, pid: res.pid, error: res.error }); exitCode(res.success); return; }
  if (res.success) {
    console.log(`✓ Restarted ${id} (PID: ${res.pid})`);
  } else {
    console.error(`✗ Failed: ${res.error}`);
    process.exit(1);
  }
}

async function showLogs(id) {
  const res = await api('GET', `/api/logs/${id}?lines=50`);
  if (!res.success) {
    if (jsonMode) { output(res); exitCode(false); return; }
    console.error(`ERROR: ${res.error || 'Failed to get logs'}`);
    process.exit(1);
  }
  if (jsonMode) { output(res); return; }

  if (res.data.length === 0) {
    console.log('No logs available');
    return;
  }

  for (const log of res.data) {
    const prefix = log.stream === 'stderr' ? '[ERR]' : '[OUT]';
    console.log(`${prefix} ${log.line}`);
  }
}

async function listProjects() {
  const res = await api('GET', '/api/status');
  if (!res.success) {
    if (jsonMode) { output(res); exitCode(false); return; }
    console.error('ERROR: Failed to get projects');
    process.exit(1);
  }
  if (jsonMode) { output({ success: true, ids: res.data.map(p => p.id) }); return; }

  for (const p of res.data) {
    console.log(p.id);
  }
}

async function openProject(id) {
  const res = await api('GET', `/api/status/${id}`);
  if (!res.success) {
    console.error(`ERROR: ${res.error}`);
    process.exit(1);
  }

  if (!res.data.port) {
    console.error('ERROR: Project has no port configured');
    process.exit(1);
  }

  const url = `http://localhost:${res.data.port}`;
  console.log(`Opening ${url}...`);

  // Cross-platform open
  const cmd = process.platform === 'win32' ? `start ${url}` :
              process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd);
}

async function startAll() {
  if (!jsonMode) console.log('Starting all projects...');
  const res = await api('POST', '/api/start-all');
  if (jsonMode) { output(res); exitCode(res.success); return; }
  if (res.success) {
    console.log('✓ All projects started');
  } else {
    console.error('✗ Failed to start all');
    process.exit(1);
  }
}

async function stopAll() {
  if (!jsonMode) console.log('Stopping all projects...');
  const res = await api('POST', '/api/stop-all');
  if (jsonMode) { output(res); exitCode(res.success); return; }
  if (res.success) {
    console.log('✓ All projects stopped');
  } else {
    console.error('✗ Failed to stop all');
    process.exit(1);
  }
}

async function scanPorts() {
  if (!jsonMode) console.log('Scanning for running dev servers...\n');
  const res = await api('GET', '/api/scan');
  if (!res.success) {
    if (jsonMode) { output(res); exitCode(false); return; }
    console.error('ERROR: Failed to scan');
    process.exit(1);
  }
  if (jsonMode) { output(res); return; }

  if (res.data.length === 0) {
    console.log('No dev servers found on common ports');
    return;
  }

  console.log('  PORT    PID       STATUS      PROCESS          PROJECT');
  console.log('  ' + '-'.repeat(65));

  for (const item of res.data) {
    const statusIcon = item.status === 'managed' ? '✓' : item.status === 'external' ? '⚠' : '?';
    const statusText = item.status === 'managed' ? 'managed' :
                       item.status === 'external' ? 'EXTERNAL' : 'unknown';
    const project = item.projectName || (item.projectId ? item.projectId : '-');

    console.log(`  ${statusIcon} :${String(item.port).padEnd(5)} ${String(item.pid).padEnd(9)} ${statusText.padEnd(11)} ${item.processName.padEnd(16)} ${project}`);
  }

  const external = res.data.filter(i => i.status === 'external');
  if (external.length > 0) {
    console.log('\n⚠ EXTERNAL processes are running on your project ports but not managed by dashboard.');
    console.log('  These may be from manually running npm run dev in a terminal.');
    console.log('  Kill them with: taskkill /F /PID <pid>');
  }
}

function showHelp() {
  console.log(`
⚡ DevStation CLI

Usage:
  node cli.js <command> [id] [--json]

Commands:
  status [id]     Show status of all projects or a specific one
  start <id>      Start a project
  stop <id>       Stop a project
  restart <id>    Restart a project
  logs <id>       Show recent logs (last 50 lines)
  list            List all project IDs
  open <id>       Open project in browser
  start-all       Start all projects
  stop-all        Stop all projects
  scan            Scan for running dev servers (managed & external)
  help            Show this help

Options:
  --json, -j      Output in JSON format (for AI agents/scripts)

Examples:
  node cli.js status
  node cli.js start hyh
  node cli.js status --json
  node cli.js scan -j
`);
}

// Main
(async () => {
  try {
    switch (command) {
      case 'status':
        await showStatus(arg);
        break;
      case 'start':
        if (!arg) { console.error('ERROR: Project ID required'); process.exit(1); }
        await startProject(arg);
        break;
      case 'stop':
        if (!arg) { console.error('ERROR: Project ID required'); process.exit(1); }
        await stopProject(arg);
        break;
      case 'restart':
        if (!arg) { console.error('ERROR: Project ID required'); process.exit(1); }
        await restartProject(arg);
        break;
      case 'logs':
        if (!arg) { console.error('ERROR: Project ID required'); process.exit(1); }
        await showLogs(arg);
        break;
      case 'list':
        await listProjects();
        break;
      case 'open':
        if (!arg) { console.error('ERROR: Project ID required'); process.exit(1); }
        await openProject(arg);
        break;
      case 'start-all':
        await startAll();
        break;
      case 'stop-all':
        await stopAll();
        break;
      case 'scan':
        await scanPorts();
        break;
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        showHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
