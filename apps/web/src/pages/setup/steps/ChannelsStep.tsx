import { useMemo, useState } from "react";
import type { SettingsFormApi } from "../../../lib/use-settings-form";
import { usePlugins, type UsePluginsApi } from "../../../lib/use-plugins";
import { useChannelsCatalog } from "../../../lib/use-channels-catalog";
import { apiRequest } from "../../../lib/api";
import type { ChannelHints } from "../../../lib/types";

const buttonClass = "rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60";

function formatName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ChannelsStep({
  pluginsApi: providedPluginsApi,
}: {
  api?: SettingsFormApi;
  pluginsApi?: UsePluginsApi;
  onlyEnabled?: boolean;
} = {}) {
  const localPluginsApi = usePlugins();
  const pluginsApi = providedPluginsApi ?? localPluginsApi;
  const { items: catalogItems, loading: catalogLoading, reload: catalogReload } = useChannelsCatalog();

  const [downloading, setDownloading] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const channels = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; summary?: string; hints?: ChannelHints }>();

    for (const item of catalogItems) {
      map.set(item.slug, {
        slug: item.slug,
        name: item.name,
        summary: item.summary,
        hints: item.hints,
      });
    }

    for (const item of pluginsApi.items) {
      if (item.family === "channels" && !map.has(item.name)) {
        map.set(item.name, {
          slug: item.name,
          name: formatName(item.name),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogItems, pluginsApi.items]);

  async function handleDownloadChannel(slug: string) {
    setDownloading(slug);
    setDownloadError(null);
    try {
      await apiRequest(`/marketplace/${slug}/pull`, { method: "POST" });
      await apiRequest(`/plugins/channels/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: true }),
      });
      await pluginsApi.reload();
      await catalogReload();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : `Failed to download ${slug}`);
    } finally {
      setDownloading(null);
    }
  }

  async function handleToggleChannel(slug: string, enabled: boolean) {
    setActivating(slug);
    setDownloadError(null);
    try {
      await apiRequest(`/plugins/channels/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await pluginsApi.reload();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : `Failed to update ${slug}`);
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <p className="text-sm font-medium">Chat channels (optional)</p>
        <p className="mt-1 font-mono text-[11px] text-txt-3">
          Download and activate chat channels to communicate with your agent via messaging apps, or click Next to proceed with Web & TUI only.
        </p>
      </div>

      {downloadError && (
        <div className="rounded-lg border border-red-500/40 bg-[#2a1212] px-4 py-2.5 text-xs text-red-300">
          {downloadError}
        </div>
      )}

      {catalogLoading && channels.length === 0 && (
        <div className="rounded-lg border border-subtle bg-bg-3 p-6 text-center font-mono text-xs text-txt-3">
          Loading channels…
        </div>
      )}

      {!catalogLoading && channels.length === 0 && (
        <div className="rounded-lg border border-subtle bg-bg-3 p-6 text-center font-mono text-xs text-txt-3">
          No channels found.
        </div>
      )}

      {channels.map((channel) => {
        const plugin = pluginsApi.items.find((i) => i.family === "channels" && i.name === channel.slug);
        const isInstalled = !!plugin;
        const isEnabled = plugin?.enabled ?? false;

        const activeHints = Object.entries(channel.hints ?? {})
          .filter(([key, val]) => key !== "uninstalled" && key !== "inactive" && Boolean(val));

        return (
          <div key={channel.slug} className="rounded-lg border border-subtle bg-bg-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{channel.name}</span>
                {!isInstalled ? (
                  <span className="font-mono text-[10px] uppercase text-amber-400 border border-amber-400/30 rounded px-1.5 py-0.5">
                    Not installed
                  </span>
                ) : !isEnabled ? (
                  <span className="font-mono text-[10px] uppercase text-txt-3 border border-subtle rounded px-1.5 py-0.5">
                    Installed (Inactive)
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase text-emerald-400 border border-emerald-400/30 rounded px-1.5 py-0.5">
                    Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isInstalled ? (
                  <button
                    type="button"
                    disabled={downloading === channel.slug}
                    onClick={() => handleDownloadChannel(channel.slug)}
                    className={`${buttonClass} whitespace-nowrap`}
                  >
                    {downloading === channel.slug ? "Downloading…" : `Download ${channel.name}`}
                  </button>
                ) : !isEnabled ? (
                  <button
                    type="button"
                    disabled={activating === channel.slug}
                    onClick={() => handleToggleChannel(channel.slug, true)}
                    className={`${buttonClass} whitespace-nowrap`}
                  >
                    {activating === channel.slug ? "Activating…" : `Activate ${channel.name}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={activating === channel.slug}
                    onClick={() => handleToggleChannel(channel.slug, false)}
                    className="rounded-lg border border-subtle bg-bg px-3 py-1.5 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 whitespace-nowrap"
                  >
                    {activating === channel.slug ? "Deactivating…" : "Deactivate"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3">
              {!isInstalled ? (
                (channel.hints?.uninstalled || channel.summary) ? (
                  <p className="font-mono text-[11px] text-txt-3">
                    {channel.hints?.uninstalled || channel.summary}
                  </p>
                ) : null
              ) : !isEnabled ? (
                channel.hints?.inactive ? (
                  <p className="font-mono text-[11px] text-txt-3">
                    {channel.hints.inactive}
                  </p>
                ) : (
                  <p className="font-mono text-[11px] text-txt-3">
                    {channel.name} channel is installed locally. Click Activate above to enable it.
                  </p>
                )
              ) : (
                <div className="space-y-1.5">
                  {activeHints.length > 0 ? (
                    activeHints.map(([key, hint]) => (
                      <p key={key} className="font-mono text-[11px] text-txt-3">
                        {hint}
                      </p>
                    ))
                  ) : (
                    <p className="font-mono text-[11px] text-txt-3">
                      {channel.name} channel is active.{channel.summary ? ` ${channel.summary}` : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
