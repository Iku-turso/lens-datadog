import { getInjectable2 } from "@k8slens/injectable";
import { getSubscribableInjectableBunch } from "@k8slens/subscribable";
import { detectDatadogAgentInjectable } from "./agent-status.injectable";
import { datadogClusterNamesBunch } from "./settings.injectable";

export interface ResolvedClusterName {
  readonly name: string | null;
  readonly source: "preferences" | "agent" | "unknown";
}

/**
 * The `kube_cluster_name` a Lens cluster has in Datadog: what the user set in the preferences,
 * else what the Datadog Agent in the cluster reports, else unknown.
 */
export const resolveDatadogClusterNameInjectable = getInjectable2({
  id: "datadog-resolve-cluster-name",
  instantiate: (di) => {
    const getClusterNames = di.inject(datadogClusterNamesBunch.persistable);
    const detect = di.inject(detectDatadogAgentInjectable)();

    return () =>
      async (clusterId: string): Promise<ResolvedClusterName> => {
        const configured = (await getClusterNames()).get(clusterId);

        if (configured) {
          return { name: configured, source: "preferences" };
        }

        try {
          const detected = (await detect(clusterId)).clusterName;

          if (detected) {
            return { name: detected, source: "agent" };
          }
        } catch {
          // The cluster could not be asked: links then simply carry no cluster filter.
        }

        return { name: null, source: "unknown" };
      };
  },
});

/** The cluster name the Datadog Agent reports, for rendering; null when there is none or it cannot be asked. */
export const detectedClusterNameBunch = getSubscribableInjectableBunch<string | null, [clusterId: string]>()({
  id: "detected-cluster-name",
  load: {
    instantiate: (di) => {
      const detect = di.inject(detectDatadogAgentInjectable)();

      return () => async (clusterId) => {
        try {
          return (await detect(clusterId)).clusterName;
        } catch {
          return null;
        }
      };
    },
  },
});
