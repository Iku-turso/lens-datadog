import { clusterNavigatorItemKind } from "@k8slens/cluster-contracts";
import { NavigatorItemIcon, NavigatorItemLabel, NavigatorLeafIndicator } from "@k8slens/navigator-components";
import { getNavigatorItemKind, getNavigatorItemKindInjectableBunch2 } from "@k8slens/navigator-contracts";
import { computed } from "mobx";
import { DatadogIcon } from "./datadog-icon";
import { openDatadogTabInjectable } from "./datadog-tab.injectable";

interface DatadogItem {
  readonly id: string;
  readonly name: string;
}

export const datadogNavigatorItemKind = getNavigatorItemKind<DatadogItem, [clusterId: string]>()("datadog");

const DatadogRow = () => (
  <>
    <NavigatorLeafIndicator />
    <NavigatorItemIcon>
      <DatadogIcon />
    </NavigatorItemIcon>
    <NavigatorItemLabel>Datadog</NavigatorItemLabel>
  </>
);

export const datadogNavigatorItemBunch = getNavigatorItemKindInjectableBunch2({
  kind: datadogNavigatorItemKind,
  parentKind: clusterNavigatorItemKind,
  description: "The cluster's Datadog view: metrics, monitors and events from Datadog.",
  items: {
    instantiate: () => async () => computed((): DatadogItem[] => [{ id: "datadog", name: "Datadog" }]),
  },
  activate: {
    instantiate: (di) => {
      const openDatadogTab = di.inject(openDatadogTabInjectable)();

      return (clusterId) => openDatadogTab(clusterId);
    },
  },
  Component: DatadogRow,
});
