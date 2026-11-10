/**
 * Bounded Concurrency Semaphore for CPU/Memory-Intensive Argon2id Hashing Operations.
 *
 * NOTE: This is a process-local concurrency control mechanism for the Node.js process.
 * In a multi-replica clustered environment, horizontal bounds would be managed via
 * external coordination or instance provisioning.
 *
 * Defaults:
 * - maxActive: 2 concurrent operations (protects libuv worker threads and event loop)
 * - maxQueue: 5 queued requests waiting for an execution slot
 * - timeoutMs: 3000 ms maximum queue wait time before failing fast
 */
class ArgonSemaphore {
  constructor(maxActive = 2, maxQueue = 5, timeoutMs = 3000) {
    this.maxActive = maxActive;
    this.maxQueue = maxQueue;
    this.timeoutMs = timeoutMs;
    this.active = 0;
    this.queue = [];
  }

  get activeCount() {
    return this.active;
  }

  get queueLength() {
    return this.queue.length;
  }

  /**
   * Executes an asynchronous task within the bounded concurrency limits.
   *
   * @param {() => Promise<any>} task - Function returning a promise
   * @returns {Promise<any>}
   * @throws {Error} If queue is full or queue timeout expires
   */
  async run(task) {
    if (this.active < this.maxActive) {
      this.active++;
      try {
        return await task();
      } finally {
        this.active--;
        this._dequeue();
      }
    }

    if (this.queue.length >= this.maxQueue) {
      const err = new Error('Authentication service busy. Please try again shortly.');
      err.code = 'HASHING_OVERLOAD';
      err.statusCode = 503;
      err.retryAfter = 3;
      throw err;
    }

    return new Promise((resolve, reject) => {
      let timer = null;

      const queueItem = {
        execute: async () => {
          if (timer) clearTimeout(timer);
          this.active++;
          try {
            const result = await task();
            resolve(result);
          } catch (taskErr) {
            reject(taskErr);
          } finally {
            this.active--;
            this._dequeue();
          }
        },
        timeout: () => {
          const idx = this.queue.indexOf(queueItem);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            const timeoutErr = new Error('Authentication request timed out in queue.');
            timeoutErr.code = 'HASHING_OVERLOAD';
            timeoutErr.statusCode = 503;
            timeoutErr.retryAfter = 3;
            reject(timeoutErr);
          }
        },
      };

      timer = setTimeout(() => {
        queueItem.timeout();
      }, this.timeoutMs);

      this.queue.push(queueItem);
    });
  }

  _dequeue() {
    if (this.active < this.maxActive && this.queue.length > 0) {
      const nextItem = this.queue.shift();
      if (nextItem && typeof nextItem.execute === 'function') {
        nextItem.execute();
      }
    }
  }

  /**
   * Resets the semaphore state (used in testing environments).
   */
  reset() {
    this.active = 0;
    this.queue = [];
  }
}

// Export singleton instance with standard bounds
const defaultArgonSemaphore = new ArgonSemaphore(2, 5, 3000);

module.exports = {
  ArgonSemaphore,
  defaultArgonSemaphore,
};
