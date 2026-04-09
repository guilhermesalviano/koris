import { startTui } from 'assistant-tui';
import { processUserMessage } from '../agent/processor';
import { handleCommand, isCommand } from '../agent/commands';

export function startTUI(): void {
  startTui({
    renderWelcome: ({ colors, println, clear }) => {
      clear();
      println(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
      println(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.bright}opencrawdio - AI Assistant${colors.reset}                               ${colors.bright}${colors.cyan}║${colors.reset}`);
      println(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
      println();
      println(`${colors.dim}Type your message or use slash commands for help.${colors.reset}`);
      println(`${colors.dim}Commands: /help /clear /exit /stats${colors.reset}`);
      println();
    },
    spinner: { enabled: true, label: 'Thinking' },
    isCommand,
    onCommand: async (command, ctx) => {
      return handleCommand(command, { source: 'tui', session: ctx.session, rl: ctx.rl });
    },
    onInput: async (message) => {
      return processUserMessage(message, 'tui');
    },
  });
}
