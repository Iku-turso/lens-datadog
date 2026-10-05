import { useSubscribable } from "@k8slens/subscribable-react";
import { useSyncInject } from "@k8slens/use-inject";
import { use } from "react";
import { detectedClusterNameBunch } from "./cluster-name.injectable";
import { datadogClusterNamesBunch } from "./settings.injectable";

/** The cluster's name in Datadog, as the preferences set it or the Agent reports it. Suspends until known. */
export const useDatadogClusterName = (clusterId: string) => {
  const configured = use(useSyncInject(datadogClusterNamesBunch.persistable)).get(clusterId);
  const { value } = useSubscribable(useSyncInject(detectedClusterNameBunch.subscribable, clusterId));
  const detected = use(value).get();

  if (configured) return { name: configured, source: "preferences" as const };
  if (detected) return { name: detected, source: "agent" as const };

  return { name: null, source: "unknown" as const };
};
