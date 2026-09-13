import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Card, EmptyState, PageShell, StatCard, Toast, Toggle, formatDate } from './AdminUI';

describe('AdminUI', () => {
  describe('PageShell', () => {
    it('renders the title, description, leading slot, actions and a refresh button', () => {
      const html = renderToStaticMarkup(
        <PageShell title="Errands" description="Delegated tasks" leading={<img alt="portrait" />} actions={<span>extra</span>} onRefresh={() => {}}>
          <p>body</p>
        </PageShell>,
      );
      expect(html).toContain('<h1');
      expect(html).toContain('Errands');
      expect(html).toContain('Delegated tasks');
      expect(html).toContain('alt="portrait"');
      expect(html).toContain('extra');
      expect(html).toContain('Refresh');
      expect(html).toContain('<p>body</p>');
    });

    it('omits the description and the action bar when neither is given', () => {
      const html = renderToStaticMarkup(<PageShell title="Overview"><p>body</p></PageShell>);
      expect(html).not.toContain('Refresh');
      expect(html).not.toContain('ml-auto');
      expect(html).not.toContain('truncate');
    });
  });

  it('Card adds hover affordance only when interactive', () => {
    expect(renderToStaticMarkup(<Card interactive>x</Card>)).toContain('cursor-pointer');
    expect(renderToStaticMarkup(<Card>x</Card>)).not.toContain('cursor-pointer');
  });

  it('EmptyState renders its text and optional action', () => {
    const html = renderToStaticMarkup(<EmptyState text="Nothing here" action={<button>Add</button>} />);
    expect(html).toContain('Nothing here');
    expect(html).toContain('<button>Add</button>');
  });

  it('StatCard renders label, value and an optional hint', () => {
    const withHint = renderToStaticMarkup(<StatCard label="Sessions" value={12} hint="last 24h" />);
    expect(withHint).toContain('Sessions');
    expect(withHint).toContain('12');
    expect(withHint).toContain('last 24h');
    expect(renderToStaticMarkup(<StatCard label="Sessions" value="0" />)).not.toContain('text-mini');
  });

  describe('formatDate', () => {
    it('renders a dash for empty values', () => {
      expect(formatDate()).toBe('—');
      expect(formatDate(null)).toBe('—');
      expect(formatDate('')).toBe('—');
    });

    it('returns an unparseable value as-is', () => {
      expect(formatDate('not a date')).toBe('not a date');
    });

    it('formats a valid date in the local format', () => {
      const date = new Date('2026-09-13T10:00:00Z');
      expect(formatDate(date.toISOString())).toBe(date.toLocaleString());
    });
  });

  it('Toggle reflects checked, disabled and label', () => {
    const on = renderToStaticMarkup(<Toggle checked onChange={() => {}} label="Enabled" disabled />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('aria-label="Enabled"');
    expect(on).toContain('disabled=""');
    expect(on).toContain('translate-x-4');
    const off = renderToStaticMarkup(<Toggle checked={false} onChange={() => {}} />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('translate-x-1');
  });

  it('Toast renders nothing without a message and styles errors', () => {
    expect(renderToStaticMarkup(<Toast message={null} isError={false} />)).toBe('');
    expect(renderToStaticMarkup(<Toast message="Saved" isError={false} />)).toContain('Saved');
    expect(renderToStaticMarkup(<Toast message="Failed" isError />)).toContain('text-danger');
  });
});
