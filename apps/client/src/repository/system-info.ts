import os from 'node:os';

interface ISystemInfoRepository {
  getSystemInfo(params: { channel: string }): SystemInfo;
  formatAsPrompt(info: SystemInfo): string;
  loadSystemInfoPrompt(params: { channel: string }): string;
}

export interface SystemInfo {
  source: string;
  platform: string;
  release: string;
  nodeVersion: string;
  workingDirectory: string;
}

/**
 * Repository for system and runtime information.
 * Separates data collection from presentation logic.
 */
class SystemInfoRepository implements ISystemInfoRepository {
  /**
   * Collect current system information
   */
  getSystemInfo(params: { channel: string }): SystemInfo {
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
  loadSystemInfoPrompt(params: { channel: string }): string {
    const info = this.getSystemInfo(params);
    return this.formatAsPrompt(info);
  }
}

class SystemInfoRepositoryFactory {
  static create(): ISystemInfoRepository {
    return new SystemInfoRepository();
  }
}

export { ISystemInfoRepository, SystemInfoRepositoryFactory };