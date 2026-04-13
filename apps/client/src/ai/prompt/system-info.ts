import os from 'node:os';

function loadSystemInfoPrompt(params: { channel: 'telegram' | 'tui' }): string {
  return [
    'Session context, use it to compose your response, if needed:',
    `- source: ${params.channel}`,
    `- os: ${os.platform()} ${os.release()}`,
    `- node: ${process.version}`,
    `- cwd: ${process.cwd()}`,
  ].join('\n');
}

export { loadSystemInfoPrompt };