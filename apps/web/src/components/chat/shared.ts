import type { ImageAttachment } from '../../lib/types';

/**
 * The reading measure shared by the thread and the composer docked under it, so
 * the two line up as one column instead of drifting apart on wide screens.
 */
export const CHAT_COLUMN = 'mx-auto w-full max-w-[68ch]';

export function imageSrc(image: ImageAttachment): string {
  return `data:${image.mimeType ?? 'image/png'};base64,${image.data}`;
}

/** Opens the lightbox on one image of a set. */
export type PreviewImages = (images: ImageAttachment[], index: number) => void;
