import * as fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Escape special characters for Telegram Markdown
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

/**
 * Search for a query string in the codebase
 * Uses grep for efficient file content searching
 */
export async function search(query: string): Promise<string> {
  if (!query || query.trim() === '') {
    return '❌ *Error*: Search query cannot be empty';
  }

  try {
    // Use current working directory as search root
    const searchDir = process.cwd();
    
    // Check if directory exists
    if (!fs.existsSync(searchDir)) {
      return `❌ *Error*: Directory does not exist: ${escapeMarkdown(searchDir)}`;
    }

    // Run grep to search for the query
    // -r: recursive
    // -n: show line numbers
    // -I: ignore binary files
    // --exclude-dir: exclude common directories
    const excludeDirs = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'coverage',
      '.cache'
    ].map(dir => `--exclude-dir=${dir}`).join(' ');

    const grepCommand = `grep -rn -I ${excludeDirs} "${query.replace(/"/g, '\\"')}" . 2>/dev/null || true`;
    
    const { stdout } = await execAsync(grepCommand, {
      cwd: searchDir,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    if (!stdout || stdout.trim() === '') {
      return `🔍 *Searching for:* "${escapeMarkdown(query)}"

No matches found in the codebase.`;
    }

    // Parse grep output
    const lines = stdout.trim().split('\n');
    const results: SearchResult[] = [];

    for (const line of lines) {
      // Format: ./path/to/file.ts:123:content
      const match = line.match(/^\.\/(.+?):(\d+):(.+)$/);
      if (match) {
        results.push({
          file: match[1],
          line: parseInt(match[2], 10),
          content: match[3].trim()
        });
      }
    }

    // Limit results to first 20 to avoid overwhelming output
    const limitedResults = results.slice(0, 20);
    const hasMore = results.length > 20;

    // Format results
    let response = `🔍 Searching for: "${escapeMarkdown(query)}"\n\nFound ${results.length} match${results.length === 1 ? '' : 'es'}${hasMore ? ` (showing first 20)` : ''}:\n\n`;

    for (let i = 0; i < limitedResults.length; i++) {
      const result = limitedResults[i];
      const lineNumber = result.line;
      const fileEscaped = escapeMarkdown(result.file);
      const contentEscaped = escapeMarkdown(result.content);
      
      response += `${i + 1}\\. **${fileEscaped}:${lineNumber}**
   \`${contentEscaped}\`

`;
    }

    if (hasMore) {
      response += `\\_\\.\\.\\. and ${results.length - 20} more matches\\_`;
    }

    return response.trim();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `❌ *Search Error*

Query: "${escapeMarkdown(query)}"

${escapeMarkdown(errorMessage)}`;
  }
}
