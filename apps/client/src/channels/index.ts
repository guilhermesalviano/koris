import { initBot } from "assistant-telegram-bot";
import { config } from "../config";
import { IAgent } from "../services/agents/main-agent/agent";
import { TelegramChannelFactory } from "./telegram";
import type { ILogger } from "../infrastructure/logger";

export type StopFn = () => void;

interface ChannelDefinition {
  name: string;
  enabled: () => boolean;
  start: (logger: ILogger, agent: IAgent) => StopFn | void;
}

interface IChannelsManager {
  startAll(): void;
  stopAll(): void;
}

class ChannelsManager implements IChannelsManager {
  private logger: ILogger;
  private agent: IAgent;
  private stopFns: StopFn[] = [];
  private channels: ChannelDefinition[];

  constructor(
    logger: ILogger,
    agent: IAgent,
    channels: ChannelDefinition[] = [],
  ) {
    this.logger = logger;
    this.agent = agent;
    this.channels = channels;
  }

  startAll() {
    for (const channel of this.channels) {
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
      const telegramChannel = TelegramChannelFactory.create();
      const channels = [
        {
          name: 'telegram',
          enabled: () => !!config.TELEGRAM.BOT_TOKEN,
          start: (logger: ILogger, agent: IAgent) => {
            const bot = initBot({
              token: config.TELEGRAM.BOT_TOKEN,
              polling: true,
              onMessage: (msg) => telegramChannel.handleMessage(agent, msg),
            });
            logger.info("Telegram is ready!");
            return () => bot.stopPolling();
          },
        },
      ];

      ChannelsSingleton.instance = new ChannelsManager(logger, agent, channels);
    }
    return ChannelsSingleton.instance;
  }
}

export { IChannelsManager, ChannelsSingleton };