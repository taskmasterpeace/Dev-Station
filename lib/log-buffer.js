class LogBuffer {
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  push(line, stream = 'stdout') {
    const entry = {
      timestamp: Date.now(),
      stream,
      line: line.toString().replace(/\r?\n$/, '')
    };

    this.buffer.push(entry);

    // Drop oldest if over max size
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }

    return entry;
  }

  getAll() {
    return [...this.buffer];
  }

  getLast(n = 100) {
    return this.buffer.slice(-n);
  }

  clear() {
    this.buffer = [];
  }

  get length() {
    return this.buffer.length;
  }

  getLastLine() {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }
}

module.exports = LogBuffer;
