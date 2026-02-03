const { spawn } = require('child_process');
const treeKill = require('tree-kill');
const LogBuffer = require('./log-buffer');
const HealthMonitor = require('./health-monitor');
const config = require('./config');

class ProcessManager {
  constructor() {
    this.processes = new Map(); // projectId -> { process, status, pid, startTime }
    this.logBuffers = new Map(); // projectId -> LogBuffer
    this.lastStatus = new Map(); // projectId -> status (persists after process ends)
    this.healthMonitor = new HealthMonitor();
    this.onLog = null; // Callback for log events
    this.onStatusChange = null; // Callback for status changes
    this.onWarning = null; // Callback for warnings
  }

  getLogBuffer(projectId) {
    if (!this.logBuffers.has(projectId)) {
      this.logBuffers.set(projectId, new LogBuffer(500));
    }
    return this.logBuffers.get(projectId);
  }

  async startProject(projectId) {
    const project = config.getProject(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Check if already running
    if (this.processes.has(projectId)) {
      const existing = this.processes.get(projectId);
      if (existing.status === 'running') {
        return { success: false, error: 'Project already running' };
      }
    }

    // Update status to starting
    this.updateStatus(projectId, 'starting', null);

    try {
      const proc = spawn(project.command, [], {
        cwd: project.folder,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1' }
      });

      const logBuffer = this.getLogBuffer(projectId);
      this.healthMonitor.recordStart(projectId);

      // Handle stdout
      proc.stdout.on('data', (data) => {
        const lines = data.toString().split(/\r?\n/).filter(l => l);
        lines.forEach(line => {
          const entry = logBuffer.push(line, 'stdout');
          this.healthMonitor.recordLogLine(projectId);
          if (this.onLog) {
            this.onLog(projectId, entry);
          }
        });
      });

      // Handle stderr
      proc.stderr.on('data', (data) => {
        const lines = data.toString().split(/\r?\n/).filter(l => l);
        lines.forEach(line => {
          const entry = logBuffer.push(line, 'stderr');
          this.healthMonitor.recordLogLine(projectId);
          if (this.onLog) {
            this.onLog(projectId, entry);
          }
        });
      });

      // Handle process exit
      proc.on('exit', (code, signal) => {
        const procInfo = this.processes.get(projectId);
        const wasRunning = procInfo?.status === 'running';
        const uptime = procInfo?.startTime ? Date.now() - procInfo.startTime : 0;

        // Determine if this was a crash (non-zero exit, or exited very quickly)
        const isCrash = code !== 0 || (wasRunning && uptime < 5000);
        const newStatus = isCrash ? 'crashed' : 'stopped';

        this.updateStatus(projectId, newStatus, null, code);
        this.processes.delete(projectId);

        const exitMsg = `Process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
        const entry = logBuffer.push(exitMsg, 'stderr');
        if (this.onLog) {
          this.onLog(projectId, entry);
        }

        // Record for crash loop detection if it was running
        if (wasRunning && code !== 0) {
          this.healthMonitor.recordRestart(projectId);
        }
      });

      proc.on('error', (err) => {
        const entry = logBuffer.push(`Error: ${err.message}`, 'stderr');
        if (this.onLog) {
          this.onLog(projectId, entry);
        }
        this.updateStatus(projectId, 'stopped', null);
        this.processes.delete(projectId);
      });

      // Store process info
      this.processes.set(projectId, {
        process: proc,
        status: 'running',
        pid: proc.pid,
        startTime: Date.now()
      });

      this.updateStatus(projectId, 'running', proc.pid);

      return { success: true, pid: proc.pid };
    } catch (err) {
      this.updateStatus(projectId, 'stopped', null);
      return { success: false, error: err.message };
    }
  }

  async stopProject(projectId) {
    const procInfo = this.processes.get(projectId);
    if (!procInfo || procInfo.status !== 'running') {
      return { success: false, error: 'Project not running' };
    }

    this.updateStatus(projectId, 'stopping', procInfo.pid);

    return new Promise((resolve) => {
      const pid = procInfo.pid;

      // Try graceful kill first
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) {
          // Force kill after timeout
          setTimeout(() => {
            treeKill(pid, 'SIGKILL', () => {
              this.healthMonitor.recordStop(projectId);
              this.processes.delete(projectId);
              this.updateStatus(projectId, 'stopped', null);
              resolve({ success: true });
            });
          }, 5000);
        } else {
          this.healthMonitor.recordStop(projectId);
          this.processes.delete(projectId);
          this.updateStatus(projectId, 'stopped', null);
          resolve({ success: true });
        }
      });
    });
  }

  async restartProject(projectId) {
    await this.stopProject(projectId);
    // Small delay before restart
    await new Promise(r => setTimeout(r, 500));
    return this.startProject(projectId);
  }

  getStatus(projectId) {
    const project = config.getProject(projectId);
    if (!project) {
      return null;
    }

    const procInfo = this.processes.get(projectId);
    const logBuffer = this.getLogBuffer(projectId);
    const lastLog = logBuffer.getLastLine();

    return {
      id: projectId,
      name: project.name,
      folder: project.folder,
      command: project.command,
      port: project.port,
      status: procInfo?.status || this.lastStatus.get(projectId) || 'stopped',
      pid: procInfo?.pid || null,
      uptime: procInfo?.startTime ? Date.now() - procInfo.startTime : 0,
      warnings: this.healthMonitor.getWarnings(projectId),
      lastOutput: lastLog?.line || null
    };
  }

  getAllStatus() {
    const projects = config.loadProjects();
    return projects.map(p => this.getStatus(p.id));
  }

  getLogs(projectId, lines = 100) {
    const logBuffer = this.getLogBuffer(projectId);
    return logBuffer.getLast(lines);
  }

  clearLogs(projectId) {
    const logBuffer = this.getLogBuffer(projectId);
    logBuffer.clear();
  }

  updateStatus(projectId, status, pid, exitCode = null) {
    // Persist the last status (important for crashed state)
    this.lastStatus.set(projectId, status);

    if (this.onStatusChange) {
      this.onStatusChange(projectId, status, pid, exitCode);
    }
  }

  // Graceful shutdown - stop all processes
  async shutdown() {
    const promises = [];
    for (const [projectId, procInfo] of this.processes) {
      if (procInfo.status === 'running') {
        promises.push(this.stopProject(projectId));
      }
    }
    await Promise.all(promises);
  }
}

module.exports = ProcessManager;
