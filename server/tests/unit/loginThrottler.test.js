const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  LoginThrottlerService,
  defaultLoginThrottler,
  MAX_ENTRIES,
  MAX_IP_FAILURES,
} = require('../../src/services/loginThrottler.service');

describe('Unit Tests: Login Abuse Throttler & LRU Store (Phase 5F-A2.2)', () => {
  let throttler;

  beforeEach(() => {
    throttler = new LoginThrottlerService(10000, 15 * 60 * 1000);
    defaultLoginThrottler.reset();
  });

  describe('IP Rate Limiting & No Global Account Lockout', () => {
    it('allows initial login attempts from an unrecorded IP', () => {
      const status = throttler.check('192.0.2.1', 'owner@namlatic.com');
      assert.equal(status.allowed, true);
      assert.equal(status.delayMs, 0);
    });

    it('blocks IP after 5 failed login attempts with HTTP 429 retryAfter', () => {
      const ip = '198.51.100.1';
      const email = 'owner@namlatic.com';

      for (let i = 1; i <= 5; i++) {
        throttler.recordFailure(ip, email);
      }

      const status = throttler.check(ip, email);
      assert.equal(status.allowed, false);
      assert.equal(status.delayMs, 0);
      assert.equal(typeof status.retryAfter, 'number');
      assert.equal(status.retryAfter > 0, true);
    });

    it('does NOT lock out legitimate owner connecting from an independent IP (no global lockout)', () => {
      const attackerIp = '203.0.113.55';
      const ownerIp = '198.51.100.99';
      const email = 'owner@namlatic.com';

      // Attacker exhausts attempts from their IP
      for (let i = 1; i <= 5; i++) {
        throttler.recordFailure(attackerIp, email);
      }

      // Attacker is blocked
      const attackerStatus = throttler.check(attackerIp, email);
      assert.equal(attackerStatus.allowed, false);

      // Owner connecting from different IP is still permitted
      const ownerStatus = throttler.check(ownerIp, email);
      assert.equal(ownerStatus.allowed, true);
      assert.equal(ownerStatus.delayMs, 0);
    });
  });

  describe('Progressive Delays per (Email, IP)', () => {
    it('applies progressive delays: 0ms for 1-2, 1000ms for 3, 2000ms for 4+', () => {
      const ip = '192.0.2.10';
      const email = 'owner@namlatic.com';

      // Attempt 1
      assert.equal(throttler.check(ip, email).delayMs, 0);
      throttler.recordFailure(ip, email);

      // Attempt 2
      assert.equal(throttler.check(ip, email).delayMs, 0);
      throttler.recordFailure(ip, email);

      // Attempt 3
      assert.equal(throttler.check(ip, email).delayMs, 1000);
      throttler.recordFailure(ip, email);

      // Attempt 4
      assert.equal(throttler.check(ip, email).delayMs, 2000);
      throttler.recordFailure(ip, email);

      // Attempt 5
      assert.equal(throttler.check(ip, email).delayMs, 2000);
    });

    it('clears failure records on successful login', () => {
      const ip = '192.0.2.20';
      const email = 'owner@namlatic.com';

      throttler.recordFailure(ip, email);
      throttler.recordFailure(ip, email);
      assert.equal(throttler.ipCount, 1);
      assert.equal(throttler.pairCount, 1);

      throttler.recordSuccess(ip, email);
      assert.equal(throttler.ipCount, 0);
      assert.equal(throttler.pairCount, 0);

      const status = throttler.check(ip, email);
      assert.equal(status.allowed, true);
      assert.equal(status.delayMs, 0);
    });
  });

  describe('Bounded LRU Capacity & Memory Benchmark', () => {
    it('strictly bounds store capacity to maxEntries and evicts oldest items', () => {
      const smallThrottler = new LoginThrottlerService(5, 60000);

      // Insert 5 entries
      for (let i = 1; i <= 5; i++) {
        smallThrottler.recordFailure(`10.0.0.${i}`, `user${i}@namlatic.com`);
      }
      assert.equal(smallThrottler.ipCount, 5);
      assert.equal(smallThrottler.pairCount, 5);

      // Insert 6th entry: oldest (10.0.0.1) must be evicted
      smallThrottler.recordFailure('10.0.0.6', 'user6@namlatic.com');
      assert.equal(smallThrottler.ipCount, 5);
      assert.equal(smallThrottler.pairCount, 5);

      // Oldest entry (10.0.0.1) should have been evicted and now starts fresh with 0 delay
      const statusOldest = smallThrottler.check('10.0.0.1', 'user1@namlatic.com');
      assert.equal(statusOldest.delayMs, 0);
      assert.equal(statusOldest.allowed, true);
    });

    it('benchmarks heap memory with 10,000 entries and verifies stable memory ceiling', () => {
      const benchmarkThrottler = new LoginThrottlerService(10000, 15 * 60 * 1000);

      // Force garbage collection if exposed, or record baseline heap
      if (global.gc) global.gc();
      const initialHeap = process.memoryUsage().heapUsed;

      // Populate with 10,000 distinct IP addresses and user accounts
      for (let i = 0; i < 10000; i++) {
        const ip = `172.16.${Math.floor(i / 250)}.${i % 250}`;
        const email = `attacker_${i}@botnet.example.com`;
        benchmarkThrottler.recordFailure(ip, email);
      }

      assert.equal(benchmarkThrottler.ipCount, 10000);
      assert.equal(benchmarkThrottler.pairCount, 10000);

      const peakHeap = process.memoryUsage().heapUsed;
      const heapGrowthBytes = peakHeap - initialHeap;
      const heapGrowthMb = heapGrowthBytes / (1024 * 1024);

      // Assert that 10,000 entries in process memory remain well below 25 MB
      assert.equal(heapGrowthMb < 25, true, `Heap growth was ${heapGrowthMb.toFixed(2)} MB, expected < 25 MB`);

      // Add 1,000 additional entries to trigger 1,000 evictions
      for (let i = 10000; i < 11000; i++) {
        const ip = `172.16.${Math.floor(i / 250)}.${i % 250}`;
        const email = `attacker_${i}@botnet.example.com`;
        benchmarkThrottler.recordFailure(ip, email);
      }

      // Verify that total entries did not exceed bounded capacity
      assert.equal(benchmarkThrottler.ipCount, 10000);
      assert.equal(benchmarkThrottler.pairCount, 10000);
    });
  });
});
