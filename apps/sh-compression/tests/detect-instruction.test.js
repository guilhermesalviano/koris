const test = require('node:test');
const assert = require('node:assert/strict');

const { detectInstruction } = require('../dist/src/commands/detect-instruction.js');

test('detects search with find keyword', () => {
  const result = detectInstruction('find weather in logs');
  assert.deepEqual(result, { type: 'search', params: 'weather in logs' });
});

test('detects search with optional for clause', () => {
  const result = detectInstruction('search for "error 500"');
  assert.deepEqual(result, { type: 'search', params: 'error 500' });
});

test('returns null for empty find payload with many spaces', () => {
  const result = detectInstruction(`find ${' '.repeat(5000)}`);
  assert.equal(result, null);
});

test('keeps non-search instruction behavior', () => {
  const result = detectInstruction('run echo hello');
  assert.deepEqual(result, { type: 'execute_command', params: 'echo hello' });
});

test('ignores slash commands', () => {
  const result = detectInstruction('/help');
  assert.equal(result, null);
});
