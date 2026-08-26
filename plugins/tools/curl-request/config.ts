import { definePluginConfig } from '../../config/define-config';

export interface CurlRequestPluginConfig {
  enabled: boolean;
}

const curlRequestConfig = definePluginConfig<CurlRequestPluginConfig>({
  family: 'tools',
  pluginName: 'curl-request',
  fallbackDir: __dirname,
  schema: {
    // Tools default ON (unlike channels, which default off) — this is one of
    // the 11 tools the agent already had available before the plugin split.
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_CURL_REQUEST_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadCurlRequestConfig = curlRequestConfig.load;
export const writeCurlRequestConfigPatch = curlRequestConfig.writePatch;
