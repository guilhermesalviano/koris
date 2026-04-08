import readline from 'readline';
import { processUserMessage } from '../agent/processor';
import { handleCommand, isCommand } from '../agent/commands';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
};

interface SessionState {
  messageCount: number;
  startTime: Date;
}

export function startTUI(): void {
  const session: SessionState = {
    messageCount: 0,
    startTime: new Date(),
  };

  printWelcome();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.cyan}>${colors.reset} `,
    terminal: true,
  });

  rl.prompt();

  rl.on('line', async (input: string) => {
    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    // todo: unify Telegram handle messages and TUI handle messages.
    if (isCommand(trimmed)) {
      const result = handleCommand(trimmed, { source: 'tui', session, rl });
      
      // Handle actions
      if (result.action === 'exit') {
        console.log(`\n${colors.green}${result.response}${colors.reset}`);
        rl.close();
        return;
      }
      
      if (result.action === 'clear') {
        console.clear();
        printWelcome();
        rl.prompt();
        return;
      }
      
      if (result.action === 'reset') {
        session.messageCount = 0;
        session.startTime = new Date();
        console.log(`${colors.green}${result.response}${colors.reset}\n`);
        rl.prompt();
        return;
      }
      
      // Display response
      if (result.response) {
        console.log(`\n${result.response}\n`);
      }
      
      rl.prompt();
      return;
    }

    session.messageCount++;

    try {
      const stop = startThinkingSpinner("Thinking");

      // Simulate processing time (remove in production)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Set to process in bg with queue
      const response = await processUserMessage(trimmed, 'tui');

      stop();

      // Clear the thinking line is not working properly
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearLine(process.stdout, 0);

      // Print response with formatting - in debug mode...
      console.log(`${colors.reset}●${colors.reset} ${formatResponse(response)}`);
      console.log();
    } catch (error) {
      console.log(`${colors.red}✗ Error:${colors.reset} ${error instanceof Error ? error.message : String(error)}`);
      console.log();
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${colors.dim}Session ended. Messages: ${session.messageCount}${colors.reset}`);
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log('\n');
    rl.question(`${colors.yellow}Are you sure you want to exit? (y/n)${colors.reset} `, (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        rl.close();
      } else {
        rl.prompt();
      }
    });
  });
}

function printWelcome(): void {
  console.clear();
  console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.bright}opencrawdio - AI Assistant${colors.reset}                               ${colors.bright}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();
  console.log(`${colors.dim}Type your message or use slash commands for help.${colors.reset}`);
  console.log(`${colors.dim}Commands: /help /clear /exit /stats${colors.reset}`);
  console.log();
}

function startThinkingSpinner(label = "Thinking"): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;

  const interval = setInterval(() => {
    process.stdout.write(
      `\r${colors.dim}${colors.gray}${frames[i]} ${label}...${colors.reset}`
    );
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(interval);
    process.stdout.write('\r' + ' '.repeat(label.length + 10) + '\r');
  };
}

function formatResponse(response: string): string {
  // Add subtle indentation and formatting
  const lines = response.split('\n');
  return lines
    .map(line => {
      // Highlight code blocks
      if (line.trim().startsWith('```')) {
        return `${colors.dim}${line}${colors.reset}`;
      }
      // Highlight bullet points
      if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        return `  ${colors.cyan}•${colors.reset}${line.substring(line.indexOf('-') + 1)}`;
      }
      // Highlight numbered lists
      if (/^\s*\d+\./.test(line)) {
        return `  ${line}`;
      }
      return line;
    })
    .join('\n');
}
