import os from 'node:os';

export function loadSystemInfoPrompt(channel: 'telegram' | 'tui'): string {
  return [
    'Session context:',
    `- source: ${channel}`,
    `- os: ${os.platform()} ${os.release()}`,
    `- node: ${process.version}`,
    `- cwd: ${process.cwd()}`,
  ].join('\n');
}
