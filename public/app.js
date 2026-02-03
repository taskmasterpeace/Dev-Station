// State
let projects = [];
let dockerContainers = [];
let databases = [];
let currentTab = 'servers';
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// DOM Elements
const projectsContainer = document.getElementById('projects');
const emptyState = document.getElementById('empty-state');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const connectionStatus = document.getElementById('connection-status');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  setupKeyboardShortcuts();
});

// Tab Management
function switchTab(tab) {
  currentTab = tab;

  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tab}`);
  });

  // Load data for the tab
  if (tab === 'docker') {
    loadDockerContainers();
  } else if (tab === 'databases') {
    loadDatabases();
  }
}

// Docker Management
async function loadDockerContainers() {
  const container = document.getElementById('docker-containers');
  const empty = document.getElementById('docker-empty');

  empty.innerHTML = '<h2>Loading Docker containers...</h2><p>Checking Docker...</p>';
  empty.style.display = 'block';
  container.innerHTML = '';

  try {
    const res = await fetch('/api/docker');
    const data = await res.json();

    if (!data.success) {
      empty.innerHTML = `<h2>Docker not available</h2><p>${data.error || 'Make sure Docker Desktop is running'}</p>`;
      return;
    }

    dockerContainers = data.data;

    if (dockerContainers.length === 0) {
      empty.innerHTML = '<h2>No containers found</h2><p>No Docker containers are running or stopped</p>';
      return;
    }

    empty.style.display = 'none';
    container.innerHTML = dockerContainers.map(renderDockerCard).join('');
  } catch (err) {
    empty.innerHTML = `<h2>Error loading Docker</h2><p>${err.message}</p>`;
  }
}

function renderDockerCard(c) {
  const isRunning = c.state === 'running';
  const statusClass = isRunning ? 'running' : 'stopped';

  return `
    <div class="project-card" data-id="${c.id}">
      <div class="project-header">
        <div class="project-info">
          <div class="project-title">
            <span class="status-dot ${statusClass}"></span>
            <h3>${escapeHtml(c.name)}</h3>
            ${isRunning ? `<span class="uptime">${escapeHtml(c.status)}</span>` : ''}
          </div>
          <div class="project-meta">
            <span>🐳 ${escapeHtml(c.image)}</span>
            ${c.ports ? `<span class="project-port">${escapeHtml(c.ports)}</span>` : ''}
          </div>
        </div>
        <div class="project-actions">
          ${isRunning ? `
            <button class="small" onclick="dockerAction('stop', '${c.id}')">Stop</button>
            <button class="small" onclick="dockerAction('restart', '${c.id}')">Restart</button>
          ` : `
            <button class="success small" onclick="dockerAction('start', '${c.id}')">Start</button>
          `}
          <button class="small" onclick="toggleDockerLogs('${c.id}')">Logs</button>
          <button class="small danger" onclick="dockerAction('remove', '${c.id}')">&times;</button>
        </div>
      </div>
      <div id="docker-logs-${c.id}" class="project-logs">
        <div class="logs-header">
          <span>Container Logs</span>
        </div>
        <div id="docker-logs-content-${c.id}" class="logs-content"></div>
      </div>
    </div>
  `;
}

async function dockerAction(action, containerId) {
  const btn = event?.target;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/docker/${action}/${containerId}`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast(`Container ${action}ed`, 'success');
      await loadDockerContainers();
    } else {
      toast(data.error || `Failed to ${action}`, 'error');
    }
  } catch (err) {
    toast(err.message, 'error');
  }

  if (btn) btn.disabled = false;
}

async function toggleDockerLogs(containerId) {
  const logsEl = document.getElementById(`docker-logs-${containerId}`);
  const isOpen = logsEl.classList.contains('open');

  if (!isOpen) {
    const content = document.getElementById(`docker-logs-content-${containerId}`);
    content.innerHTML = '<div class="log-line">Loading logs...</div>';

    try {
      const res = await fetch(`/api/docker/logs/${containerId}`);
      const data = await res.json();

      if (data.success) {
        content.innerHTML = data.logs.split('\n').map(line =>
          `<div class="log-line">${escapeHtml(line)}</div>`
        ).join('');
        content.scrollTop = content.scrollHeight;
      } else {
        content.innerHTML = `<div class="log-line stderr">${data.error}</div>`;
      }
    } catch (err) {
      content.innerHTML = `<div class="log-line stderr">${err.message}</div>`;
    }
  }

  logsEl.classList.toggle('open');
}

// Database Management
async function loadDatabases() {
  const container = document.getElementById('databases');
  const empty = document.getElementById('databases-empty');

  empty.innerHTML = '<h2>Scanning for databases...</h2><p>Looking for PostgreSQL, MongoDB, Redis, MySQL</p>';
  empty.style.display = 'block';
  container.innerHTML = '';

  try {
    const res = await fetch('/api/databases');
    const data = await res.json();

    if (!data.success) {
      empty.innerHTML = `<h2>Error scanning</h2><p>${data.error}</p>`;
      return;
    }

    databases = data.data;

    if (databases.length === 0) {
      empty.innerHTML = '<h2>No databases found</h2><p>No PostgreSQL, MongoDB, Redis, or MySQL detected</p>';
      return;
    }

    empty.style.display = 'none';
    container.innerHTML = databases.map(renderDatabaseCard).join('');
  } catch (err) {
    empty.innerHTML = `<h2>Error</h2><p>${err.message}</p>`;
  }
}

function renderDatabaseCard(db) {
  const statusClass = db.running ? 'running' : 'stopped';
  const icons = { postgresql: '🐘', mongodb: '🍃', redis: '🔴', mysql: '🐬' };
  const icon = icons[db.type] || '🗄️';

  return `
    <div class="project-card">
      <div class="project-header">
        <div class="project-info">
          <div class="project-title">
            <span class="status-dot ${statusClass}"></span>
            <h3>${icon} ${escapeHtml(db.name)}</h3>
          </div>
          <div class="project-meta">
            <span>${escapeHtml(db.type)}</span>
            <span class="project-port">:${db.port}</span>
            ${db.pid ? `<span>PID: ${db.pid}</span>` : ''}
          </div>
        </div>
        <div class="project-actions">
          ${db.running ? `
            <span class="scan-status-badge managed">Running</span>
          ` : `
            <span class="scan-status-badge" style="background:#333;color:#888;">Stopped</span>
          `}
        </div>
      </div>
    </div>
  `;
}

// Auto-refresh status periodically to catch external processes
setInterval(async () => {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.success) {
      projects = data.data;
      renderProjects();
    }
  } catch {}
}, 10000); // Every 10 seconds

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0;
    setConnectionStatus('connected', 'Connected');
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleMessage(message);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    setConnectionStatus('disconnected', 'Disconnected');
    attemptReconnect();
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function attemptReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    setConnectionStatus('connecting', `Reconnecting (${reconnectAttempts})...`);
    setTimeout(connectWebSocket, 2000);
  } else {
    setConnectionStatus('disconnected', 'Connection failed');
  }
}

function setConnectionStatus(status, text) {
  connectionStatus.className = `connection-status ${status}`;
  connectionStatus.querySelector('.text').textContent = text;
}

// Message Handlers
function handleMessage(message) {
  switch (message.type) {
    case 'init':
      projects = message.projects;
      renderProjects();
      break;

    case 'status':
      updateProjectStatus(message.project, message.data);
      break;

    case 'log':
      appendLog(message.project, message);
      break;

    case 'project_added':
      projects.push(message.project);
      renderProjects();
      toast('Project added', 'success');
      break;

    case 'project_updated':
      const idx = projects.findIndex(p => p.id === message.project.id);
      if (idx !== -1) {
        projects[idx] = { ...projects[idx], ...message.project };
        renderProjects();
      }
      toast('Project updated', 'success');
      break;

    case 'project_deleted':
      projects = projects.filter(p => p.id !== message.projectId);
      renderProjects();
      toast('Project deleted', 'info');
      break;

    case 'warning':
      updateProjectWarnings(message.project, message.warning, true);
      break;

    case 'warning_cleared':
      updateProjectWarnings(message.project, message.warning, false);
      break;
  }
}

function updateProjectStatus(projectId, data, message) {
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx !== -1) {
    projects[idx] = { ...projects[idx], ...data };
    renderProjectCard(projects[idx]);

    // If crashed, show toast and auto-expand logs
    if (data.status === 'crashed') {
      toast(`${projects[idx].name} crashed! Check logs for details.`, 'error');
      // Auto-expand logs panel
      const logsEl = document.getElementById(`logs-${projectId}`);
      if (logsEl && !logsEl.classList.contains('open')) {
        fetchLogs(projectId);
        logsEl.classList.add('open');
      }
    }
  }
}

function updateProjectWarnings(projectId, warning, add) {
  const project = projects.find(p => p.id === projectId);
  if (project) {
    if (!project.warnings) project.warnings = [];
    if (add && !project.warnings.includes(warning)) {
      project.warnings.push(warning);
    } else if (!add) {
      project.warnings = project.warnings.filter(w => w !== warning);
    }
    renderProjectCard(project);
  }
}

// Rendering
function renderProjects() {
  if (projects.length === 0) {
    projectsContainer.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  projectsContainer.innerHTML = projects.map(p => renderProjectCardHTML(p)).join('');
}

function renderProjectCard(project) {
  const card = document.getElementById(`project-${project.id}`);
  if (card) {
    card.outerHTML = renderProjectCardHTML(project);
  }
}

function renderProjectCardHTML(p) {
  const isExternal = !!p.externalPid && p.status !== 'running';
  const statusClass = isExternal ? 'external' : (p.status || 'stopped');
  const isRunning = statusClass === 'running';
  const isStopped = statusClass === 'stopped' || statusClass === 'crashed';
  const isCrashed = statusClass === 'crashed';
  const uptime = p.uptime ? formatUptime(p.uptime) : '';
  const warnings = (p.warnings || []).map(w =>
    `<span class="warning-badge ${w}">${formatWarning(w)}</span>`
  ).join('');

  return `
    <div id="project-${p.id}" class="project-card" data-id="${p.id}">
      <div class="project-header">
        <div class="project-info">
          <div class="project-title">
            <span class="status-dot ${statusClass}"></span>
            <h3>${escapeHtml(p.name)}</h3>
            ${isRunning && uptime ? `<span class="uptime">${uptime}</span>` : ''}
            ${isCrashed ? `<span class="crashed-badge">CRASHED</span>` : ''}
            ${isExternal ? `<span class="external-badge">⚡ Running Externally</span>` : ''}
          </div>
          <div class="project-meta">
            <span>${escapeHtml(p.folder)}</span>
            ${p.port ? `<span class="project-port">:${p.port}</span>` : ''}
          </div>
          ${warnings ? `<div class="warnings">${warnings}</div>` : ''}
        </div>
        <div class="project-actions">
          ${isExternal ? `
            ${p.port ? `<button class="small open-btn" onclick="openInBrowser('${p.port}')" title="Open in browser">Open ↗</button>` : ''}
            <button class="success small" onclick="adoptExternal('${p.id}', ${p.port})">Adopt</button>
            <button class="small danger" onclick="killExternalByPort('${p.id}', ${p.port})">Kill</button>
          ` : isStopped ? `
            <button class="success small" onclick="startProject('${p.id}')">Start</button>
          ` : `
            ${p.port ? `<button class="small open-btn" onclick="openInBrowser('${p.port}')" title="Open in browser">Open ↗</button>` : ''}
            <button class="small" onclick="stopProject('${p.id}')">Stop</button>
            <button class="small" onclick="restartProject('${p.id}')">Restart</button>
          `}
          <button class="small" onclick="toggleLogs('${p.id}')">Logs</button>
          <button class="small" onclick="openEditModal('${p.id}')">Edit</button>
          <button class="small danger" onclick="deleteProject('${p.id}')">&times;</button>
        </div>
      </div>
      <div id="logs-${p.id}" class="project-logs">
        <div class="logs-header">
          <span>Output</span>
          <div class="logs-actions">
            <button class="small" onclick="copyLogs('${p.id}')">Copy</button>
            <button class="small" onclick="clearLogs('${p.id}')">Clear</button>
          </div>
        </div>
        <div id="logs-content-${p.id}" class="logs-content"></div>
      </div>
    </div>
  `;
}

// Project Actions
async function startProject(id) {
  const btn = document.querySelector(`#project-${id} .project-actions button.success`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Starting...';
  }

  const res = await fetch(`/api/start/${id}`, { method: 'POST' });
  const data = await res.json();
  if (!data.success) {
    toast(data.error || 'Failed to start', 'error');
    // Re-enable button on failure
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Start';
    }
  }
}

async function stopProject(id) {
  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Stopping...';
  }

  const res = await fetch(`/api/stop/${id}`, { method: 'POST' });
  const data = await res.json();
  if (!data.success) {
    toast(data.error || 'Failed to stop', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Stop';
    }
  }
}

async function restartProject(id) {
  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Restarting...';
  }

  const res = await fetch(`/api/restart/${id}`, { method: 'POST' });
  const data = await res.json();
  if (!data.success) {
    toast(data.error || 'Failed to restart', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Restart';
    }
  }
}

async function deleteProject(id) {
  if (!confirm('Delete this project?')) return;
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) {
    toast(data.error || 'Failed to delete', 'error');
  }
}

async function startAll() {
  await fetch('/api/start-all', { method: 'POST' });
  toast('Starting all projects...', 'info');
}

async function stopAll() {
  await fetch('/api/stop-all', { method: 'POST' });
  toast('Stopping all projects...', 'info');
}

function openInBrowser(port) {
  window.open(`http://localhost:${port}`, '_blank');
}

async function killExternalByPort(id, port) {
  if (!confirm(`Kill external process on port ${port}?`)) return;

  const res = await fetch(`/api/kill-port/${port}`, { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    toast('External process killed', 'success');
  } else {
    toast(data.error || 'Failed to kill process', 'error');
  }
}

async function adoptExternal(id, port) {
  if (!confirm(`Kill external process on port ${port} and start through dashboard?`)) return;

  // Kill by port first
  const killRes = await fetch(`/api/kill-port/${port}`, { method: 'POST' });
  const killData = await killRes.json();
  if (!killData.success) {
    toast(killData.error || 'Failed to kill process', 'error');
    return;
  }

  // Wait a moment then start
  await new Promise(r => setTimeout(r, 1000));
  await startProject(id);
}

// Keep old functions for scan modal
async function killExternal(id, pid) {
  if (!confirm(`Kill external process (PID ${pid})?`)) return;

  const res = await fetch(`/api/kill/${pid}`, { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    toast('External process killed', 'success');
    setTimeout(() => location.reload(), 500);
  } else {
    toast(data.error || 'Failed to kill process', 'error');
  }
}

async function killAndStart(id, pid) {
  if (!confirm(`Kill external process and start through dashboard?`)) return;

  const killRes = await fetch(`/api/kill/${pid}`, { method: 'POST' });
  const killData = await killRes.json();
  if (!killData.success) {
    toast(killData.error || 'Failed to kill process', 'error');
    return;
  }

  await new Promise(r => setTimeout(r, 1000));
  await startProject(id);
}

// Logs
function toggleLogs(id) {
  const logsEl = document.getElementById(`logs-${id}`);
  const isOpen = logsEl.classList.contains('open');

  if (!isOpen) {
    // Fetch existing logs first
    fetchLogs(id);
  }

  logsEl.classList.toggle('open');
}

async function fetchLogs(id) {
  const res = await fetch(`/api/logs/${id}?lines=200`);
  const data = await res.json();
  const container = document.getElementById(`logs-content-${id}`);

  if (data.success && data.data) {
    container.innerHTML = data.data.map(log =>
      `<div class="log-line ${log.stream}">${escapeHtml(log.line)}</div>`
    ).join('');
    container.scrollTop = container.scrollHeight;
  }
}

function appendLog(projectId, log) {
  const container = document.getElementById(`logs-content-${projectId}`);
  if (!container) return;

  const div = document.createElement('div');
  div.className = `log-line ${log.stream}`;
  div.textContent = log.line;
  container.appendChild(div);

  // Auto-scroll if near bottom
  if (container.scrollHeight - container.scrollTop - container.clientHeight < 100) {
    container.scrollTop = container.scrollHeight;
  }

  // Limit displayed logs
  while (container.children.length > 500) {
    container.removeChild(container.firstChild);
  }
}

async function clearLogs(id) {
  await fetch(`/api/logs/${id}/clear`, { method: 'POST' });
  document.getElementById(`logs-content-${id}`).innerHTML = '';
}

function copyLogs(id) {
  const container = document.getElementById(`logs-content-${id}`);
  const text = Array.from(container.children).map(el => el.textContent).join('\n');
  navigator.clipboard.writeText(text);
  toast('Logs copied to clipboard', 'success');
}

// Modal
function openAddModal() {
  modalTitle.textContent = 'Add Project';
  document.getElementById('edit-id').value = '';
  document.getElementById('project-form').reset();
  document.getElementById('project-id').disabled = false;
  modal.classList.add('open');
  document.getElementById('project-name').focus();
}

function openEditModal(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return;

  modalTitle.textContent = 'Edit Project';
  document.getElementById('edit-id').value = id;
  document.getElementById('project-name').value = project.name;
  document.getElementById('project-id').value = project.id;
  document.getElementById('project-id').disabled = true;
  document.getElementById('project-folder').value = project.folder;
  document.getElementById('project-command').value = project.command;
  document.getElementById('project-port').value = project.port || '';
  modal.classList.add('open');
  document.getElementById('project-name').focus();
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  modal.classList.remove('open');
}

async function saveProject(event) {
  event.preventDefault();

  const editId = document.getElementById('edit-id').value;
  const project = {
    name: document.getElementById('project-name').value,
    id: document.getElementById('project-id').value,
    folder: document.getElementById('project-folder').value,
    command: document.getElementById('project-command').value,
    port: document.getElementById('project-port').value ? parseInt(document.getElementById('project-port').value) : null
  };

  let res;
  if (editId) {
    res = await fetch(`/api/projects/${editId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
  } else {
    res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
  }

  const data = await res.json();
  if (data.success) {
    closeModal();
  } else {
    toast(data.error || 'Failed to save', 'error');
  }
}

// Toast notifications
function toast(message, type = 'info') {
  const container = document.getElementById('toasts');
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.textContent = message;
  container.appendChild(div);

  setTimeout(() => {
    div.style.animation = 'slideIn 0.2s ease reverse';
    setTimeout(() => div.remove(), 200);
  }, 3000);
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Shift+S = Start All
    if (e.shiftKey && e.key === 'S') {
      e.preventDefault();
      startAll();
    }
    // Shift+X = Stop All
    if (e.shiftKey && e.key === 'X') {
      e.preventDefault();
      stopAll();
    }
    // Escape = Close modal
    if (e.key === 'Escape') {
      closeModal();
    }
    // N = New project
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      openAddModal();
    }
  });
}

// Utilities
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatWarning(warning) {
  const map = {
    'high_log_output': '⚠ Log spam',
    'crash_loop': '🔴 Crash loop',
    'unresponsive': '⚠ Unresponsive'
  };
  return map[warning] || warning;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Scan Modal
async function openScanModal() {
  document.getElementById('scan-modal').classList.add('open');
  await refreshScan();
}

function closeScanModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('scan-modal').classList.remove('open');
}

async function refreshScan() {
  const container = document.getElementById('scan-results');
  container.innerHTML = `
    <div class="scan-loading">
      <div class="scan-spinner"></div>
      <div>Scanning all ports for dev servers...</div>
      <div class="scan-hint">Looking for Node, Python, Ruby, Java, PHP, Go, Deno, Bun</div>
    </div>
  `;

  try {
    const res = await fetch('/api/scan');
    const data = await res.json();

    if (!data.success || data.data.length === 0) {
      container.innerHTML = '<div class="scan-empty">No dev servers found on common ports</div>';
      return;
    }

    // Group by status
    const managed = data.data.filter(i => i.status === 'managed');
    const external = data.data.filter(i => i.status === 'external');
    const unknown = data.data.filter(i => i.status === 'unknown');

    let html = '';

    if (external.length > 0) {
      html += `
        <div class="scan-section">
          <h3 class="scan-section-title warning">⚠ External Processes (${external.length})</h3>
          <p class="scan-section-desc">Running on your project ports but not managed by dashboard</p>
          ${external.map(renderScanItem).join('')}
        </div>
      `;
    }

    if (managed.length > 0) {
      html += `
        <div class="scan-section">
          <h3 class="scan-section-title success">✓ Managed by Dashboard (${managed.length})</h3>
          ${managed.map(renderScanItem).join('')}
        </div>
      `;
    }

    if (unknown.length > 0) {
      html += `
        <div class="scan-section">
          <h3 class="scan-section-title muted">? Other Dev Servers (${unknown.length})</h3>
          <p class="scan-section-desc">Running on common dev ports but not configured as projects</p>
          ${unknown.map(renderScanItem).join('')}
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="scan-error">Error: ${err.message}</div>`;
  }
}

function renderScanItem(item) {
  const statusClass = item.status === 'managed' ? 'managed' :
                      item.status === 'external' ? 'external' : 'unknown';

  const canKill = item.status !== 'managed';

  return `
    <div class="scan-item ${statusClass}">
      <div class="scan-item-info">
        <span class="scan-port">:${item.port}</span>
        <span class="scan-process">${escapeHtml(item.processName)}</span>
        <span class="scan-pid">PID: ${item.pid}</span>
        ${item.projectName ? `<span class="scan-project">${escapeHtml(item.projectName)}</span>` : ''}
      </div>
      <div class="scan-item-actions">
        ${item.status === 'unknown' ? `
          <button class="small primary" onclick="addFromScan(${item.port}, '${escapeHtml(item.processName)}')">+ Add to Dashboard</button>
        ` : ''}
        ${item.status === 'external' ? `
          <button class="small success" onclick="killAndStartFromScan('${item.projectId}', ${item.pid})">Kill & Start</button>
        ` : ''}
        ${canKill ? `
          <button class="small danger" onclick="killFromScan(${item.pid})">Kill</button>
        ` : ''}
        ${item.status === 'managed' ? `
          <span class="scan-status-badge managed">Managed</span>
        ` : ''}
      </div>
    </div>
  `;
}

function addFromScan(port, processName) {
  // Close scan modal and open add modal with pre-filled port
  closeScanModal();
  openAddModal();

  // Pre-fill the port
  document.getElementById('project-port').value = port;

  // Suggest a name based on process
  const nameField = document.getElementById('project-name');
  if (!nameField.value) {
    nameField.placeholder = `${processName} server on port ${port}`;
  }

  // Focus on name field
  nameField.focus();
}

async function killFromScan(pid) {
  if (!confirm(`Kill process ${pid}?`)) return;

  const res = await fetch(`/api/kill/${pid}`, { method: 'POST' });
  const data = await res.json();

  if (data.success) {
    toast('Process killed', 'success');
    await refreshScan();
  } else {
    toast(data.error || 'Failed to kill', 'error');
  }
}

async function killAndStartFromScan(projectId, pid) {
  if (!confirm(`Kill external process and start ${projectId} through dashboard?`)) return;

  // Kill
  const killRes = await fetch(`/api/kill/${pid}`, { method: 'POST' });
  if (!killRes.ok) {
    toast('Failed to kill process', 'error');
    return;
  }

  // Wait then start
  await new Promise(r => setTimeout(r, 1000));

  const startRes = await fetch(`/api/start/${projectId}`, { method: 'POST' });
  const startData = await startRes.json();

  if (startData.success) {
    toast(`Started ${projectId}`, 'success');
    closeScanModal();
  } else {
    toast(startData.error || 'Failed to start', 'error');
  }

  await refreshScan();
}

// Folder Picker
let currentBrowsePath = 'D:/git';
let selectedFolder = null;

async function openFolderPicker() {
  console.log('Opening folder picker...');
  document.getElementById('folder-picker').classList.add('open');
  try {
    await loadDrives();
    await browseTo(currentBrowsePath);
  } catch (err) {
    console.error('Folder picker error:', err);
  }
}

function closeFolderPicker(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('folder-picker').classList.remove('open');
}

async function loadDrives() {
  console.log('Loading drives...');
  try {
    const res = await fetch('/api/drives');
    const data = await res.json();
    console.log('Drives response:', data);

    if (data.success) {
      const drivesBar = document.getElementById('drives-bar');
      drivesBar.innerHTML = data.drives.map(d =>
        `<button class="drive-btn" onclick="browseTo('${d.path}')">${d.name}</button>`
      ).join('');
    }
  } catch (err) {
    console.error('loadDrives error:', err);
  }
}

async function browseTo(dirPath) {
  console.log('Browsing to:', dirPath);
  const folderList = document.getElementById('folder-list');
  folderList.innerHTML = '<div class="folder-loading">Loading...</div>';

  try {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`);
    const data = await res.json();
    console.log('Browse response:', data);

    if (!data.success) {
      folderList.innerHTML = `<div class="folder-empty">Error: ${data.error}</div>`;
      return;
    }

    currentBrowsePath = data.current;
    document.getElementById('path-input').value = data.current;

    // Update parent button
    const parentBtn = document.getElementById('parent-btn');
    parentBtn.disabled = !data.parent;

    // Update drive buttons
    document.querySelectorAll('.drive-btn').forEach(btn => {
      btn.classList.toggle('active', data.current.startsWith(btn.textContent));
    });

    if (data.folders.length === 0) {
      folderList.innerHTML = '<div class="folder-empty">No subfolders</div>';
      return;
    }

    folderList.innerHTML = data.folders.map(f =>
      `<div class="folder-item" onclick="browseTo('${f.path}')" ondblclick="selectFolder('${f.path}')">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${escapeHtml(f.name)}</span>
      </div>`
    ).join('');
  } catch (err) {
    console.error('browseTo error:', err);
    folderList.innerHTML = `<div class="folder-empty">Error: ${err.message}</div>`;
  }
}

async function goToParent() {
  const res = await fetch(`/api/browse?path=${encodeURIComponent(currentBrowsePath)}`);
  const data = await res.json();
  if (data.success && data.parent) {
    browseTo(data.parent);
  }
}

function navigateToPath() {
  const path = document.getElementById('path-input').value;
  browseTo(path);
}

function selectFolder(path) {
  document.getElementById('project-folder').value = path;
  closeFolderPicker();
}

function selectCurrentFolder() {
  document.getElementById('project-folder').value = currentBrowsePath;
  closeFolderPicker();
}
