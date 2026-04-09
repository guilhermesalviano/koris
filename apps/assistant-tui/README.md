# assistant-tui

A tiny, dependency-free TUI runner (Node.js `readline`) for CLI apps.

## Install

```bash
pnpm add assistant-tui
# or: npm i assistant-tui
```

## Usage

```ts
import { startTUI } from 'assistant-tui';

startTUI({
  onInput: async (message) => {
    return `You said: ${message}`;
  },
  onCommand: async (command) => {
    if (command === '/exit') return { handled: true, action: 'exit', response: 'bye' };
    return { handled: false };
  },
});
```
