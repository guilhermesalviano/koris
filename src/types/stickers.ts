import type { StickerReference } from '../../plugins/contracts';

export interface StickerRule {
  id: string;
  description: string;
  reference: StickerReference;
  channel: string;
  enabled: boolean;
  learned_at: string;
}

export interface SaveStickerRuleInput {
  description: string;
  reference: StickerReference;
  channel: string;
}
