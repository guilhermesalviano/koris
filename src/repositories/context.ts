import os from 'node:os';
import { config } from '../config';
import { nowISO } from '../utils/date';

export interface PersonalInformation {
  name?: string;
  gender?: string;
  birthday?: string;
  location?: string;
  occupation?: string;
}

export interface SystemInfo {
  source: string;
  platform: string;
  datetime: string;
}

interface IContextRepository {
  get(params: { channel: string }): string;
}

class ContextRepository implements IContextRepository {

  /**
   * Load and format system info in one call (convenience method)
   */
  get(params: { channel: string }): string {
    const systemInfo = this.getSystemInfo(params);
    const personalInfo = this.getPersonalInfo(config.PERSONAL_INFORMATION);
    return this.formatAsPrompt(systemInfo, personalInfo);
  }

  /**
   * Collect current system information
   */
  private getSystemInfo(params: { channel: string }): SystemInfo {
    return {
      source: params.channel,
      platform: os.platform(),
      datetime: nowISO(),
    };
  }

  private getPersonalInfo(params: any): PersonalInformation {
    return {
      name: params.NAME,
      gender: params.GENDER,
      birthday: params.BIRTHDAY,
      location: params.LOCATION,
      occupation: params.OCCUPATION,
    };
  }

  /**
   * Format system info as prompt text
   * inactivated temporarily
   */
  private formatAsPrompt(system: SystemInfo, personal: PersonalInformation): string {
    return [
      "# Before responding, consider the following context information:",
      system.datetime ? `1. Datetime: ${system.datetime}` : null,
      system.source ? `2. Channel Source: ${system.source}` : null,
      system.platform ? `3. Platform: ${system.platform}` : null,
      `4. Main Human Information:`,
      `- Name: ${personal.name}${personal.gender ? `, gender: ${personal.gender}` : null}${personal.birthday ? `, birthday: ${personal.birthday}` : null}`,
      // To do: variable information... Refactor in future.
      personal.location ? `- location: ${personal.location}` : null,
      personal.occupation ? `- occupation: ${personal.occupation}` : null,
    ].join('\n');
  }
}

class ContextRepositoryFactory {
  static create(): IContextRepository {
    return new ContextRepository();
  }
}

export { IContextRepository, ContextRepository, ContextRepositoryFactory };