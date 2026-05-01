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