import { startTui } from 'assistant-tui';
import { processUserMessage } from '../agent/processor';
import { handleCommand, isCommand } from '../agent/commands';

export function startTUI(): void {
  startTui({
    // Modern fixed-input layout with scrollable history
    fixedInput: true,
    
    // Beautiful title for welcome banner
    title: 'opencrawdio - AI Assistant',
    
    // Show helpful quick tips
    showHints: true,
    
    // Enhanced spinner during processing
    spinner: { enabled: true, label: 'Processing' },
    
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
    
    // Main message handler
    onInput: async (message, ctx) => {
      const response = await processUserMessage(message, 'tui');
      
      // Include stats info for debugging
      if (response && message.toLowerCase().includes('debug')) {
        const debugInfo = `\n\n${ctx.colors.dim}[Debug: Terminal ${ctx.terminalWidth}x${ctx.terminalHeight}, Messages: ${ctx.session.messageCount}]${ctx.colors.reset}`;
        return response + debugInfo;
      }
      
      return response;
    },
  });
}
