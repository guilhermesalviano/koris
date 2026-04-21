import { describe, it, expect } from 'vitest';
import {
  buildSkillLearningPrompt,
  buildToolResultPrompt,
  buildSkillPrompt,
  buildSkillResponsePrompt,
} from '../../../src/utils/prompt';

describe('buildSkillLearningPrompt', () => {
  it('includes skill name in output', () => {
    const result = buildSkillLearningPrompt('weather-api', 'some docs');
    expect(result).toContain('weather-api');
  });

  it('includes skill content in output', () => {
    const result = buildSkillLearningPrompt('skill', 'SKILL_CONTENT_HERE');
    expect(result).toContain('SKILL_CONTENT_HERE');
  });

  it('instructs AI to use curl_request tool', () => {
    const result = buildSkillLearningPrompt('any', 'docs');
    expect(result).toContain('curl_request');
  });

  it('contains numbered step instructions', () => {
    const result = buildSkillLearningPrompt('any', 'docs');
    expect(result).toContain('1.');
    expect(result).toContain('2.');
    expect(result).toContain('3.');
  });
});

describe('buildToolResultPrompt', () => {
  it('includes original user request', () => {
    const result = buildToolResultPrompt('What is the weather?', 'result data');
    expect(result).toContain('What is the weather?');
  });

  it('includes tool results', () => {
    const result = buildToolResultPrompt('request', '{"status":"ok"}');
    expect(result).toContain('{"status":"ok"}');
  });

  it('wraps content in expected XML-like tags', () => {
    const result = buildToolResultPrompt('req', 'res');
    expect(result).toContain('<previous_context>');
    expect(result).toContain('<tool_results>');
  });
});

describe('buildSkillPrompt', () => {
  it('includes user request', () => {
    const result = buildSkillPrompt('find restaurants', 'some skill docs');
    expect(result).toContain('find restaurants');
  });

  it('includes skill documentation', () => {
    const result = buildSkillPrompt('req', 'MY_SKILL_DOC');
    expect(result).toContain('MY_SKILL_DOC');
  });

  it('wraps content in XML-like tags', () => {
    const result = buildSkillPrompt('req', 'doc');
    expect(result).toContain('<user_request>');
    expect(result).toContain('<skills_documentation>');
  });

  it('instructs AI not to use external knowledge', () => {
    const result = buildSkillPrompt('req', 'doc');
    expect(result).toContain('Do not use external knowledge');
  });
});

describe('buildSkillResponsePrompt', () => {
  it('includes execution results', () => {
    const result = buildSkillResponsePrompt('EXEC_RESULT');
    expect(result).toContain('EXEC_RESULT');
  });

  it('tells AI to provide an answer based on results', () => {
    const result = buildSkillResponsePrompt('data');
    expect(result).toContain('provide an answer');
  });
});
