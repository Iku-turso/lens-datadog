import { getInjectable2 } from "@k8slens/injectable";
import { runKubectlInjectionToken } from "@k8slens/kubectl-contracts";
import { getSubscribableInjectableBunch } from "@k8slens/subscribable";
import { type DatadogAgentStatus, parseDatadogAgentStatus } from "./agent-detection";

const cacheMs = 60_000;

/** Finds the Datadog Agent and Cluster Agent workloads of a cluster, by their images. */
export const detectDatadogAgentInjectable = getInjectable2({
  id: "datadog-detect-agent",
  consumptions: [runKubectlInjectionToken],
  instantiate: (di) => {
    const runKubectlFor = di.inject(runKubectlInjectionToken);
    const cache = new Map<string, { readonly at: number; readonly status: Promise<DatadogAgentStatus> }>();

    return () =>
      (clusterId: string, { fresh = false }: { fresh?: boolean } = {}) => {
        const cached = cache.get(clusterId);

        if (!fresh && cached && Date.now() - cached.at < cacheMs) {
          return cached.status;
        }

        const status = runKubectlFor(clusterId)(["get", "daemonsets,deployments", "--all-namespaces", "--output", "json"]).then(
          parseDatadogAgentStatus,
        );

        cache.set(clusterId, { at: Date.now(), status });
        status.catch(() => cache.delete(clusterId));

        return status;
      };
  },
});

export const datadogAgentStatusBunch = getSubscribableInjectableBunch<DatadogAgentStatus, [clusterId: string]>()({
  id: "agent-status",
  load: {
    instantiate: (di) => {
      const detect = di.inject(detectDatadogAgentInjectable)();

      return () => (clusterId) => detect(clusterId, { fresh: true });
    },
  },
});
