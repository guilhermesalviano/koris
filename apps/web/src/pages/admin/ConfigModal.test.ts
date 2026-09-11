import { describe, expect, it } from 'vitest';
import { SECTIONS } from './ConfigModal';

describe('ConfigModal sections and navigation', () => {
  it('defines all 8 standard workspace configuration sections', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(ids).toEqual(['providers', 'channels', 'plugins', 'skills', 'memories', 'beats', 'sessions', 'general']);
  });

  it('provides non-empty labels, descriptions, icons, and component mappings for all sections', () => {
    for (const section of SECTIONS) {
      expect(section.id).toBeTruthy();
      expect(section.label).toBeTruthy();
      expect(section.description).toBeTruthy();
      expect(section.Icon).toBeDefined();
      expect(section.Component).toBeDefined();
    }
  });

  it('recognizes valid section IDs for direct deeplinking', () => {
    const isValidSection = (id?: string) => SECTIONS.some((s) => s.id === id);
    expect(isValidSection('providers')).toBe(true);
    expect(isValidSection('channels')).toBe(true);
    expect(isValidSection('plugins')).toBe(true);
    expect(isValidSection('skills')).toBe(true);
    expect(isValidSection('memories')).toBe(true);
    expect(isValidSection('beats')).toBe(true);
    expect(isValidSection('sessions')).toBe(true);
    expect(isValidSection('general')).toBe(true);
    expect(isValidSection('unknown')).toBe(false);
    expect(isValidSection(undefined)).toBe(false);
  });
});
