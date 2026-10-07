import { getInjectable2 } from "@k8slens/injectable";
import { getSubscribableInjectableBunch } from "@k8slens/subscribable";
import { DatadogApiError, datadogApiRequestInjectable } from "./datadog-api.injectable";
import { type MetricId, metricDefinition, rangeWindow, type RangeId } from "./datadog-queries";
import { getDatadogSettingsInjectable } from "./settings.injectable";

export type Loaded<T> =
  | { readonly state: "not-configured" }
  | { readonly state: "loaded"; readonly value: T }
  | { readonly state: "failed"; readonly message: string };

/** Turns a failed request into what the user can do about it, naming the scope a 403 is missing. */
export const explainFailure = (error: unknown, scope: string): string => {
  if (error instanceof DatadogApiError && error.status === 403) {
    return `Your Datadog application key lacks the ${scope} scope. Create one with it and set it in Preferences.`;
  }

  return error instanceof Error ? error.message : String(error);
};

const loadWith =
  <T>(getSettings: () => Promise<{ apiKey: string; applicationKey: string }>, scope: string, load: () => Promise<T>) =>
  async (): Promise<Loaded<T>> => {
    const { apiKey, applicationKey } = await getSettings();

    if (!apiKey || !applicationKey) return { state: "not-configured" };

    try {
      return { state: "loaded", value: await load() };
    } catch (error) {
      return { state: "failed", message: explainFailure(error, scope) };
    }
  };

// --- Metrics -------------------------------------------------------------------------------

export interface MetricSeries {
  /** What the series is of, as Datadog groups it. */
  readonly scope: string;
  /** [epoch milliseconds, value in the metric's unit], nulls left out. */
  readonly points: readonly (readonly [number, number])[];
}

interface MetricQueryResponse {
  readonly series?: readonly { readonly scope: string; readonly pointlist: readonly (readonly [number, number | null])[] }[];
}

export const queryMetricInjectable = getInjectable2({
  id: "datadog-query-metric",
  instantiate: (di) => {
    const request = di.inject(datadogApiRequestInjectable)();

    return () =>
      async (metricId: MetricId, query: string, rangeId: RangeId): Promise<MetricSeries[]> => {
        const { scale } = metricDefinition(metricId);
        const { from, to } = rangeWindow(rangeId);
        const response = await request<MetricQueryResponse>("/api/v1/query", {
          from: String(Math.floor(from / 1000)),
          to: String(Math.floor(to / 1000)),
          query,
        });

        return (response.series ?? []).map((series) => ({
          scope: series.scope,
          points: series.pointlist.flatMap(([at, value]) => (value === null ? [] : [[at, value * scale] as const])),
        }));
      };
  },
});

export const metricSeriesBunch = getSubscribableInjectableBunch<Loaded<MetricSeries[]>, [metricId: MetricId, query: string, rangeId: RangeId]>()({
  id: "metric-series",
  load: {
    instantiate: (di) => {
      const getSettings = di.inject(getDatadogSettingsInjectable)();
      const queryMetric = di.inject(queryMetricInjectable)();

      return () => (metricId, query, rangeId) => loadWith(getSettings, "timeseries_query", () => queryMetric(metricId, query, rangeId))();
    },
  },
});

// --- Events --------------------------------------------------------------------------------

export interface DatadogEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly title: string;
  readonly message: string;
  readonly status: string;
  readonly source: string | null;
}

interface EventsResponse {
  readonly data?: readonly {
    readonly id: string;
    readonly attributes?: {
      readonly timestamp?: string;
      readonly message?: string;
      readonly tags?: readonly string[];
      readonly attributes?: {
        readonly title?: string;
        readonly status?: string;
        readonly timestamp?: number;
        readonly source_type_name?: string;
        readonly _dd?: { readonly source_type_name?: string };
      };
    };
  }[];
}

export const searchEventsInjectable = getInjectable2({
  id: "datadog-search-events",
  instantiate: (di) => {
    const request = di.inject(datadogApiRequestInjectable)();

    return () =>
      async (query: string, rangeId: RangeId, limit = 50): Promise<DatadogEvent[]> => {
        const { from, to } = rangeWindow(rangeId);
        const response = await request<EventsResponse>("/api/v2/events", {
          "filter[query]": query || "*",
          "filter[from]": String(from),
          "filter[to]": String(to),
          sort: "-timestamp",
          "page[limit]": String(limit),
        });

        return (response.data ?? []).map((event) => {
          const attributes = event.attributes ?? {};
          const inner = attributes.attributes ?? {};
          const message = (attributes.message ?? "").replace(/^%%%\s*|\s*%%%$/g, "").trim();

          return {
            id: event.id,
            timestamp: attributes.timestamp ?? (inner.timestamp ? new Date(inner.timestamp).toISOString() : ""),
            title: inner.title || message.split("\n")[0] || "(untitled event)",
            message,
            status: inner.status ?? "info",
            // Where the event came from: Kubernetes, Monitor Alert, Docker and so on.
            source:
              inner._dd?.source_type_name ??
              inner.source_type_name ??
              attributes.tags?.find((tag) => tag.startsWith("source:"))?.slice("source:".length) ??
              null,
          };
        });
      };
  },
});

export const eventsBunch = getSubscribableInjectableBunch<Loaded<DatadogEvent[]>, [query: string, rangeId: RangeId]>()({
  id: "events",
  load: {
    instantiate: (di) => {
      const getSettings = di.inject(getDatadogSettingsInjectable)();
      const searchEvents = di.inject(searchEventsInjectable)();

      return () => (query, rangeId) => loadWith(getSettings, "events_read", () => searchEvents(query, rangeId))();
    },
  },
});

// --- Monitors of the whole account ---------------------------------------------------------

export interface DatadogMonitor {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly type: string;
  readonly query: string | null;
  readonly tags: readonly string[];
  readonly lastTriggered: string | null;
}

interface MonitorSearchResponse {
  readonly monitors?: readonly {
    readonly id: number;
    readonly name: string;
    readonly status: string;
    readonly type: string;
    readonly query?: string;
    readonly tags?: readonly string[];
    readonly last_triggered_ts?: number | null;
  }[];
}

const severity: Record<string, number> = { Alert: 0, Warn: 1, "No Data": 2, Unknown: 3, OK: 4 };

export const searchMonitorsInjectable = getInjectable2({
  id: "datadog-search-monitors",
  instantiate: (di) => {
    const request = di.inject(datadogApiRequestInjectable)();

    return () =>
      async (query = ""): Promise<DatadogMonitor[]> => {
        const response = await request<MonitorSearchResponse>("/api/v1/monitor/search", {
          ...(query ? { query } : {}),
          per_page: "100",
        });

        return (response.monitors ?? [])
          .map((monitor) => ({
            id: monitor.id,
            name: monitor.name,
            status: monitor.status,
            type: monitor.type,
            query: monitor.query ?? null,
            tags: monitor.tags ?? [],
            lastTriggered: monitor.last_triggered_ts ? new Date(monitor.last_triggered_ts * 1000).toISOString() : null,
          }))
          .sort((a, b) => (severity[a.status] ?? 9) - (severity[b.status] ?? 9) || a.name.localeCompare(b.name));
      };
  },
});

export const monitorsBunch = getSubscribableInjectableBunch<Loaded<DatadogMonitor[]>, [query: string]>()({
  id: "monitors",
  load: {
    instantiate: (di) => {
      const getSettings = di.inject(getDatadogSettingsInjectable)();
      const searchMonitors = di.inject(searchMonitorsInjectable)();

      return () => (query) => loadWith(getSettings, "monitors_read", () => searchMonitors(query))();
    },
  },
});
