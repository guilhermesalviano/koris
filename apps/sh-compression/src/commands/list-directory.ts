import { config } from '../config';
import * as fs from "fs";
import * as path from "path";

/**
 * Escape special characters for Telegram Markdown
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

function listDirectory(dirPath: string): string {
  try {
    const targetPath = !dirPath || dirPath.trim() === '' || dirPath === '.' 
      ? config.BASE_DIR
      : dirPath;

    const resolved = path.resolve(config.BASE_DIR, targetPath);

    if (!resolved.startsWith(config.BASE_DIR)) {
      throw new Error('Permission denied: Access outside of allowed directory');
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });

    if (entries.length === 0) {
      const escapedPath = escapeMarkdown(resolved);
      return `📁 Directory listing: ${escapedPath}\n\n_Empty directory._`;
    }

    const folders = entries
      .filter((e) => e.isDirectory())
      .map((e) => `📁 ${escapeMarkdown(e.name)}/`)
      .join("\n");

    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const stats = fs.statSync(path.join(resolved, e.name));
        const size = ` _\\(${formatSize(stats.size)}\\)_`;
        return `📄 ${escapeMarkdown(e.name)}${size}`;
      })
      .join("\n");

    const lines = [folders, files].filter(Boolean).join("\n");
    const escapedPath = escapeMarkdown(resolved);

    return `📁 Directory listing: ${escapedPath}\n\n${lines}`;
  } catch (err: any) {
    const escapedPath = escapeMarkdown(dirPath);
    if (err.code === "ENOENT") {
      return `❌ *Path not found:* \`${escapedPath}\``;
    }
    if (err.code === "ENOTDIR") {
      return `❌ *Not a directory:* \`${escapedPath}\``;
    }
    if (err.code === "EACCES") {
      return `🔒 *Permission denied:* \`${escapedPath}\``;
    }
    const escapedError = escapeMarkdown(err.message);
    return `❌ *Error reading directory:* ${escapedError}`;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export { listDirectory };