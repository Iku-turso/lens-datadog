import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { activeTabClusterIdInjectionToken, activeTabClusterIdReactiveInjectionToken } from "@k8slens/main-view-contracts";
import { computed } from "mobx";
import { navigateToPreferencesInjectionToken } from "@k8slens/preferences-contracts";
import packageJson from "../package.json";
import { openClusterOverviewInjectable } from "./cluster-overview.injectable";
import { openDatadogTabInjectable } from "./datadog-tab.injectable";

export const openClusterInDatadogCommand = getCommandInjectableBunch({
  id: "datadog.open-cluster",
  title: "Datadog: Open cluster in Datadog",
  action: {
    consumptions: [activeTabClusterIdInjectionToken],
    instantiate: (di) => {
      const activeTabClusterId = di.inject(activeTabClusterIdInjectionToken)();
      const openClusterOverview = di.inject(openClusterOverviewInjectable)();

      return () => async () => openClusterOverview(await activeTabClusterId());
    },
  },
});

export const openDatadogPreferencesCommand = getCommandInjectableBunch({
  id: "datadog.open-preferences",
  title: "Datadog: Open preferences",
  action: {
    consumptions: [navigateToPreferencesInjectionToken],
    instantiate: (di) => {
      const navigateToPreferences = di.inject(navigateToPreferencesInjectionToken)();

      return () => () => navigateToPreferences({ pageId: packageJson.name });
    },
  },
});

export const openDatadogViewCommand = getCommandInjectableBunch({
  id: "datadog.open-view",
  title: "Datadog: Open Datadog view of cluster",
  isActive: {
    consumptions: [activeTabClusterIdReactiveInjectionToken],
    instantiate: (di) => {
      const activeTabClusterId = di.inject(activeTabClusterIdReactiveInjectionToken)();

      return () => computed(() => !!activeTabClusterId.get());
    },
  },
  action: {
    consumptions: [activeTabClusterIdInjectionToken],
    instantiate: (di) => {
      const activeTabClusterId = di.inject(activeTabClusterIdInjectionToken)();
      const openDatadogTab = di.inject(openDatadogTabInjectable)();

      return () => async () => {
        const clusterId = await activeTabClusterId();

        if (clusterId) await openDatadogTab(clusterId);
      };
    },
  },
});
