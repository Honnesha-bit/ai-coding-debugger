/**
 * Concurrency limiter and bounded queue for sandbox execution requests.
 * Prevents CPU starvation and resource exhaustion from concurrent user submissions.
 */
export class ConcurrencyLimiter {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 4;
    this.maxQueue = options.maxQueue || 16;
    this.queueTimeoutMs = options.queueTimeoutMs || 10000;
    this.running = 0;
    this.queue = [];
  }

  /**
   * Acquires an execution slot, waiting in queue if max concurrency is reached.
   * @returns {Promise<Function>} A release function to be called when execution finishes.
   */
  async acquire() {
    if (this.running < this.maxConcurrent) {
      this.running++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this._release();
        }
      };
    }

    if (this.queue.length >= this.maxQueue) {
      const err = new Error('Server execution queue is full. Please try again in a few moments.');
      err.code = 'SERVER_BUSY';
      err.statusCode = 503;
      throw err;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        const timeoutErr = new Error('Execution request timed out waiting for an available sandbox slot.');
        timeoutErr.code = 'QUEUE_TIMEOUT';
        timeoutErr.statusCode = 503;
        reject(timeoutErr);
      }, this.queueTimeoutMs);

      this.queue.push({
        resolve: () => {
          clearTimeout(timer);
          let released = false;
          resolve(() => {
            if (!released) {
              released = true;
              this._release();
            }
          });
        },
        reject
      });
    });
  }

  _release() {
    this.running = Math.max(0, this.running - 1);
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const next = this.queue.shift();
      this.running++;
      next.resolve();
    }
  }

  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue
    };
  }
}
