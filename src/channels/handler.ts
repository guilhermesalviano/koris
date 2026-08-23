import type {
  ChannelHandlerOptions,
  ChannelReply,
  IChannelHandler,
  IChannelHandlerFactory,
  InboundChannelMessage,
  IMessageGateway,
} from '../../plugins/contracts';
import { resolveResponse } from './utils';
import { config } from '../config';

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
    const prompt = this.buildPrompt(message, text);

    try {
      const response = await this.gateway.handle(
        { text: prompt, images: message.images, stickers: message.stickers },
        target,
        {
          channel: this.channel,
          toolsEnabled: message.isTrustedSender,
          learnedSkillsEnabled: message.isTrustedSender,
          stickersEnabled: this.computeStickersEnabled(message),
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

  // Unlike toolsEnabled/learnedSkillsEnabled, this reads global config directly:
  // ALLOW_UNTRUSTED is a deliberate operator-controlled override that lets stickers
  // work for untrusted senders even while other tools stay locked (see
  // PromptRepository.buildTools' privileged-bypass branch).
  private computeStickersEnabled(message: InboundChannelMessage): boolean {
    return message.isTrustedSender || config.STICKERS.ALLOW_UNTRUSTED;
  }

  private stripMention(text: string): string {
    if (!this.mentionId) return text;
    return text.replace(`@${this.mentionId}`, '').trim();
  }

  private buildPrompt(message: InboundChannelMessage, text: string): string {
    if (text.trim().startsWith('/')) {
      return text;
    }

    const parts: string[] = ['[Context]'];
    const trustSuffix = message.isTrustedSender ? '' : ' (untrusted sender)';
    if (message.groupName) {
      parts.push(`Chat: "${message.groupName}" (group)${trustSuffix}.`);
    } else if (message.isGroup) {
      parts.push(`Chat: group${trustSuffix}.`);
    } else {
      parts.push(`Chat: direct${trustSuffix}.`);
    }

    if (this.prefixSenderName && message.senderName) {
      parts.push(`Sender: ${message.senderName}.`);
    }

    if (message.quotedText) {
      parts.push(`Quoting: "${message.quotedText}"`);
    } else if (message.images?.some((img) => img.source === 'quoted')) {
      parts.push('Quoting an image.');
    }

    if (text) {
      parts.push(`Message: ${text}`);
    }

    return parts.join(' ');
  }
}

class ChannelHandlerFactory {
  static create(options: ChannelHandlerOptions): ChannelHandler {
    return new ChannelHandler(options);
  }
}

export { ChannelHandler, ChannelHandlerFactory };