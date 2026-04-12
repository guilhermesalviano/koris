import os from 'node:os';

export function loadSystemInfoPrompt(params: { channel: 'telegram' | 'tui' }): string {
  return [
    'Session context:',
    `- source: ${params.channel}`,
    `- os: ${os.platform()} ${os.release()}`,
    `- node: ${process.version}`,
    `- cwd: ${process.cwd()}`,
  ].join('\n');
}
