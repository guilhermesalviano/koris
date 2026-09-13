import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import * as Icons from './Icons';

const icons = Object.entries(Icons as Record<string, ComponentType<{ className?: string }>>);

describe('Icons', () => {
  it('exports icon components', () => {
    expect(icons.length).toBeGreaterThan(0);
  });

  it.each(icons)('%s renders an svg carrying the given className', (_name, Icon) => {
    const html = renderToStaticMarkup(<Icon className="size-4" />);
    expect(html).toMatch(/^<svg[\s>]/);
    expect(html).toContain('class="size-4"');
  });
});
