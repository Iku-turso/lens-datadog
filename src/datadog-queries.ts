import { appBaseUrl, type DatadogSite } from "./datadog-sites";
import { type DatadogResource, resourceTags } from "./datadog-links";

/** What a view shows Datadog data for: a whole cluster, one namespace of it, or one resource. */
export interface DatadogScope {
  readonly clusterName?: string;
  readonly namespace?: string;
  readonly resource?: DatadogResource;
}

export type RangeId = "1h" | "4h" | "1d" | "1w";

export const ranges: readonly { readonly id: RangeId; readonly label: string; readonly seconds: number }[] = [
  { id: "1h", label: "1h", seconds: 3600 },
  { id: "4h", label: "4h", seconds: 4 * 3600 },
  { id: "1d", label: "1d", seconds: 24 * 3600 },
  { id: "1w", label: "1w", seconds: 7 * 24 * 3600 },
];

export const isRangeId = (value: string): value is RangeId => ranges.some((range) => range.id === value);

export const rangeWindow = (rangeId: RangeId, now = Date.now()) => {
  const seconds = ranges.find((range) => range.id === rangeId)?.seconds ?? 3600;

  return { from: now - seconds * 1000, to: now };
};

export type MetricId = "cpu" | "memory" | "network_rx" | "network_tx" | "restarts";

export interface MetricDefinition {
  readonly id: MetricId;
  readonly label: string;
  readonly metric: string;
  readonly unit: "cores" | "bytes" | "bytes/s" | "count";
  /** Multiplies Datadog's values into `unit`. */
  readonly scale: number;
}

export const metricDefinitions: readonly MetricDefinition[] = [
  // The Agent's container check (Agent 7.35 and later), tagged by cluster, namespace, workload, pod and node.
  { id: "cpu", label: "CPU", metric: "container.cpu.usage", unit: "cores", scale: 1e-9 },
  { id: "memory", label: "Memory", metric: "container.memory.usage", unit: "bytes", scale: 1 },
  { id: "network_rx", label: "Network in", metric: "container.net.rcvd", unit: "bytes/s", scale: 1 },
  { id: "network_tx", label: "Network out", metric: "container.net.sent", unit: "bytes/s", scale: 1 },
  { id: "restarts", label: "Container restarts", metric: "kubernetes.containers.restarts", unit: "count", scale: 1 },
];

export const metricDefinition = (id: MetricId) => {
  const definition = metricDefinitions.find((it) => it.id === id);

  if (!definition) throw new Error(`Unknown metric ${id}; use one of ${metricDefinitions.map((it) => it.id).join(", ")}.`);

  return definition;
};

export const scopeTags = (scope: DatadogScope): string[] => {
  if (scope.resource) {
    return resourceTags(scope.resource, scope.clusterName);
  }

  return [
    ...(scope.clusterName ? [`kube_cluster_name:${scope.clusterName}`] : []),
    ...(scope.namespace ? [`kube_namespace:${scope.namespace}`] : []),
  ];
};

export const metricQuery = (definition: MetricDefinition, scope: DatadogScope) => {
  const tags = scopeTags(scope);

  return `sum:${definition.metric}{${tags.length ? tags.join(",") : "*"}}`;
};

/**
 * Events of a resource are tagged by its kind and name (kube_kind, kube_name) when Kubernetes
 * raised them, and by its workload tag when the Agent did, so either matches.
 */
export const eventQuery = (scope: DatadogScope) => {
  if (!scope.resource) {
    return scopeTags(scope).join(" ");
  }

  const tags = scopeTags(scope);
  const ownTag = tags.pop();
  const byName = `(kube_kind:${scope.resource.kind} kube_name:${scope.resource.name})`;

  return [...tags, `(${ownTag} OR ${byName})`].join(" ");
};

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const metricExplorerLink = (site: DatadogSite, definition: MetricDefinition, scope: DatadogScope, rangeId: RangeId) => {
  const { from, to } = rangeWindow(rangeId);
  const tags = scopeTags(scope);

  return `${appBaseUrl(site)}/metric/explorer?${query({
    exp_metric: definition.metric,
    exp_scope: tags.join(","),
    exp_agg: "sum",
    exp_row_type: "metric",
    from_ts: String(from),
    to_ts: String(to),
    live: "true",
  })}`;
};

export const eventExplorerLink = (site: DatadogSite, scope: DatadogScope, rangeId: RangeId, eventId?: string) => {
  const { from, to } = rangeWindow(rangeId);

  return `${appBaseUrl(site)}/event/explorer?${query({
    query: eventQuery(scope),
    from_ts: String(from),
    to_ts: String(to),
    live: "true",
    ...(eventId ? { event: eventId } : {}),
  })}`;
};

export const monitorsLink = (site: DatadogSite) => `${appBaseUrl(site)}/monitors/manage`;

export const formatValue = (value: number, unit: MetricDefinition["unit"]) => {
  if (unit === "bytes" || unit === "bytes/s") {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let scaled = value;
    let index = 0;

    while (Math.abs(scaled) >= 1024 && index < units.length - 1) {
      scaled /= 1024;
      index++;
    }

    return `${scaled.toFixed(scaled >= 100 || index === 0 ? 0 : 1)} ${units[index]}${unit === "bytes/s" ? "/s" : ""}`;
  }

  if (unit === "cores") {
    return value < 1 ? `${Math.round(value * 1000)}m` : `${value.toFixed(2)} cores`;
  }

  return `${Math.round(value)}`;
};
