import { startTui } from 'assistant-tui';
import { handleCommand, isCommand } from '../../services/agents/commands';
import { config } from '../../config';
import { ILogger } from '../../infrastructure/logger';
import { AgentHandlerFactory } from '../../services/agents/handler';

export function startTUI(params: { logger: ILogger }): void {
  const handler = AgentHandlerFactory.create(params.logger, 'tui');
  const progressDotColors = [
    defaultColor('cyan'),
    defaultColor('magenta'),
    defaultColor('yellow'),
    defaultColor('green'),
    defaultColor('blue'),
  ];

  startTui({
    // Modern fixed-input layout with scrollable history
    fixedInput: true,
    
    // Beautiful title for welcome banner
    title: 'koris-agent',
    
    // Show helpful quick tips
    showHints: false,
    
    // Enhanced spinner during processing
    spinner: { enabled: true },
    
    // Thinking indicator for responses
    assistantPrefix: '●',

    footerText: `/ for commands  |  Model: ${config.AI.MODEL}`,
    
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
    
    // Main message handler with progress updates
    onInput: async (message, ctx) => {
      const progressMessages: string[] = [];
      
      return await handler.handle(message, {
        toolsEnabled: true,
        signal: ctx.requestSignal,
        onProgress: (summary: string) => {
          progressMessages.push(summary);
          const latest = progressMessages[progressMessages.length - 1];
          const dotColor = progressDotColors[(progressMessages.length - 1) % progressDotColors.length](ctx);
          const { headline, details } = splitProgressSummary(latest);

          ctx.println(`${ctx.colors.dim}${ctx.colors.bright}${dotColor}●${ctx.colors.reset}${ctx.colors.dim} ${headline}${ctx.colors.reset}`);

          if (details) {
            ctx.println(`${ctx.colors.dim}${ctx.colors.gray}  └ ${details}${ctx.colors.reset}`);
          }

          ctx.println();
        }
      });
    },
  });
}

function splitProgressSummary(summary: string): { headline: string; details?: string } {
  const value = summary.trim();
  if (!value) {
    return { headline: 'Working...' };
  }

  const splitters = [': ', ' - ', ' — '];
  for (const splitter of splitters) {
    const index = value.indexOf(splitter);
    if (index <= 0) {
      continue;
    }

    const headline = value.slice(0, index).trim();
    const details = value.slice(index + splitter.length).trim();

    if (headline && details) {
      return { headline, details };
    }
  }

  return { headline: value };
}

function defaultColor(name: 'cyan' | 'magenta' | 'yellow' | 'green' | 'blue') {
  return (ctx: { colors: { cyan: string; magenta: string; yellow: string; green: string; blue: string } }) => ctx.colors[name];
}
