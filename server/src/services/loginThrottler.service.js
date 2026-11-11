/**
 * Login Abuse Throttler & Bounded LRU Cache Service
 *
 * Implements two-tier abuse protection without global account lockout:
 * 1. Per-IP Rate Limiting: 5 failed attempts per 15-minute window per IP (HTTP 429).
 * 2. Progressive Delays per (Email, IP): 0ms (1-2), 1,000ms (3), 2,000ms (4-5+).
 *
 * Memory safety:
 * - Bounded LRU store with a maximum capacity of 10,000 entries.
 * - 15-minute time-to-live (TTL).
 * - Immediate eviction of oldest entries when capacity is reached.
 */

const MAX_ENTRIES = 10000;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_IP_FAILURES = 5;

class LoginThrottlerService {
  constructor(maxEntries = MAX_ENTRIES, windowMs = WINDOW_MS) {
    this.maxEntries = maxEntries;
    this.windowMs = windowMs;
    // LRU Map for IP-level failure tracking
    this.ipMap = new Map();
    // LRU Map for (Email, IP) progressive delays
    this.pairMap = new Map();
  }

  get ipCount() {
    return this.ipMap.size;
  }

  get pairCount() {
    return this.pairMap.size;
  }

  get totalEntries() {
    return this.ipMap.size + this.pairMap.size;
  }

  /**
   * Internal helper to retrieve an active entry from an LRU Map,
   * refreshing its LRU order and pruning expired entries.
   */
  _get(map, key) {
    if (!map.has(key)) return null;

    const entry = map.get(key);
    const now = Date.now();

    if (now - entry.createdAt > this.windowMs) {
      map.delete(key);
      return null;
    }

    // Refresh LRU order: delete and re-insert
    map.delete(key);
    map.set(key, entry);
    return entry;
  }

  /**
   * Internal helper to set an entry into an LRU Map with bounded capacity eviction.
   */
  _set(map, key, value) {
    if (map.has(key)) {
      map.delete(key);
    } else if (map.size >= this.maxEntries) {
      // Evict oldest entry (first item in Map iterator)
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) {
        map.delete(oldestKey);
      }
    }
    map.set(key, value);
  }

  /**
   * Checks whether a login attempt is permitted for the given IP and email.
   *
   * @param {string} ip - Client IP
   * @param {string} email - Target account email
   * @returns {{ allowed: boolean, delayMs: number, retryAfter?: number }}
   */
  check(ip, email) {
    const safeIp = ip || 'unknown';
    const safeEmail = (email || '').toLowerCase().trim();
    const now = Date.now();

    // 1. Check IP-level rate limit
    const ipRecord = this._get(this.ipMap, safeIp);
    if (ipRecord && ipRecord.count >= MAX_IP_FAILURES) {
      const remainingMs = Math.max(0, this.windowMs - (now - ipRecord.createdAt));
      const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
      return {
        allowed: false,
        delayMs: 0,
        retryAfter,
      };
    }

    // 2. Determine progressive delay for (Email, IP) tuple
    let delayMs = 0;
    const pairKey = `${safeEmail}::${safeIp}`;
    const pairRecord = this._get(this.pairMap, pairKey);

    if (pairRecord) {
      if (pairRecord.count === 2) {
        delayMs = 1000; // Failure 3 incurs 1,000 ms delay
      } else if (pairRecord.count >= 3) {
        delayMs = 2000; // Failure 4+ incurs 2,000 ms delay
      }
    }

    return {
      allowed: true,
      delayMs,
    };
  }

  /**
   * Records a failed login attempt for the given IP and (Email, IP) pair.
   *
   * @param {string} ip
   * @param {string} email
   * @returns {number} Progressive delay in milliseconds applied to subsequent requests
   */
  recordFailure(ip, email) {
    const safeIp = ip || 'unknown';
    const safeEmail = (email || '').toLowerCase().trim();
    const now = Date.now();

    // 1. Update IP tracking
    const ipRecord = this._get(this.ipMap, safeIp);
    if (ipRecord) {
      ipRecord.count += 1;
      this._set(this.ipMap, safeIp, ipRecord);
    } else {
      this._set(this.ipMap, safeIp, { count: 1, createdAt: now });
    }

    // 2. Update (Email, IP) tracking
    const pairKey = `${safeEmail}::${safeIp}`;
    const pairRecord = this._get(this.pairMap, pairKey);
    let newCount = 1;

    if (pairRecord) {
      pairRecord.count += 1;
      newCount = pairRecord.count;
      this._set(this.pairMap, pairKey, pairRecord);
    } else {
      this._set(this.pairMap, pairKey, { count: 1, createdAt: now });
    }

    // Calculate delay for next attempt
    if (newCount === 2) return 1000;
    if (newCount >= 3) return 2000;
    return 0;
  }

  /**
   * Resets failure records upon successful login for the given IP and (Email, IP) pair.
   *
   * @param {string} ip
   * @param {string} email
   */
  recordSuccess(ip, email) {
    const safeIp = ip || 'unknown';
    const safeEmail = (email || '').toLowerCase().trim();
    const pairKey = `${safeEmail}::${safeIp}`;

    this.ipMap.delete(safeIp);
    this.pairMap.delete(pairKey);
  }

  /**
   * Resets all internal stores (primarily used for test teardown).
   */
  reset() {
    this.ipMap.clear();
    this.pairMap.clear();
  }
}

const defaultLoginThrottler = new LoginThrottlerService();

module.exports = {
  LoginThrottlerService,
  defaultLoginThrottler,
  MAX_ENTRIES,
  WINDOW_MS,
  MAX_IP_FAILURES,
};
