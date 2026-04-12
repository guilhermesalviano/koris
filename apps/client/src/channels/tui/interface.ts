import { startTui } from 'assistant-tui';
import { processUserMessage } from '../../agent/processor';
import { handleCommand, isCommand } from '../../agent/commands';
import { config } from '../../config';

export function startTUI(): void {
  startTui({
    // Modern fixed-input layout with scrollable history
    fixedInput: true,
    
    // Beautiful title for welcome banner
    title: 'opencrawdio - AI Assistant',
    
    // Show helpful quick tips
    showHints: false,
    
    // Enhanced spinner during processing
    spinner: { enabled: true },
    
    // Thinking indicator for responses
    assistantPrefix: '●',
    
    // Command detection
    isCommand,
    
    // Format responses with better visual hierarchy
    formatResponse: (response, ctx) => {
      const { colors } = ctx;
      const lines = response.split('\n');
      
      return lines
        .map((line) => {
          const trimmed = line.trim();
          
          // Bold headers (lines ending with :)
          if (trimmed.endsWith(':')) {
            return `${colors.bright}${colors.magenta}${line}${colors.reset}`;
          }
          
          // Code fences
          if (trimmed.startsWith('```')) {
            return `${colors.dim}${colors.gray}${line}${colors.reset}`;
          }
          
          // Bullet points
          if (/^\s*([-•])\s+/.test(line)) {
            const content = line.replace(/^\s*[-•]\s+/, '');
            return `  ${colors.cyan}•${colors.reset} ${content}`;
          }
          
          // Numbered lists
          if (/^\s*\d+\./.test(line)) {
            return `  ${colors.yellow}${line.trim()}${colors.reset}`;
          }
          
          return line;
        })
        .join('\n');
    },
    
    // Command handler with full context
    onCommand: async (command, ctx) => {
      const result = handleCommand(command, { 
        source: 'tui', 
        session: ctx.session, 
        rl: ctx.rl 
      });
      
      // Format the response with colors
      if (result.response) {
        const formatted = `${ctx.colors.green}${result.response}${ctx.colors.reset}`;
        return {
          ...result,
          response: formatted,
        };
      }
      
      return result;
    },

    aiModel: config.AI.MODEL,
    
    // Main message handler
    onInput: async (message) => {
      return await processUserMessage(message, 'tui');
    },
  });
}
