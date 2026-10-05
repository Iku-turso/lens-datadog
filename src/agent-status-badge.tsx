import { Badge } from "@k8slens/badge";
import { useSubscribable } from "@k8slens/subscribable-react";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { use } from "react";
import { type DatadogAgentStatus } from "./agent-detection";
import { datadogAgentStatusBunch } from "./agent-status.injectable";

export const summarizeAgentStatus = (status: DatadogAgentStatus) => {
  if (!status.installed) {
    return { label: "Datadog: no Agent", healthy: false, tooltip: "No Datadog Agent was found in this cluster." };
  }

  const healthy = status.workloads.every((workload) => workload.ready >= workload.desired && workload.desired > 0);
  const agents = status.workloads.filter((workload) => workload.role === "agent");
  const ready = agents.reduce((sum, workload) => sum + workload.ready, 0);
  const desired = agents.reduce((sum, workload) => sum + workload.desired, 0);
  const tooltip = status.workloads
    .map((w) => `${w.role === "agent" ? "Agent" : "Cluster Agent"} ${w.namespace}/${w.name}${w.version ? ` ${w.version}` : ""}: ${w.ready}/${w.desired} ready`)
    .join("\n");

  return { label: `Datadog ${ready}/${desired}`, healthy, tooltip };
};

/** The Datadog Agent's health in a cluster, as a badge; suspends until known. */
export const AgentStatus = observer(({ clusterId, onClick, hint }: { clusterId: string; onClick?: () => void; hint?: string }) => {
  const { value } = useSubscribable(useSyncInject(datadogAgentStatusBunch.subscribable, clusterId));
  const summary = summarizeAgentStatus(use(value).get());

  return (
    <Badge
      small
      label={summary.label}
      $tooltip={hint ? `${summary.tooltip}\n${hint}` : summary.tooltip}
      $backgroundColor={summary.healthy ? "success" : "warning"}
      $color="white"
      {...(onClick ? { $onClick: onClick } : {})}
    />
  );
});
