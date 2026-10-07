
import { DrawerItem, DrawerSubTitle } from "@k8slens/details-panel-components";
import { buildDetailsPanelSectionBunch } from "@k8slens/details-panel-contracts";
import { Div, Span } from "@k8slens/element-components";
import { PlainButton } from "@k8slens/input-components";
import { appsV1, batchV1, coreV1, cronJobKind, daemonSetKind, deploymentKind, jobKind, namespaceKind, nodeKind, podKind, replicaSetKind, serviceKind, statefulSetKind } from "@k8slens/kubernetes-contracts";
import { navigateToPreferencesInjectionToken } from "@k8slens/preferences-contracts";
import { useInject, useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { use } from "react";
import packageJson from "../package.json";
import { buildDatadogLinks, datadogViews } from "./datadog-links";
import { type DatadogScope, eventQuery, metricDefinition } from "./datadog-queries";
import { openUrlInBrowserInjectable } from "./open-in-datadog.injectable";
import { datadogSettingsBunch } from "./settings.injectable";
import { useDatadogClusterName } from "./use-datadog-cluster-name";
import { viewRangeInjectable } from "./view-state.injectable";
import { MetricChart, Piece, RangeSelector } from "./views";
import { Table } from "@k8slens/table-contracts";
import { eventsTableKind, monitorGroupsTableKind } from "./datadog-tables.injectable";

interface SectionProps {
  readonly clusterId: string;
  readonly resource: { readonly kind: string; readonly metadata: { readonly name: string; readonly namespace?: string } };
}

interface ResourceProps {
  readonly clusterId: string;
  readonly kind: string;
  readonly name: string;
  readonly namespace?: string;
}

const chartedMetrics = [metricDefinition("cpu"), metricDefinition("memory")];

const Links = observer(({ clusterId, kind, name, namespace }: ResourceProps) => {
  const settings = use(useSyncInject(datadogSettingsBunch.persistable));
  const clusterName = useDatadogClusterName(clusterId);
  const openUrl = useInject(openUrlInBrowserInjectable)();
  const links = buildDatadogLinks(settings.get().site, { kind, name, namespace }, clusterName.name ?? undefined);

  return (
    <>
      <DrawerItem name="Open in Datadog">
        <Div $flex={{ direction: "horizontal", gap: "xs", wrap: true }}>
          {datadogViews.map(({ view, label }) => (
            <PlainButton key={view} $onClick={() => openUrl(links[view])} $tooltip={links[view]}>
              {label}
            </PlainButton>
          ))}
        </Div>
      </DrawerItem>
      <DrawerItem name="Datadog cluster">
        {clusterName.name ? (
          <Span>
            {clusterName.name}
            <Span $color="textMuted"> ({clusterName.source === "agent" ? "reported by the Datadog Agent" : "set in Preferences"})</Span>
          </Span>
        ) : (
          <Span $color="textMuted">Not known: links search every cluster. Set it in Preferences.</Span>
        )}
      </DrawerItem>
    </>
  );
});

const Telemetry = observer(({ clusterId, kind, name, namespace }: ResourceProps) => {
  const clusterName = useDatadogClusterName(clusterId);
  const range = useSyncInject(viewRangeInjectable, "details");
  const scope: DatadogScope = { clusterName: clusterName.name ?? undefined, resource: { kind, name, namespace } };

  return (
    <>
      <DrawerItem name="Time range">
        <RangeSelector range={range} />
      </DrawerItem>
      <DrawerItem name="Metrics">
        <Div $grid={{ columns: 2, gap: "s" }} $width="full">
          {chartedMetrics.map((definition) => (
            <MetricChart key={definition.id} definition={definition} scope={scope} rangeId={range.get()} />
          ))}
        </Div>
      </DrawerItem>
      <DrawerSubTitle>Events</DrawerSubTitle>
      <Div style={{ height: "14rem" }}>
        <Table kind={eventsTableKind} params={[eventQuery(scope), range.get()]} />
      </Div>
    </>
  );
});

const Monitors = observer(({ clusterId, kind, name, namespace }: ResourceProps) => {
  const settings = use(useSyncInject(datadogSettingsBunch.persistable)).get();
  const navigateToPreferences = useInject(navigateToPreferencesInjectionToken)();

  if (!settings.apiKey || !settings.applicationKey) {
    return (
      <DrawerItem name="Monitors">
        <PlainButton $onClick={() => navigateToPreferences({ pageId: packageJson.name })}>Add Datadog API keys to see monitors</PlainButton>
      </DrawerItem>
    );
  }

  return (
    <>
      <DrawerSubTitle>Monitors</DrawerSubTitle>
      <Div style={{ height: "9rem" }}>
        <Table kind={monitorGroupsTableKind} params={[clusterId, kind, name, namespace ?? ""]} />
      </Div>
    </>
  );
});

const DatadogSection = ({ clusterId, resource }: SectionProps) => {
  const props = { clusterId, kind: resource.kind, name: resource.metadata.name, namespace: resource.metadata.namespace };

  return (
    <>
      <Piece>
        <Links {...props} />
      </Piece>
      <Piece loading="Loading monitors…">
        <Monitors {...props} />
      </Piece>
      <Piece loading="Loading Datadog data…">
        <Telemetry {...props} />
      </Piece>
    </>
  );
};

const common = { id: "datadog", title: "Datadog", orderNumber: 35, Component: DatadogSection } as const;

export const podSection = buildDetailsPanelSectionBunch({ ...common, kind: podKind, apiVersion: coreV1 });
export const serviceSection = buildDetailsPanelSectionBunch({ ...common, kind: serviceKind, apiVersion: coreV1 });
export const namespaceSection = buildDetailsPanelSectionBunch({ ...common, kind: namespaceKind, apiVersion: coreV1 });
export const nodeSection = buildDetailsPanelSectionBunch({ ...common, kind: nodeKind, apiVersion: coreV1 });
export const deploymentSection = buildDetailsPanelSectionBunch({ ...common, kind: deploymentKind, apiVersion: appsV1 });
export const statefulSetSection = buildDetailsPanelSectionBunch({ ...common, kind: statefulSetKind, apiVersion: appsV1 });
export const daemonSetSection = buildDetailsPanelSectionBunch({ ...common, kind: daemonSetKind, apiVersion: appsV1 });
export const replicaSetSection = buildDetailsPanelSectionBunch({ ...common, kind: replicaSetKind, apiVersion: appsV1 });
export const jobSection = buildDetailsPanelSectionBunch({ ...common, kind: jobKind, apiVersion: batchV1 });
export const cronJobSection = buildDetailsPanelSectionBunch({ ...common, kind: cronJobKind, apiVersion: batchV1 });
