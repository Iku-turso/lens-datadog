import { getAskAiFunctionInjectableBunch, getAskAiFunctionKind } from "@k8slens/ask-ai-contracts";
import { resolveDatadogClusterNameInjectable } from "./cluster-name.injectable";
import { type DatadogEvent, type DatadogMonitor, explainFailure, queryMetricInjectable, searchEventsInjectable, searchMonitorsInjectable } from "./datadog-data.injectable";
import { buildMonitorLink, isSupportedKind, supportedKinds } from "./datadog-links";
import {
  type DatadogScope,
  eventExplorerLink,
  eventQuery,
  isRangeId,
  type MetricId,
  metricDefinition,
  metricDefinitions,
  metricExplorerLink,
  metricQuery,
  ranges,
  type RangeId,
} from "./datadog-queries";
import { findMonitorGroupsInjectable } from "./monitor-groups.injectable";
import { getDatadogSettingsInjectable } from "./settings.injectable";

interface ScopeInput {
  readonly clusterId: string;
  readonly kind?: string;
  readonly name?: string;
  readonly namespace?: string;
}

const rangeIds = ranges.map((it) => it.id).join(", ");

const scopeInputDescription = `\`clusterId\` (string): the Lens cluster id. \`kind\` (string, optional): a Kubernetes kind, one of ${supportedKinds.join(", ")}, with \`name\` (string): the resource's name; leave both out for the whole cluster or namespace. \`namespace\` (string, optional): the namespace of the resource, or the namespace to narrow the cluster to.`;

const checkRange = (range: string | undefined): RangeId => {
  if (range === undefined) return "1h";
  if (!isRangeId(range)) throw new Error(`Unknown range ${range}; use one of ${rangeIds}.`);

  return range;
};

/** Validates the input and resolves the cluster's Datadog name into a scope. */
const toScope = async (input: ScopeInput, resolveClusterName: (clusterId: string) => Promise<{ name: string | null }>): Promise<DatadogScope> => {
  if (input.kind && !isSupportedKind(input.kind)) {
    throw new Error(`The Datadog extension does not support kind ${input.kind}; it supports ${supportedKinds.join(", ")}.`);
  }

  if (!!input.kind !== !!input.name) {
    throw new Error("Give `kind` and `name` together, or neither for the whole cluster.");
  }

  const clusterName = (await resolveClusterName(input.clusterId)).name ?? undefined;

  return input.kind && input.name
    ? { clusterName, resource: { kind: input.kind, name: input.name, namespace: input.namespace } }
    : { clusterName, namespace: input.namespace };
};

/** At most this many points per series, so a week of data stays a readable answer. */
const maxPoints = 60;

const downsample = (points: readonly (readonly [number, number])[]) => {
  if (points.length <= maxPoints) return points;

  const bucket = Math.ceil(points.length / maxPoints);
  const result: [number, number][] = [];

  for (let i = 0; i < points.length; i += bucket) {
    const slice = points.slice(i, i + bucket);

    result.push([slice[0][0], slice.reduce((sum, [, value]) => sum + value, 0) / slice.length]);
  }

  return result;
};

// --- Metrics -------------------------------------------------------------------------------

export const datadogMetricsFunctionKind = getAskAiFunctionKind<
  ScopeInput & { readonly metric: MetricId; readonly range?: RangeId },
  {
    query: string;
    unit: string;
    link: string;
    series: { scope: string; latest: number | null; max: number | null; points: [string, number][] }[];
  }
>()("datadog-metrics");

export const datadogMetricsFunction = getAskAiFunctionInjectableBunch({
  kind: datadogMetricsFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Reads a Kubernetes metric from Datadog over a time range: CPU, memory, network in or out, or container restarts, of one resource, a namespace or a whole cluster. Use it to answer how much a workload uses, whether it spiked and when; for alerting state use datadog-monitors, for what happened use datadog-events.",
  inputDescription: `${scopeInputDescription} \`metric\` (string): one of ${metricDefinitions.map((it) => `${it.id} (${it.label})`).join(", ")}. \`range\` (string, optional): how far back from now, one of ${rangeIds}; 1h when left out.`,
  outputDescription:
    "`query` (string): the Datadog query run. `unit` (string): cores, bytes, bytes/s or count. `link` (string): the same chart in Datadog's metrics explorer. `series` (array): one per group Datadog returned, each with `scope` (string), `latest` and `max` (numbers or null) and `points` (array of [ISO 8601 timestamp, value], at most 60, averaged when downsampled).",
  invoke: {
    instantiate: (di) => {
      const queryMetric = di.inject(queryMetricInjectable)();
      const resolveClusterName = di.inject(resolveDatadogClusterNameInjectable)();
      const getSettings = di.inject(getDatadogSettingsInjectable)();

      return () => async (input) => {
        const definition = metricDefinition(input.metric);
        const rangeId = checkRange(input.range);
        const scope = await toScope(input, resolveClusterName);
        const query = metricQuery(definition, scope);
        const { site } = await getSettings();

        try {
          const series = await queryMetric(definition.id, query, rangeId);

          return {
            query,
            unit: definition.unit,
            link: metricExplorerLink(site, definition, scope, rangeId),
            series: series.map(({ scope: seriesScope, points }) => {
              const values = points.map(([, value]) => value);

              return {
                scope: seriesScope,
                latest: values.length ? values[values.length - 1] : null,
                max: values.length ? Math.max(...values) : null,
                points: downsample(points).map(([at, value]): [string, number] => [new Date(at).toISOString(), Number(value.toPrecision(4))]),
              };
            }),
          };
        } catch (error) {
          throw new Error(explainFailure(error, "timeseries_query"));
        }
      };
    },
  },
});

// --- Monitors ------------------------------------------------------------------------------

export const datadogMonitorsFunctionKind = getAskAiFunctionKind<
  ScopeInput,
  { monitors: (Pick<DatadogMonitor, "name" | "status" | "type" | "query" | "lastTriggered"> & { group: string | null; link: string })[] }
>()("datadog-monitors");

export const datadogMonitorsFunction = getAskAiFunctionInjectableBunch({
  kind: datadogMonitorsFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Lists Datadog monitors with their alerting status: for one resource, the monitor groups that are that resource; for a cluster, every monitor of the Datadog account. Use it to answer whether something is alerting or what watches it; for metric values use datadog-metrics.",
  inputDescription: scopeInputDescription,
  outputDescription:
    "`monitors` (array), worst status first: `name` (string), `status` (Alert, Warn, No Data, OK, ...), `type` (string, empty for a resource's group), `query` (string or null), `lastTriggered` (ISO 8601 or null), `group` (string or null: the group that is the resource, such as kube_deployment:web) and `link` (string: the monitor in Datadog).",
  invoke: {
    instantiate: (di) => {
      const searchMonitors = di.inject(searchMonitorsInjectable)();
      const findMonitorGroups = di.inject(findMonitorGroupsInjectable)();
      const getSettings = di.inject(getDatadogSettingsInjectable)();

      return () => async (input) => {
        const { site } = await getSettings();

        try {
          if (input.kind && input.name) {
            if (!isSupportedKind(input.kind)) throw new Error(`Unsupported kind ${input.kind}; use one of ${supportedKinds.join(", ")}.`);

            const groups = await findMonitorGroups(input.clusterId, input.kind, input.name, input.namespace);

            return {
              monitors: groups.map((group) => ({
                name: group.monitorName,
                status: group.status,
                type: "",
                query: null,
                lastTriggered: group.lastTriggered,
                group: group.group,
                link: buildMonitorLink(site, group.monitorId),
              })),
            };
          }

          const monitors = await searchMonitors();

          return {
            monitors: monitors.map((monitor) => ({
              name: monitor.name,
              status: monitor.status,
              type: monitor.type,
              query: monitor.query,
              lastTriggered: monitor.lastTriggered,
              group: null,
              link: buildMonitorLink(site, monitor.id),
            })),
          };
        } catch (error) {
          throw new Error(explainFailure(error, "monitors_read"));
        }
      };
    },
  },
});

// --- Events --------------------------------------------------------------------------------

export const datadogEventsFunctionKind = getAskAiFunctionKind<
  ScopeInput & { readonly range?: RangeId },
  { query: string; link: string; events: (Pick<DatadogEvent, "timestamp" | "title" | "status" | "source"> & { message: string; link: string })[] }
>()("datadog-events");

export const datadogEventsFunction = getAskAiFunctionInjectableBunch({
  kind: datadogEventsFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Lists recent Datadog events of one resource, a namespace or a whole cluster: Kubernetes events, Agent events, deploys and alerts, newest first. Use it to answer what happened to something and when; for alerting state use datadog-monitors.",
  inputDescription: `${scopeInputDescription} \`range\` (string, optional): how far back from now, one of ${rangeIds}; 1h when left out.`,
  outputDescription:
    "`query` (string): the Datadog event query. `link` (string): the same search in Datadog's event explorer. `events` (array, at most 50, newest first): `timestamp` (ISO 8601), `title`, `status` (info, warning, error, success), `source` (string or null), `message` (string, at most 500 characters) and `link` (string: the event in Datadog).",
  invoke: {
    instantiate: (di) => {
      const searchEvents = di.inject(searchEventsInjectable)();
      const resolveClusterName = di.inject(resolveDatadogClusterNameInjectable)();
      const getSettings = di.inject(getDatadogSettingsInjectable)();

      return () => async (input) => {
        const rangeId = checkRange(input.range);
        const scope = await toScope(input, resolveClusterName);
        const query = eventQuery(scope);
        const { site } = await getSettings();

        try {
          const events = await searchEvents(query, rangeId);

          return {
            query,
            link: eventExplorerLink(site, scope, rangeId),
            events: events.map((event) => ({
              timestamp: event.timestamp,
              title: event.title,
              status: event.status,
              source: event.source,
              message: event.message.slice(0, 500),
              link: eventExplorerLink(site, scope, rangeId, event.id),
            })),
          };
        } catch (error) {
          throw new Error(explainFailure(error, "events_read"));
        }
      };
    },
  },
});
