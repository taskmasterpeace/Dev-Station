class HealthMonitor {
  constructor() {
    // Track log rates per project
    this.logCounts = new Map(); // projectId -> { count, windowStart }

    // Track restart counts per project
    this.restarts = new Map(); // projectId -> [timestamps]

    // Active warnings per project
    this.warnings = new Map(); // projectId -> Set of warning types

    // Thresholds
    this.LOG_SPAM_THRESHOLD = 100; // lines per second
    this.LOG_SPAM_DURATION = 5000; // 5 seconds
    this.CRASH_LOOP_COUNT = 3;
    this.CRASH_LOOP_WINDOW = 60000; // 60 seconds
    this.ZOMBIE_TIMEOUT = 300000; // 5 minutes

    // Last output time per project
    this.lastOutput = new Map();
  }

  recordLogLine(projectId) {
    const now = Date.now();
    this.lastOutput.set(projectId, now);

    if (!this.logCounts.has(projectId)) {
      this.logCounts.set(projectId, { count: 0, windowStart: now, spamStart: null });
    }

    const data = this.logCounts.get(projectId);

    // Reset window if more than 1 second old
    if (now - data.windowStart > 1000) {
      data.count = 0;
      data.windowStart = now;
    }

    data.count++;

    // Check for log spam
    if (data.count > this.LOG_SPAM_THRESHOLD) {
      if (!data.spamStart) {
        data.spamStart = now;
      } else if (now - data.spamStart > this.LOG_SPAM_DURATION) {
        this.addWarning(projectId, 'high_log_output');
      }
    } else {
      data.spamStart = null;
      this.removeWarning(projectId, 'high_log_output');
    }
  }

  recordRestart(projectId) {
    const now = Date.now();

    if (!this.restarts.has(projectId)) {
      this.restarts.set(projectId, []);
    }

    const timestamps = this.restarts.get(projectId);
    timestamps.push(now);

    // Keep only timestamps within the window
    const cutoff = now - this.CRASH_LOOP_WINDOW;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    // Check for crash loop
    if (timestamps.length >= this.CRASH_LOOP_COUNT) {
      this.addWarning(projectId, 'crash_loop');
    }
  }

  recordStart(projectId) {
    this.lastOutput.set(projectId, Date.now());
    this.removeWarning(projectId, 'unresponsive');
  }

  recordStop(projectId) {
    this.logCounts.delete(projectId);
    this.lastOutput.delete(projectId);
    this.clearWarnings(projectId);
  }

  checkZombie(projectId, isRunning) {
    if (!isRunning) return;

    const lastOut = this.lastOutput.get(projectId);
    if (lastOut && Date.now() - lastOut > this.ZOMBIE_TIMEOUT) {
      this.addWarning(projectId, 'unresponsive');
    }
  }

  addWarning(projectId, warning) {
    if (!this.warnings.has(projectId)) {
      this.warnings.set(projectId, new Set());
    }
    const wasAdded = !this.warnings.get(projectId).has(warning);
    this.warnings.get(projectId).add(warning);
    return wasAdded; // Return true if this is a new warning
  }

  removeWarning(projectId, warning) {
    if (this.warnings.has(projectId)) {
      const wasRemoved = this.warnings.get(projectId).has(warning);
      this.warnings.get(projectId).delete(warning);
      return wasRemoved;
    }
    return false;
  }

  clearWarnings(projectId) {
    this.warnings.delete(projectId);
  }

  getWarnings(projectId) {
    return this.warnings.has(projectId)
      ? Array.from(this.warnings.get(projectId))
      : [];
  }

  clearRestartHistory(projectId) {
    this.restarts.delete(projectId);
    this.removeWarning(projectId, 'crash_loop');
  }
}

module.exports = HealthMonitor;
