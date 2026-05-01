import os from 'node:os';

interface ISystemInfoRepository {
  loadSystemInfoPrompt(params: { channel: string }): string;
}

export interface SystemInfo {
  source: string;
  platform: string;
  workingDirectory: string;
  datetime: string;
}

/**
 * Repository for system and runtime information.
 * Separates data collection from presentation logic.
 */
class SystemInfoRepository implements ISystemInfoRepository {
  /**
   * Load and format system info in one call (convenience method)
   */
  loadSystemInfoPrompt(params: { channel: string }): string {
    const info = this.getSystemInfo(params);
    return this.formatAsPrompt(info);
  }

  /**
   * Collect current system information
   */
  private getSystemInfo(params: { channel: string }): SystemInfo {
    return {
      source: params.channel,
      platform: os.platform(),
      workingDirectory: process.cwd(),
      datetime: new Date().toISOString(),
    };
  }

  /**
   * Format system info as prompt text
   * inactivated temporarily
   */
  private formatAsPrompt(info: SystemInfo): string {
    return [
      'Session context, use it to compose your response, if needed:',
      `- source: ${info.source}`,
      `- datetime: ${info.datetime}`,
      `- cwd: ${info.workingDirectory}`,
    ].join('\n');
  }
}

class SystemInfoRepositoryFactory {
  static create(): ISystemInfoRepository {
    return new SystemInfoRepository();
  }
}

export { ISystemInfoRepository, SystemInfoRepository, SystemInfoRepositoryFactory };