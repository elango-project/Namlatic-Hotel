/**
 * Native TTY Terminal Prompt Utilities
 *
 * Implements genuine masked input without external heavy prompt dependencies:
 * - Disables terminal echo via raw mode on TTY streams.
 * - Displays '*' for each character entered.
 * - Handles multibyte Unicode and emoji characters accurately.
 * - Handles backspace (\b and \x7f) with terminal cursor erasure (\b \b).
 * - Restores terminal echo and raw-mode settings on all exit paths (normal, Ctrl+C, error).
 * - Leaves passwords out of stdout/stderr logs.
 */

const readline = require('readline');

/**
 * Prompts user for masked password input in a TTY terminal.
 *
 * @param {string} promptText - The prompt message to display
 * @param {object} [options]
 * @param {NodeJS.ReadableStream & { isTTY?: boolean, setRawMode?: (mode: boolean) => void, isRaw?: boolean }} [options.input=process.stdin]
 * @param {NodeJS.WritableStream} [options.output=process.stdout]
 * @returns {Promise<string>} The raw, unmodified password entered by the user
 */
function promptMasked(promptText, options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;

  return new Promise((resolve, reject) => {
    // If running in non-TTY environment (e.g. CI pipeline or piped stdin), fallback to line reading
    if (!input.isTTY) {
      const rl = readline.createInterface({ input, output });
      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    output.write(promptText);

    let password = '';
    const wasRaw = input.isRaw;

    const cleanup = () => {
      try {
        if (typeof input.setRawMode === 'function') {
          input.setRawMode(wasRaw || false);
        }
        input.pause();
        input.removeListener('data', onData);
        process.removeListener('SIGINT', onSigint);
      } catch (_e) {}
    };

    const onSigint = () => {
      cleanup();
      output.write('\n');
      const err = new Error('User cancelled prompt (Ctrl+C).');
      err.code = 'USER_CANCELLED';
      reject(err);
    };

    const onData = (chunk) => {
      const str = chunk.toString('utf8');

      for (const char of str) {
        // Ctrl+C (ETX = \u0003)
        if (char === '\u0003') {
          onSigint();
          return;
        }

        // Enter (\r or \n)
        if (char === '\r' || char === '\n') {
          cleanup();
          output.write('\n');
          resolve(password);
          return;
        }

        // Backspace (\b = \x08 or DEL = \x7f)
        if (char === '\b' || char === '\x7f') {
          if (password.length > 0) {
            // Pop the last Unicode code point accurately
            const codePoints = Array.from(password);
            codePoints.pop();
            password = codePoints.join('');
            output.write('\b \b');
          }
          continue;
        }

        // Ignore control codes other than tab
        if (char.charCodeAt(0) < 32 && char !== '\t') {
          continue;
        }

        // Append character and echo asterisk
        password += char;
        output.write('*');
      }
    };

    try {
      process.once('SIGINT', onSigint);
      if (typeof input.setRawMode === 'function') {
        input.setRawMode(true);
      }
      input.resume();
      input.on('data', onData);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

/**
 * Prompts user for plain text in a terminal.
 *
 * @param {string} promptText
 * @param {object} [options]
 * @returns {Promise<string>}
 */
function promptText(promptText, options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;

  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(promptText, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

module.exports = {
  promptMasked,
  promptText,
};
