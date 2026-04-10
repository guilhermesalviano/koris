import { startTui } from '../src/index';

/**
 * Manual test for fixed input functionality
 * 
 * Run with: tsx tests/manual-test.ts
 * 
 * Test cases:
 * - Type "test" -> Check that input stays at bottom
 * - Type "many" -> Sends 10 lines, verify scrolling
 * - Type "clear" -> Clear screen
 * - Type "/help" -> Show help command
 * - Type "/exit" -> Exit cleanly
 */

let messageCount = 0;

startTui({
  title: 'Fixed Input Test Suite',
  showHints: true,
  fixedInput: true,
  onInput: async (message, ctx) => {
    messageCount++;
    
    if (message.toLowerCase() === 'test') {
      return `✅ Test #${messageCount}: Input should stay fixed at bottom!`;
    }
    
    if (message.toLowerCase() === 'many') {
      let response = '';
      for (let i = 1; i <= 10; i++) {
        response += `Message line ${i}\n`;
      }
      return response.trim();
    }
    
    if (message.toLowerCase() === 'fill') {
      let response = '';
      for (let i = 1; i <= 20; i++) {
        response += `Content line ${i}\n`;
      }
      return response.trim();
    }
    
    if (message.toLowerCase() === 'status') {
      return `Status: ${messageCount} messages processed. Terminal: ${ctx.terminalWidth}x${ctx.terminalHeight}`;
    }
    
    return `Echo: ${message}`;
  },
  onCommand: async (command, ctx) => {
    if (command === '/test-commands') {
      return {
        response: `Available test commands:
  test     - Single line response
  many     - 10 lines of content
  fill     - 20 lines of content (may scroll)
  status   - Show stats and terminal dimensions
  /help    - Show this help
  /exit    - Exit cleanly`,
        handled: true,
        action: 'none',
      };
    }
    
    return {
      handled: false,
    };
  },
});
