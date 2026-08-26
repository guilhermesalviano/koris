import type { StickerReference } from '../contracts';
import { WhatsAppChannel } from './channel';
import { startBaileysSocket } from './socket';
import { whatsappState } from './state';
import type { IWhatsAppChannel, WhatsAppChannelStartOptions } from './types';

export class WhatsAppChannelFactory {
  static create(): IWhatsAppChannel {
    return new WhatsAppChannel();
  }

  static async start(
    options: WhatsAppChannelStartOptions,
  ): Promise<{ channel: IWhatsAppChannel; stop: () => void }> {
    const channel = new WhatsAppChannel(undefined);
    const sock = await startBaileysSocket(options);
    whatsappState.activeSocket = sock;

    return {
      channel,
      stop: () => {
        // Detach listeners before ending the socket: `sock.end()` itself
        // emits a `connection.update` close event, and the still-attached
        // handler's reconnect logic (`shouldReconnect` — see
        // FINDINGS.md §4) can't distinguish a deliberate stop from a real
        // disconnect. Without this, calling `stop()` could spawn a brand
        // new rogue socket right after intentionally shutting down.
        sock.ev.removeAllListeners('creds.update');
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('messages.upsert');
        sock.end(undefined);
        whatsappState.activeSocket = null;
      },
    };
  }

  static async sendText(jid: string, text: string): Promise<void> {
    const channel = new WhatsAppChannel();
    await channel.sendText(jid, text);
  }

  static async sendSticker(jid: string, sticker: StickerReference): Promise<void> {
    const channel = new WhatsAppChannel();
    await channel.sendSticker(jid, sticker);
  }
}
