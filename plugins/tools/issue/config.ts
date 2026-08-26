import { definePluginConfig } from '../../config/define-config';

export interface IssuePluginConfig {
  enabled: boolean;
}

const issueConfig = definePluginConfig<IssuePluginConfig>({
  family: 'tools',
  pluginName: 'issue',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_ISSUE_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadIssueConfig = issueConfig.load;
export const writeIssueConfigPatch = issueConfig.writePatch;
