import { appBaseUrl, type DatadogSite } from "./datadog-sites";

export type DatadogView = "logs" | "apm" | "metrics" | "explorer" | "events";

export const datadogViews: readonly { readonly view: DatadogView; readonly label: string }[] = [
  { view: "logs", label: "Logs" },
  { view: "apm", label: "APM traces" },
  { view: "metrics", label: "Metrics" },
  { view: "explorer", label: "Kubernetes Explorer" },
  { view: "events", label: "Events" },
];

interface KindMapping {
  // The tag the Datadog Agent puts on telemetry of this kind of resource.
  readonly tag: string;
  // The path of the kind's page in Datadog's Kubernetes Explorer.
  readonly explorerPath: string;
  // What the metrics explorer charts for it.
  readonly metric: string;
}

const kindMappings: Record<string, KindMapping> = {
  Pod: { tag: "pod_name", explorerPath: "pod", metric: "container.cpu.usage" },
  Deployment: { tag: "kube_deployment", explorerPath: "deployment", metric: "container.cpu.usage" },
  StatefulSet: { tag: "kube_stateful_set", explorerPath: "statefulset", metric: "container.cpu.usage" },
  DaemonSet: { tag: "kube_daemon_set", explorerPath: "daemonset", metric: "container.cpu.usage" },
  ReplicaSet: { tag: "kube_replica_set", explorerPath: "replicaset", metric: "container.cpu.usage" },
  Job: { tag: "kube_job", explorerPath: "job", metric: "container.cpu.usage" },
  CronJob: { tag: "kube_cronjob", explorerPath: "cronjob", metric: "container.cpu.usage" },
  Service: { tag: "kube_service", explorerPath: "service", metric: "container.cpu.usage" },
  Namespace: { tag: "kube_namespace", explorerPath: "namespace", metric: "container.cpu.usage" },
  Node: { tag: "kube_node", explorerPath: "node", metric: "container.cpu.usage" },
};

export const supportedKinds = Object.keys(kindMappings);

export const isSupportedKind = (kind: string) => Object.hasOwn(kindMappings, kind);

export interface DatadogResource {
  readonly kind: string;
  readonly name: string;
  readonly namespace?: string;
}

export type DatadogLinks = Record<DatadogView, string>;

/** The tags that pick out a resource in Datadog, cluster first. */
export const resourceTags = (resource: DatadogResource, clusterName: string | undefined): string[] => {
  const mapping = kindMappings[resource.kind];

  if (!mapping) {
    throw new Error(`Datadog has no tag for resources of kind ${resource.kind}`);
  }

  const tags = clusterName ? [`kube_cluster_name:${clusterName}`] : [];

  if (resource.kind === "Namespace") {
    return [...tags, `kube_namespace:${resource.name}`];
  }

  if (resource.namespace) {
    tags.push(`kube_namespace:${resource.namespace}`);
  }

  return [...tags, `${mapping.tag}:${resource.name}`];
};

/** The tag naming the resource itself, without the cluster or namespace around it. */
export const resourceTag = (resource: DatadogResource) => {
  const tags = resourceTags(resource, undefined);

  return tags[tags.length - 1];
};

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const buildDatadogLinks = (
  site: DatadogSite,
  resource: DatadogResource,
  clusterName: string | undefined,
): DatadogLinks => {
  const base = appBaseUrl(site);
  const mapping = kindMappings[resource.kind];
  const tags = resourceTags(resource, clusterName);
  const search = tags.join(" ");

  return {
    logs: `${base}/logs?${query({ query: search })}`,
    apm: `${base}/apm/traces?${query({ query: search })}`,
    metrics: `${base}/metric/explorer?${query({ exp_metric: mapping.metric, exp_scope: tags.join(","), exp_agg: "avg" })}`,
    explorer: `${base}/orchestration/explorer/${mapping.explorerPath}?${query({ query: search })}`,
    events: `${base}/event/explorer?${query({ query: search })}`,
  };
};

export const buildClusterOverviewLink = (site: DatadogSite, clusterName: string | undefined) =>
  `${appBaseUrl(site)}/orchestration/explorer/pod?${query({ query: clusterName ? `kube_cluster_name:${clusterName}` : "" })}`;

export const buildMonitorLink = (site: DatadogSite, monitorId: number) => `${appBaseUrl(site)}/monitors/${monitorId}`;
