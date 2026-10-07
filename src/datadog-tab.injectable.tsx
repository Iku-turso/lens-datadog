import { AskAiTerminal } from "@k8slens/ask-ai-contracts";
import { clusterNameReactiveInjectionToken } from "@k8slens/cluster-contracts";
import { Div, Span } from "@k8slens/element-components";
import { getInjectable2 } from "@k8slens/injectable";
import { PlainButton } from "@k8slens/input-components";
import { runKubectlInjectionToken } from "@k8slens/kubectl-contracts";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { getSubscribableInjectableBunch } from "@k8slens/subscribable";
import { useSubscribable } from "@k8slens/subscribable-react";
import { focusTabInjectionToken, getTabKind, getTabKindInjectableBunch, openTabInjectionToken, tabIsOpenInjectionToken, type TabProps } from "@k8slens/tab-contracts";
import { LightWeightTabs } from "@k8slens/tabs-components";
import { useInject, useSyncInject } from "@k8slens/use-inject";
import { action } from "mobx";
import { observer } from "mobx-react";
import { Suspense, use, useEffect } from "react";
import { AgentStatus } from "./agent-status-badge";
import { openClusterOverviewInjectable } from "./cluster-overview.injectable";
import { DatadogIcon } from "./datadog-icon";
import { Dropdown } from "./dropdown.injectable";
import { type DatadogScope, eventQuery, metricDefinitions } from "./datadog-queries";
import { datadogSiteInjectable, eventsTableKind, monitorsTableKind } from "./datadog-tables.injectable";
import { eventExplorerLink, monitorsLink } from "./datadog-queries";
import { openUrlInBrowserInjectable } from "./open-in-datadog.injectable";
import { ClickableDiv } from "@k8slens/element-components";
import { Table } from "@k8slens/table-contracts";
import { DatadogErrorBoundary } from "./error-boundary";
import { useDatadogClusterName } from "./use-datadog-cluster-name";
import { type DatadogTabView, tabNamespaceInjectable, tabViewInjectable, viewRangeInjectable } from "./view-state.injectable";
import { datadogTabInFrontInjectable } from "./datadog-tab-in-front.injectable";
import { MetricChart, MonitorSummary, Muted, Piece, RangeSelector, SectionTitle } from "./views";

/** One Datadog tab per cluster; the tab id is the Lens cluster id. */
export const datadogTabKind = getTabKind()("datadog-cluster");

// --- Opening it ----------------------------------------------------------------------------

export const openDatadogTabInjectable = getInjectable2({
  id: "datadog-open-tab",
  consumptions: [openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken],
  instantiate: (di) => {
    const openTab = di.inject(openTabInjectionToken.for(mainViewTabHostKind).for(datadogTabKind).for(di.scopeIds))();
    const focusTab = di.inject(focusTabInjectionToken.for(mainViewTabHostKind).for(datadogTabKind).for(di.scopeIds))();
    const isOpen = di.inject(tabIsOpenInjectionToken.for(mainViewTabHostKind).for(datadogTabKind).for(di.scopeIds))();

    return () => async (clusterId: string) => {
      if (await isOpen({ tabId: clusterId })) {
        await focusTab({ tabId: clusterId });
      } else {
        await openTab({ tabId: clusterId });
      }
    };
  },
});

/** A component has no scope of its own, so the Ask AI terminal takes the extension's from here. */
export const ownScopeIdsInjectable = getInjectable2({
  id: "datadog-own-scope-ids",
  instantiate: (di) => () => di.scopeIds,
});

// --- Namespaces to narrow to ---------------------------------------------------------------

export const clusterNamespacesBunch = getSubscribableInjectableBunch<string[], [clusterId: string]>()({
  id: "cluster-namespaces",
  load: {
    consumptions: [runKubectlInjectionToken],
    instantiate: (di) => {
      const runKubectlFor = di.inject(runKubectlInjectionToken);

      return () => async (clusterId) => {
        const output = await runKubectlFor(clusterId)(["get", "namespaces", "--output", "jsonpath={.items[*].metadata.name}"]);

        return output.split(/\s+/).filter(Boolean).sort();
      };
    },
  },
});

const NamespacePicker = observer(({ tabId }: { tabId: string }) => {
  const namespace = useSyncInject(tabNamespaceInjectable, tabId);
  const { value } = useSubscribable(useSyncInject(clusterNamespacesBunch.subscribable, tabId));
  const namespaces = use(value).get();

  return (
    <Dropdown
      aria-label="Namespace"
      options={[{ id: "", label: "All namespaces" }, ...namespaces.map((name) => ({ id: name, label: name }))]}
      selected={namespace.get()}
      onSelect={(selected) => action(() => namespace.set(selected))()}
    />
  );
});

// --- The tab -------------------------------------------------------------------------------

/** A link to the same list on the Datadog website, above a table. */
const OpenInDatadog = observer(({ url, children }: { url: (site: Parameters<typeof monitorsLink>[0]) => string; children: string }) => {
  const site = useInject(datadogSiteInjectable)().get();
  const openUrl = useInject(openUrlInBrowserInjectable)();

  return (
    <ClickableDiv $onClick={() => openUrl(url(site))} $color="link" $flexChild="fixed">
      {children}
    </ClickableDiv>
  );
});

const views: readonly { id: DatadogTabView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "monitors", label: "Monitors" },
  { id: "events", label: "Events" },
  { id: "ask-ai", label: "Ask AI" },
];

const Overview = observer(({ tabId, scope }: { tabId: string; scope: DatadogScope }) => {
  const rangeId = useSyncInject(viewRangeInjectable, tabId).get();

  return (
    <Div $flex={{ direction: "vertical", gap: "l" }}>
      <Div $grid={{ columns: 3, gap: "m" }}>
        {metricDefinitions.map((definition) => (
          <MetricChart key={definition.id} definition={definition} scope={scope} rangeId={rangeId} />
        ))}
      </Div>
      <Div $flex={{ direction: "vertical", gap: "s" }}>
        <SectionTitle>Monitors</SectionTitle>
        <Piece>
          <MonitorSummary />
        </Piece>
      </Div>
      <Div $flex={{ direction: "vertical", gap: "s" }}>
        <SectionTitle>Recent events</SectionTitle>
        <Div style={{ height: "24rem" }}>
          <Table kind={eventsTableKind} params={[eventQuery(scope), rangeId]} />
        </Div>
      </Div>
    </Div>
  );
});

const AskAi = ({ clusterId, clusterName }: { clusterId: string; clusterName: string | null }) => {
  const scopeIds = useInject(ownScopeIdsInjectable)();

  return (
    <Div $height="full">
      <AskAiTerminal
        sessionId={`datadog.cluster-assistant.${clusterId}`}
        clusterId={clusterId}
        scopeIds={scopeIds}
        context={`The user is in the Datadog view of the Datadog extension for this cluster${clusterName ? `, which is called ${clusterName} in Datadog (kube_cluster_name)` : ""}. Answer from Datadog's metrics, monitors and events with the extension's functions, and give Datadog links for what you cite.`}
      />
    </Div>
  );
};

const DatadogTabContent = observer(({ tabId }: TabProps<typeof mainViewTabHostKind>) => {
  const clusterId = tabId;
  const clusterName = useDatadogClusterName(clusterId);
  const lensName = use(useSyncInject(clusterNameReactiveInjectionToken, clusterId)).get();
  const view = useSyncInject(tabViewInjectable, tabId);
  const range = useSyncInject(viewRangeInjectable, tabId);
  const namespace = useSyncInject(tabNamespaceInjectable, tabId).get();
  const openClusterOverview = useInject(openClusterOverviewInjectable)();
  const tabInFront = useInject(datadogTabInFrontInjectable)();

  useEffect(() => {
    action(() => tabInFront.set(clusterId))();

    return action(() => {
      if (tabInFront.get() === clusterId) tabInFront.set(undefined);
    });
  }, [clusterId, tabInFront]);

  const scope: DatadogScope = { clusterName: clusterName.name ?? undefined, namespace: namespace || undefined };

  return (
    <Div $flex={{ direction: "vertical", gap: "m" }} $padding="l" $height="full">
      <Div $flex={{ direction: "horizontal", gap: "m", verticalAlign: "center", wrap: true }}>
        <Span $font={{ size: "xxl", bold: true }}>Datadog · {lensName}</Span>
        <DatadogErrorBoundary fallback={() => null}>
          <Suspense fallback={null}>
            <AgentStatus clusterId={clusterId} />
          </Suspense>
        </DatadogErrorBoundary>
        <PlainButton $onClick={() => void openClusterOverview(clusterId)}>Open cluster in Datadog</PlainButton>
      </Div>
      <Muted>
        {clusterName.name
          ? `Datadog cluster: ${clusterName.name} (${clusterName.source === "agent" ? "reported by the Datadog Agent" : "set in Preferences"})`
          : "The cluster's name in Datadog is not known, so data of every cluster is shown. Set it in Preferences."}
      </Muted>
      <Div $flex={{ direction: "horizontal", gap: "l", verticalAlign: "center", wrap: true }}>
        <LightWeightTabs tabs={views} selected={view.get()} onSelect={(id) => id && action(() => view.set(id))()} />
        {view.get() !== "ask-ai" && view.get() !== "monitors" && (
          <>
            <Piece loading="Loading namespaces…">
              <NamespacePicker tabId={tabId} />
            </Piece>
            <RangeSelector range={range} />
          </>
        )}
      </Div>
      {view.get() === "overview" && (
        <Div $flexChild style={{ minHeight: 0 }} $overflow={{ y: "auto" }}>
          <Overview tabId={tabId} scope={scope} />
        </Div>
      )}
      {view.get() === "monitors" && <OpenInDatadog url={monitorsLink}>Manage monitors in Datadog →</OpenInDatadog>}
      {view.get() === "monitors" && (
        <Div $flexChild style={{ minHeight: 0 }}>
          <Table kind={monitorsTableKind} params={[]} />
        </Div>
      )}
      {view.get() === "events" && (
        <OpenInDatadog url={(site) => eventExplorerLink(site, scope, range.get())}>Open in Datadog's event explorer →</OpenInDatadog>
      )}
      {view.get() === "events" && (
        <Div $flexChild style={{ minHeight: 0 }}>
          <Table kind={eventsTableKind} params={[eventQuery(scope), range.get()]} />
        </Div>
      )}
      {view.get() === "ask-ai" && (
        <Div $flexChild style={{ minHeight: 0 }}>
          <AskAi clusterId={clusterId} clusterName={clusterName.name} />
        </Div>
      )}
    </Div>
  );
});

const DatadogTab = (props: TabProps<typeof mainViewTabHostKind>) => (
  <DatadogErrorBoundary fallback={(error) => <Div $padding="l"><Span $color="critical">{error.message}</Span></Div>}>
    <Suspense fallback={<Div $padding="l"><Muted>Loading Datadog…</Muted></Div>}>
      <DatadogTabContent {...props} />
    </Suspense>
  </DatadogErrorBoundary>
);

const TitleName = observer(({ clusterId }: { clusterId: string }) => (
  <>{use(useSyncInject(clusterNameReactiveInjectionToken, clusterId)).get()}</>
));

const DatadogTabTitle = ({ tabId }: TabProps<typeof mainViewTabHostKind>) => (
  <Div $flex={{ direction: "horizontal", gap: "xs", verticalAlign: "center" }}>
    <DatadogIcon $size="s" />
    <Span>
      Datadog:{" "}
      <Suspense fallback="…">
        <TitleName clusterId={tabId} />
      </Suspense>
    </Span>
  </Div>
);

export const datadogTabKindBunch = getTabKindInjectableBunch({
  tabHostKind: mainViewTabHostKind,
  kind: datadogTabKind,
  Component: DatadogTab,
  Title: DatadogTabTitle,
});
