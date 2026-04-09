import { config } from "../config";
import * as fs from "fs";
import * as path from "path";

function readFile(filename: string): string {
  try {
    const resolved = path.resolve(config.BASE_DIR, filename);
    if (!resolved.startsWith(config.BASE_DIR)) {
      throw new Error('Permission denied: Access outside of allowed directory');
    }
    const stats = fs.statSync(resolved);

    if (stats.isDirectory()) {
      return `❌ *Cannot read:* \`${filename}\` is a directory, not a file.`;
    }

    const content = fs.readFileSync(resolved, "utf-8");
    const ext = path.extname(filename).replace(".", "") || "plaintext";
    const size = formatSize(stats.size);
    const lines = content.split("\n").length;

    if (content.trim().length === 0) {
      return `*File Content: ${resolved}*\n\n_Empty file._`;
    }

    return `*File Content: ${resolved}* _(${size}, ${lines} lines)_\n\n\`\`\`${ext}\n${content}\n\`\`\``;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return `*File not found:* \`${filename}\``;
    }
    if (err.code === "EACCES") {
      return `*Permission denied:* \`${filename}\``;
    }
    if (err.code === "EISDIR") {
      return `*Cannot read:* \`${filename}\` is a directory.`;
    }
    return `*Error reading file:* ${err.message}`;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export { readFile }