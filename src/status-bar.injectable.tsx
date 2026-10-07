import { getInjectable2 } from "@k8slens/injectable";
import { activeTabClusterIdReactiveInjectionToken } from "@k8slens/main-view-contracts";
import { statusBarItemInjectionToken } from "@k8slens/status-bar-contracts";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { Suspense } from "react";
import { AgentStatus } from "./agent-status-badge";
import { openDatadogTabInjectable } from "./datadog-tab.injectable";
import { datadogTabInFrontInjectable } from "./datadog-tab-in-front.injectable";
import { DatadogErrorBoundary } from "./error-boundary";

const DatadogStatusBarItem = observer(() => {
  // A Datadog tab is about a cluster without being its tab, so fall back to the one in front.
  const datadogTabInFront = useInject(datadogTabInFrontInjectable)();
  const clusterId = useInject(activeTabClusterIdReactiveInjectionToken)().get() ?? datadogTabInFront.get();
  const openDatadogTab = useInject(openDatadogTabInjectable)();

  if (!clusterId) {
    return null;
  }

  return (
    <DatadogErrorBoundary key={clusterId} fallback={() => null}>
      <Suspense fallback={null}>
        <AgentStatus clusterId={clusterId} onClick={() => void openDatadogTab(clusterId)} hint="Click to open the cluster's Datadog view." />
      </Suspense>
    </DatadogErrorBoundary>
  );
});

export const datadogStatusBarItemInjectable = getInjectable2({
  id: "datadog-status-bar-item",
  instantiate: () => () => ({
    Component: DatadogStatusBarItem,
    position: "right" as const,
    orderNumber: 90,
  }),
  injectionToken: statusBarItemInjectionToken,
});
