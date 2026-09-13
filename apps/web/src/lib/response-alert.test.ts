import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

function setup(hidden: boolean, iconHrefs: string[]) {
  const listeners = new Map<string, Set<Listener>>();
  const links = iconHrefs.map((href) => ({ href }));
  vi.stubGlobal('document', {
    hidden,
    querySelectorAll: vi.fn(() => links),
  });
  vi.stubGlobal('window', {
    addEventListener: vi.fn((event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    }),
  });
  const fire = (event: string) => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener();
  };
  return { links, listeners, fire };
}

describe('response alert favicon', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing while the tab is visible', async () => {
    const { links } = setup(false, ['/favicon.ico']);
    const { triggerResponseDone } = await import('./response-alert');

    triggerResponseDone();

    expect(links[0].href).toBe('/favicon.ico');
  });

  it('does nothing when the page has no icon links', async () => {
    setup(true, []);
    const { triggerResponseDone } = await import('./response-alert');

    triggerResponseDone();

    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it('swaps every icon to the alert favicon in a hidden tab and restores it on the next interaction', async () => {
    const { links, fire } = setup(true, ['/favicon.ico', '/favicon-32.png']);
    const { triggerResponseDone } = await import('./response-alert');

    triggerResponseDone();
    expect(links.map((link) => link.href)).toEqual(['/favicon-alert.ico', '/favicon-alert.ico']);

    fire('focus');
    expect(links.map((link) => link.href)).toEqual(['/favicon.ico', '/favicon-32.png']);
    expect(window.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does not re-arm while an alert is already showing', async () => {
    const { links } = setup(true, ['/favicon.ico']);
    const { triggerResponseDone, clearResponseAlert } = await import('./response-alert');

    triggerResponseDone();
    triggerResponseDone();
    expect(window.addEventListener).toHaveBeenCalledTimes(4);

    clearResponseAlert();
    expect(links[0].href).toBe('/favicon.ico');
    clearResponseAlert();
    expect(links[0].href).toBe('/favicon.ico');
  });
});
