const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { promptMasked, promptText } = require('../../src/utils/terminalPrompt');

class MockTTYInputStream extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.isRaw = false;
    this.paused = true;
  }

  setRawMode(mode) {
    this.isRaw = Boolean(mode);
  }

  resume() {
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }
}

class MockOutputStream extends EventEmitter {
  constructor() {
    super();
    this.written = [];
  }

  write(data) {
    this.written.push(data.toString('utf8'));
    return true;
  }

  getOutput() {
    return this.written.join('');
  }
}

describe('Unit Tests: Terminal Masked Input (Phase 5F-A2.1.1)', () => {
  it('masks typed characters with asterisks and returns unaltered password on Enter', async () => {
    const mockInput = new MockTTYInputStream();
    const mockOutput = new MockOutputStream();

    const promise = promptMasked('Password: ', {
      input: mockInput,
      output: mockOutput,
    });

    // Verify raw mode was enabled
    assert.equal(mockInput.isRaw, true);

    // Simulate typing: 'S', 'e', 'c', 'r', 'e', 't', '1', '!', '\n'
    mockInput.emit('data', Buffer.from('Secret1!\n', 'utf8'));

    const result = await promise;
    assert.equal(result, 'Secret1!');

    // Output must display the prompt and 8 asterisks, followed by newline
    assert.equal(mockOutput.getOutput(), 'Password: ********\n');

    // Terminal raw mode must be restored to false
    assert.equal(mockInput.isRaw, false);
  });

  it('handles backspace correctly by erasing asterisk from output and character from string', async () => {
    const mockInput = new MockTTYInputStream();
    const mockOutput = new MockOutputStream();

    const promise = promptMasked('Password: ', {
      input: mockInput,
      output: mockOutput,
    });

    // Type 'A', 'b', 'c', then Backspace (\b), then 'd', then Enter
    mockInput.emit('data', Buffer.from('Abc', 'utf8'));
    mockInput.emit('data', Buffer.from('\b', 'utf8'));
    mockInput.emit('data', Buffer.from('d\r', 'utf8'));

    const result = await promise;
    assert.equal(result, 'Abd');

    // Output should contain prompt, 3 asterisks, backspace erase sequence (\b \b), asterisk, newline
    assert.equal(mockOutput.getOutput(), 'Password: ***\b \b*\n');
    assert.equal(mockInput.isRaw, false);
  });

  it('handles multibyte Unicode emojis and erases single emoji code point on backspace', async () => {
    const mockInput = new MockTTYInputStream();
    const mockOutput = new MockOutputStream();

    const promise = promptMasked('Password: ', {
      input: mockInput,
      output: mockOutput,
    });

    // Type emoji 🏨 (4 bytes), then 🔑 (4 bytes), then DEL (\x7f), then Enter
    mockInput.emit('data', Buffer.from('🏨🔑', 'utf8'));
    mockInput.emit('data', Buffer.from('\x7f', 'utf8'));
    mockInput.emit('data', Buffer.from('\n', 'utf8'));

    const result = await promise;
    assert.equal(result, '🏨');
    assert.equal(Array.from(result).length, 1);

    // Output should contain prompt, 2 asterisks, 1 backspace erase sequence, newline
    assert.equal(mockOutput.getOutput(), 'Password: **\b \b\n');
    assert.equal(mockInput.isRaw, false);
  });

  it('restores raw mode and rejects with USER_CANCELLED on Ctrl+C', async () => {
    const mockInput = new MockTTYInputStream();
    const mockOutput = new MockOutputStream();

    const promise = promptMasked('Password: ', {
      input: mockInput,
      output: mockOutput,
    });

    assert.equal(mockInput.isRaw, true);

    // Send Ctrl+C (\u0003)
    mockInput.emit('data', Buffer.from('\u0003', 'utf8'));

    await assert.rejects(
      () => promise,
      (err) => {
        assert.equal(err.code, 'USER_CANCELLED');
        return true;
      }
    );

    // Terminal raw mode must be restored
    assert.equal(mockInput.isRaw, false);
    assert.equal(mockOutput.getOutput().includes('\n'), true);
  });

  it('falls back cleanly to line reading when input stream is not a TTY', async () => {
    const { Readable } = require('stream');
    const mockInput = new Readable({
      read() {},
    });
    mockInput.isTTY = false;
    const mockOutput = new MockOutputStream();

    const promise = promptMasked('Password: ', {
      input: mockInput,
      output: mockOutput,
    });

    // Emit a line on non-TTY stream
    mockInput.push('NonTTYSecretPassword123\n');

    const result = await promise;
    assert.equal(result, 'NonTTYSecretPassword123');
  });
});
