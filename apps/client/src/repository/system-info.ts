import os from 'node:os';

/**
 * System information data structure
 */
export interface SystemInfo {
  source: 'telegram' | 'tui';
  platform: string;
  release: string;
  nodeVersion: string;
  workingDirectory: string;
}

/**
 * Repository for system and runtime information.
 * Separates data collection from presentation logic.
 */
export class SystemInfoRepository {
  /**
   * Collect current system information
   */
  getSystemInfo(params: { channel: 'telegram' | 'tui' }): SystemInfo {
    return {
      source: params.channel,
      platform: os.platform(),
      release: os.release(),
      nodeVersion: process.version,
      workingDirectory: process.cwd(),
    };
  }

  /**
   * Format system info as prompt text
   */
  formatAsPrompt(info: SystemInfo): string {
    return [
      'Session context, use it to compose your response, if needed:',
      `- source: ${info.source}`,
      `- os: ${info.platform} ${info.release}`,
      `- node: ${info.nodeVersion}`,
      `- cwd: ${info.workingDirectory}`,
    ].join('\n');
  }

  /**
   * Load and format system info in one call (convenience method)
   */
  loadSystemInfoPrompt(params: { channel: 'telegram' | 'tui' }): string {
    const info = this.getSystemInfo(params);
    return this.formatAsPrompt(info);
  }
}

// Singleton instance
const repository = new SystemInfoRepository();

/**
 * Backward-compatible function export
 */
export function loadSystemInfoPrompt(params: { channel: 'telegram' | 'tui' }): string {
  return repository.loadSystemInfoPrompt(params);
}

// Export singleton for direct use
export const systemInfoRepository = repository;