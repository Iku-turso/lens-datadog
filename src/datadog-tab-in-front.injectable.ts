import { getInjectable2 } from "@k8slens/injectable";
import { observable } from "mobx";

/**
 * The cluster whose Datadog tab is in front, or undefined. Lens renders only the selected tab, so the
 * tab sets this while mounted; the status bar falls back to it, since a Datadog tab is about a
 * cluster without being the cluster's own tab.
 */
export const datadogTabInFrontInjectable = getInjectable2({
  id: "datadog-tab-in-front",
  instantiate: () => {
    const clusterId = observable.box<string | undefined>(undefined);

    return () => clusterId;
  },
});
