import { openLinkInBrowserInjectionToken } from "@k8slens/electron-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { resolveDatadogClusterNameInjectable } from "./cluster-name.injectable";
import { buildDatadogLinks, type DatadogResource, type DatadogView } from "./datadog-links";
import { getDatadogSettingsInjectable } from "./settings.injectable";

export const getDatadogLinksInjectable = getInjectable2({
  id: "datadog-get-links",
  instantiate: (di) => {
    const getSettings = di.inject(getDatadogSettingsInjectable)();
    const resolveClusterName = di.inject(resolveDatadogClusterNameInjectable)();

    return () => async (clusterId: string, resource: DatadogResource) => {
      const [{ site }, clusterName] = await Promise.all([getSettings(), resolveClusterName(clusterId)]);

      return { clusterName, links: buildDatadogLinks(site, resource, clusterName.name ?? undefined) };
    };
  },
});

export const openInDatadogInjectable = getInjectable2({
  id: "datadog-open-in-datadog",
  consumptions: [openLinkInBrowserInjectionToken, showErrorNotificationInjectionToken],
  instantiate: (di) => {
    const openLinkInBrowser = di.inject(openLinkInBrowserInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
    const getLinks = di.inject(getDatadogLinksInjectable)();

    return () => async (clusterId: string, resource: DatadogResource, view: DatadogView) => {
      try {
        const { links } = await getLinks(clusterId, resource);

        await openLinkInBrowser(links[view]);
      } catch (error) {
        showErrorNotification(`Could not open Datadog: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    };
  },
});

export const openUrlInBrowserInjectable = getInjectable2({
  id: "datadog-open-url",
  consumptions: [openLinkInBrowserInjectionToken],
  instantiate: (di) => {
    const openLinkInBrowser = di.inject(openLinkInBrowserInjectionToken)();

    return () => (url: string) => void openLinkInBrowser(url);
  },
});
