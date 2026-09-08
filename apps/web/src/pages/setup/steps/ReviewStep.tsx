import type { SettingsFormApi } from "../../../lib/use-settings-form";
import type { UsePluginsApi } from "../../../lib/use-plugins";

const rowClass = "flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-4 border-b border-subtle py-2 sm:py-1.5 text-sm last:border-0";

function formatName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ReviewStep({ api, pluginsApi }: { api: SettingsFormApi; pluginsApi?: UsePluginsApi }) {
  const { form } = api;
  const workers = form.sameForBoth ? form.manager : form.workers;

  const activeChannels = pluginsApi
    ? pluginsApi.items
        .filter((i) => i.family === "channels" && i.enabled)
        .map((i) => formatName(i.name))
    : [];

  return (
    <div>
      <div className="rounded-lg border border-subtle bg-bg-3 px-3.5 py-3 sm:px-4">
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Manager provider</span>
          <span className="break-all font-mono text-xs text-txt sm:break-normal sm:text-right sm:text-sm">{form.manager.provider} · {form.manager.model || "—"}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Worker provider</span>
          <span className="break-all font-mono text-xs text-txt sm:break-normal sm:text-right sm:text-sm">{workers.provider} · {workers.model || "—"}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Active channels</span>
          <span className="text-xs text-txt sm:text-sm font-mono">{activeChannels.length > 0 ? activeChannels.join(", ") : "none"}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Personal info fields</span>
          <span className="text-xs text-txt sm:text-sm">{Object.keys(form.personal_information).length || "none"}</span>
        </div>
      </div>

      {api.saveErrors && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-[#2a1212] px-4 py-3 text-sm text-red-300">
          {api.saveErrors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
