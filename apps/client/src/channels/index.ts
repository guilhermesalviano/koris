import { initBot } from "assistant-telegram-bot";
import { config } from "../config";
import { IAgent } from "../services/agents/main-agent/agent";
import { handleMessage } from "./telegram";
import { ILogger } from "../infrastructure/logger";

export type StopFn = () => void;

interface ChannelDefinition {
  name: string;
  enabled: () => boolean;
  start: (logger: ILogger, agent: IAgent) => StopFn | void;
}

export const channels: ChannelDefinition[] = [
  {
    name: 'telegram',
    enabled: () => !!config.TELEGRAM.BOT_TOKEN,
    start: (logger: ILogger, agent: IAgent) => {
      const bot = initBot({
        token: config.TELEGRAM.BOT_TOKEN,
        polling: true,
        onMessage: (msg) => handleMessage(agent, msg),
      });
      logger.info("Telegram is ready!");
      return () => bot.stopPolling();
    },
  },
];

interface IChannelsManager {
  startAll(): void;
  stopAll(): void;
}

class ChannelsManager implements IChannelsManager {
  private stopFns: StopFn[] = [];

  constructor(private logger: ILogger, private agent: IAgent) {}

  startAll() {
    for (const channel of channels) {
      if (!channel.enabled()) continue;
      this.logger.info(`Starting channel: ${channel.name}`);
      const stop = channel.start(this.logger, this.agent);
      if (typeof stop === 'function') this.stopFns.push(stop);
    }
  }

  stopAll() {
    this.logger.info("\n👋 Shutting down gracefully...");
    this.stopFns.forEach((stop) => stop());
  }
}

class ChannelsSingleton {
  private static instance: ChannelsManager;

  static getInstance(logger: ILogger, agent: IAgent): ChannelsManager {
    if (!ChannelsSingleton.instance) {
      ChannelsSingleton.instance = new ChannelsManager(logger, agent);
    }
    return ChannelsSingleton.instance;
  }
}

export { IChannelsManager, ChannelsSingleton };