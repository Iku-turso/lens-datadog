import { openLinkInBrowserInjectionToken } from "@k8slens/electron-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { resolveDatadogClusterNameInjectable } from "./cluster-name.injectable";
import { buildClusterOverviewLink } from "./datadog-links";
import { getDatadogSettingsInjectable } from "./settings.injectable";

export const openClusterOverviewInjectable = getInjectable2({
  id: "datadog-open-cluster-overview",
  consumptions: [openLinkInBrowserInjectionToken],
  instantiate: (di) => {
    const openLinkInBrowser = di.inject(openLinkInBrowserInjectionToken)();
    const getSettings = di.inject(getDatadogSettingsInjectable)();
    const resolveClusterName = di.inject(resolveDatadogClusterNameInjectable)();

    return () => async (clusterId: string | undefined) => {
      const { site } = await getSettings();
      const clusterName = clusterId ? (await resolveClusterName(clusterId)).name : null;

      await openLinkInBrowser(buildClusterOverviewLink(site, clusterName ?? undefined));
    };
  },
});
