import type {
  ChannelHandlerOptions,
  ChannelReply,
  IChannelHandler,
  IChannelHandlerFactory,
  InboundChannelMessage,
  IMessageGateway,
} from '../../plugins/contracts';
import { resolveResponse } from './utils';

export type {
  ChannelHandlerOptions,
  ChannelReply,
  InboundChannelMessage,
  IChannelHandler,
  IChannelHandlerFactory,
};

class ChannelHandler implements IChannelHandler {
  private channel: string;
  private gateway: IMessageGateway;
  private reply: ChannelReply;
  private mentionId?: string;
  private prefixSenderName: boolean;

  constructor(options: ChannelHandlerOptions) {
    this.channel = options.channel;
    this.gateway = options.gateway;
    this.reply = options.reply;
    this.mentionId = options.mentionId;
    this.prefixSenderName = options.prefixSenderName ?? true;
  }

  async handle(target: string, message: InboundChannelMessage): Promise<boolean> {
    if (message.isGroup && !message.mentionsBot) {
      return false;
    }

    const text = this.stripMention(message.text);
    const prompt = this.prefixSenderName && message.senderName
      ? `${message.senderName} says: ${text}`
      : text;

    try {
      const response = await this.gateway.handle(
        { text: prompt, images: message.images },
        target,
        {
          channel: this.channel,
          toolsEnabled: message.isTrustedSender,
          learnedSkillsEnabled: message.isTrustedSender,
        },
      );
      const resolved = await resolveResponse(response);
      await this.reply.sendText(target, resolved);
      return true;
    } catch (err) {
      const error = err instanceof Error
        ? err.message
        : 'Sorry, I ran into an unexpected problem. Could you try again?';
      await this.reply.sendError(target, `❌ ${error}`);
      return true;
    }
  }

  private stripMention(text: string): string {
    if (!this.mentionId) return text;
    return text.replace(`@${this.mentionId}`, '').trim();
  }
}

class ChannelHandlerFactory {
  static create(options: ChannelHandlerOptions): ChannelHandler {
    return new ChannelHandler(options);
  }
}

export { ChannelHandler, ChannelHandlerFactory };