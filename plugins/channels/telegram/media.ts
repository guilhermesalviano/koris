import { IMAGE_MIME_BY_EXT } from './constants';
import { telegramState } from './state';

export function mimeFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_MIME_BY_EXT[ext];
}

export function telegramFileBaseUrl(): string {
  return `https://api.telegram.org/bot${telegramState.botToken}`;
}

export function telegramFileDownloadUrl(): string {
  return `https://api.telegram.org/file/bot${telegramState.botToken}`;
}
