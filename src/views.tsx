import { Badge } from "@k8slens/badge";
import { ClickableDiv, Div, Span, Svg } from "@k8slens/element-components";
import { PlainButton } from "@k8slens/input-components";
import { navigateToPreferencesInjectionToken } from "@k8slens/preferences-contracts";
import { useSubscribable } from "@k8slens/subscribable-react";
import { LightWeightTabs } from "@k8slens/tabs-components";
import { useInject, useSyncInject } from "@k8slens/use-inject";
import { action, type IObservableValue } from "mobx";
import { observer } from "mobx-react";
import { type ReactNode, Suspense, use, useEffect } from "react";
import packageJson from "../package.json";
import { type Loaded, metricSeriesBunch, monitorsBunch } from "./datadog-data.injectable";
import { type DatadogScope, formatValue, type MetricDefinition, metricExplorerLink, metricQuery, ranges, type RangeId } from "./datadog-queries";
import { DatadogErrorBoundary } from "./error-boundary";
import { openUrlInBrowserInjectable } from "./open-in-datadog.injectable";
import { datadogSettingsBunch } from "./settings.injectable";

const refreshEveryMs = 60_000;

const statusColors: Record<string, "critical" | "warning" | "success" | "grey40"> = {
  // Monitors
  Alert: "critical",
  Warn: "warning",
  OK: "success",
  // Events
  error: "critical",
  warn: "warning",
  warning: "warning",
  ok: "success",
  success: "success",
};

/** The badge colour of a monitor's or an event's status; anything else, info included, is neutral. */
export const statusColor = (status: string) => statusColors[status] ?? "grey40";

/** A heading inside a view, sized and weighted like Lens's own section titles. */
export const SectionTitle = ({ children }: { children: ReactNode }) => <Span $font={{ size: "l", bold: true }}>{children}</Span>;

export const Muted = ({ children }: { children: ReactNode }) => <Span $color="textMuted">{children}</Span>;

/** Suspense and an error boundary sized to one piece of a view, so one failure stays in its piece. */
export const Piece = ({ children, loading = "Loading…" }: { children: ReactNode; loading?: string }) => (
  <DatadogErrorBoundary fallback={(error) => <Span $color="critical">{error.message}</Span>}>
    <Suspense fallback={<Muted>{loading}</Muted>}>{children}</Suspense>
  </DatadogErrorBoundary>
);

const useSite = () => use(useSyncInject(datadogSettingsBunch.persistable)).get().site;

const useRefreshing = (refresh: () => void) =>
  useEffect(() => {
    const timer = setInterval(refresh, refreshEveryMs);

    return () => clearInterval(timer);
  }, [refresh]);

const NotConfigured = () => {
  const navigateToPreferences = useInject(navigateToPreferencesInjectionToken)();

  return <PlainButton $onClick={() => navigateToPreferences({ pageId: packageJson.name })}>Add Datadog API keys in Preferences</PlainButton>;
};

/** Renders a Loaded<T> the same way everywhere: the keys missing, the failure, or the value. */
const LoadedView = <T,>({ loaded, children }: { loaded: Loaded<T>; children: (value: T) => ReactNode }) => {
  if (loaded.state === "not-configured") return <NotConfigured />;
  if (loaded.state === "failed") return <Span $color="critical">{loaded.message}</Span>;

  return <>{children(loaded.value)}</>;
};

export const RangeSelector = observer(({ range }: { range: IObservableValue<RangeId> }) => (
  <LightWeightTabs
    tabs={ranges.map(({ id, label }) => ({ id, label }))}
    selected={range.get()}
    onSelect={(id) => id && action(() => range.set(id))()}
  />
));

// --- Charts --------------------------------------------------------------------------------

const chartWidth = 300;
const chartHeight = 60;

const Sparkline = ({ points }: { points: readonly (readonly [number, number])[] }) => {
  const xs = points.map(([at]) => at);
  const ys = points.map(([, value]) => value);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const maxY = Math.max(...ys, 0) || 1;
  const x = (at: number) => (maxX === minX ? chartWidth : ((at - minX) / (maxX - minX)) * chartWidth);
  const y = (value: number) => chartHeight - (value / maxY) * (chartHeight - 4) - 2;
  const line = points.map(([at, value]) => `${x(at).toFixed(1)},${y(value).toFixed(1)}`).join(" ");

  return (
    <Svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" width="100%" height={chartHeight} $color="primary">
      <polygon points={`0,${chartHeight} ${line} ${chartWidth},${chartHeight}`} fill="currentColor" fillOpacity={0.15} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </Svg>
  );
};

const sumSeries = (series: readonly { points: readonly (readonly [number, number])[] }[]) => {
  const byTime = new Map<number, number>();

  for (const { points } of series) for (const [at, value] of points) byTime.set(at, (byTime.get(at) ?? 0) + value);

  return [...byTime.entries()].sort(([a], [b]) => a - b);
};

const MetricChartBody = observer(({ definition, scope, rangeId }: { definition: MetricDefinition; scope: DatadogScope; rangeId: RangeId }) => {
  const site = useSite();
  const openUrl = useInject(openUrlInBrowserInjectable)();
  const { value, refresh } = useSubscribable(useSyncInject(metricSeriesBunch.subscribable, definition.id, metricQuery(definition, scope), rangeId));
  const loaded = use(value).get();
  const link = metricExplorerLink(site, definition, scope, rangeId);

  useRefreshing(refresh);

  return (
    <Div $flex={{ direction: "vertical", gap: "xs" }}>
      <ClickableDiv $onClick={() => openUrl(link)} $tooltip="Open in Datadog's metrics explorer" $color="link">
        {definition.label}
      </ClickableDiv>
      <LoadedView loaded={loaded}>
        {(series) => {
          const points = sumSeries(series);

          if (points.length === 0) return <Muted>No data in this range</Muted>;

          const values = points.map(([, v]) => v);

          return (
            <>
              <Sparkline points={points} />
              <Div $flex={{ direction: "horizontal", horizontalAlign: "space-between", wrap: true, gap: { column: "s" } }}>
                <Span $color="textMuted" $font={{ noWrap: true }}>
                  now {formatValue(values[values.length - 1], definition.unit)}
                </Span>
                <Span $color="textMuted" $font={{ noWrap: true }}>
                  max {formatValue(Math.max(...values), definition.unit)}
                </Span>
              </Div>
            </>
          );
        }}
      </LoadedView>
    </Div>
  );
});

export const MetricChart = (props: { definition: MetricDefinition; scope: DatadogScope; rangeId: RangeId }) => (
  <Div $padding="s" $border={{ color: "grey60", radius: "s" }}>
    <Piece loading={`Loading ${props.definition.label}…`}>
      <MetricChartBody {...props} />
    </Piece>
  </Div>
);

// --- Monitors ------------------------------------------------------------------------------

/** Counts of monitors by status, for an overview. */
export const MonitorSummary = observer(() => {
  const { value } = useSubscribable(useSyncInject(monitorsBunch.subscribable, ""));
  const loaded = use(value).get();

  return (
    <LoadedView loaded={loaded}>
      {(monitors) => {
        const counts = new Map<string, number>();

        for (const monitor of monitors) counts.set(monitor.status, (counts.get(monitor.status) ?? 0) + 1);

        return (
          <Div $flex={{ direction: "horizontal", gap: "s", wrap: true }}>
            {counts.size === 0 && <Muted>No monitors</Muted>}
            {[...counts.entries()].map(([status, count]) => (
              <Badge key={status} label={`${count} ${status}`} $backgroundColor={statusColor(status)} $color="white" />
            ))}
          </Div>
        );
      }}
    </LoadedView>
  );
});
