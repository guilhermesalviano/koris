import { config } from "../config";
import * as fs from "fs";
import * as path from "path";

function readFile(filename: string): string {
  try {
    const resolved = path.resolve(config.BASE_DIR, filename);

    if (!resolved.startsWith(config.BASE_DIR)) {
      return `🔒 Permission denied: ${filename}`;
    }

    const stats = fs.statSync(resolved);

    if (stats.isDirectory()) {
      return `❌ Cannot read: ${filename} is not a file`;
    }

    const content = fs.readFileSync(resolved, "utf-8");
    const ext = path.extname(filename).replace(".", "") || "plaintext";
    const size = formatSize(stats.size);
    const lines = content.split("\n").length;

    if (content.trim().length === 0) {
      return `📄 Reading file: ${resolved} (${size})\n\n_Empty file._`;
    }

    return `📄 Reading file: ${resolved} (${size}, ${lines} lines)\n\n\`\`\`${ext}\n${content}\n\`\`\``;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return `❌ File not found: ${filename}`;
    }
    if (err?.code === "EACCES") {
      return `🔒 Permission denied: ${filename}`;
    }
    if (err?.code === "EISDIR") {
      return `❌ Cannot read: ${filename} is not a file`;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return `❌ Error reading file: ${msg}`;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export { readFile };