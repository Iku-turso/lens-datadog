import { getInjectable2 } from "@k8slens/injectable";
import { getSubscribableInjectableBunch } from "@k8slens/subscribable";
import { resolveDatadogClusterNameInjectable } from "./cluster-name.injectable";
import { DatadogApiError, datadogApiRequestInjectable } from "./datadog-api.injectable";
import { resourceTag } from "./datadog-links";
import { getDatadogSettingsInjectable } from "./settings.injectable";

export type MonitorStatus = "Alert" | "Warn" | "No Data" | "OK" | "Ignored" | "Skipped" | "Unknown";

export interface MonitorGroup {
  readonly monitorId: number;
  readonly monitorName: string;
  readonly group: string;
  readonly status: MonitorStatus;
  readonly lastTriggered: string | null;
}

export type MonitorGroups =
  | { readonly state: "not-configured" }
  | { readonly state: "loaded"; readonly groups: readonly MonitorGroup[] }
  | { readonly state: "failed"; readonly message: string };

interface GroupSearchResponse {
  readonly groups?: readonly {
    readonly group: string;
    readonly group_tags?: readonly string[];
    readonly monitor_id: number;
    readonly monitor_name: string;
    readonly status: string;
    readonly last_triggered_ts?: number | null;
  }[];
}

const severity: Record<string, number> = { Alert: 0, Warn: 1, "No Data": 2, Unknown: 3, OK: 4 };

/** The monitor groups whose group is the resource, as Datadog's triggered monitors list has them. */
export const findMonitorGroupsInjectable = getInjectable2({
  id: "datadog-find-monitor-groups",
  instantiate: (di) => {
    const request = di.inject(datadogApiRequestInjectable)();
    const resolveClusterName = di.inject(resolveDatadogClusterNameInjectable)();

    return () =>
      async (clusterId: string, kind: string, name: string, namespace?: string): Promise<MonitorGroup[]> => {
        const tag = resourceTag({ kind, name, namespace });
        const clusterName = (await resolveClusterName(clusterId)).name;

        const search = (query: string) =>
          request<GroupSearchResponse>("/api/v1/monitor/groups/search", { query, per_page: "100" });

        let response: GroupSearchResponse;

        try {
          response = await search(`group:"${tag}"`);
        } catch (error) {
          // An older search syntax: fall back to the tag as text and filter below.
          if (!(error instanceof DatadogApiError) || error.status !== 400) throw error;
          response = await search(`"${tag}"`);
        }

        const sameTagKey = (tags: readonly string[], key: string, value: string | null | undefined) => {
          const ofKey = tags.filter((it) => it.startsWith(`${key}:`));

          return !value || ofKey.length === 0 || ofKey.includes(`${key}:${value}`);
        };

        return (response.groups ?? [])
          .filter((group) => {
            const tags = group.group_tags ?? group.group.split(",");

            return (
              tags.includes(tag) &&
              sameTagKey(tags, "kube_cluster_name", clusterName) &&
              (kind === "Namespace" || kind === "Node" || sameTagKey(tags, "kube_namespace", namespace))
            );
          })
          .map((group) => ({
            monitorId: group.monitor_id,
            monitorName: group.monitor_name,
            group: group.group,
            status: (group.status in severity ? group.status : "Unknown") as MonitorStatus,
            lastTriggered: group.last_triggered_ts ? new Date(group.last_triggered_ts * 1000).toISOString() : null,
          }))
          .sort((a, b) => (severity[a.status] ?? 9) - (severity[b.status] ?? 9) || a.monitorName.localeCompare(b.monitorName));
      };
  },
});

export const monitorGroupsBunch = getSubscribableInjectableBunch<
  MonitorGroups,
  [clusterId: string, kind: string, name: string, namespace: string]
>()({
  id: "monitor-groups",
  load: {
    instantiate: (di) => {
      const getSettings = di.inject(getDatadogSettingsInjectable)();
      const findMonitorGroups = di.inject(findMonitorGroupsInjectable)();

      return () => async (clusterId, kind, name, namespace) => {
        const settings = await getSettings();

        if (!settings.apiKey || !settings.applicationKey) {
          return { state: "not-configured" };
        }

        try {
          return { state: "loaded", groups: await findMonitorGroups(clusterId, kind, name, namespace || undefined) };
        } catch (error) {
          return { state: "failed", message: error instanceof Error ? error.message : String(error) };
        }
      };
    },
  },
});
