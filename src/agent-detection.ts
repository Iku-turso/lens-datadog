export interface DatadogAgentWorkload {
  readonly kind: "DaemonSet" | "Deployment";
  readonly role: "agent" | "cluster-agent";
  readonly name: string;
  readonly namespace: string;
  readonly ready: number;
  readonly desired: number;
  readonly version: string | null;
}

export interface DatadogAgentStatus {
  readonly installed: boolean;
  /** The `DD_CLUSTER_NAME` the Agent reports this cluster under, when it sets one directly. */
  readonly clusterName: string | null;
  readonly workloads: readonly DatadogAgentWorkload[];
}

interface Container {
  readonly image?: string;
  readonly env?: readonly { readonly name: string; readonly value?: string }[];
}

interface Workload {
  readonly kind: string;
  readonly metadata: { readonly name: string; readonly namespace: string };
  readonly spec?: { readonly replicas?: number; readonly template?: { readonly spec?: { readonly containers?: readonly Container[] } } };
  readonly status?: {
    readonly desiredNumberScheduled?: number;
    readonly numberReady?: number;
    readonly readyReplicas?: number;
  };
}

// gcr.io/datadoghq/agent:7.60.0, public.ecr.aws/datadog/cluster-agent:7.60.0, registry.datadoghq.com/agent:7.84.0,
// docker.io/datadog/agent ...: any registry, as long as the path names Datadog and ends in agent or cluster-agent.
const agentImage = /^(?=[^\s]*datadog)[^\s]*\/(agent|cluster-agent)(?::([^@\s]+))?(?:@\S+)?$/;

export const parseDatadogAgentStatus = (kubectlOutput: string): DatadogAgentStatus => {
  const { items } = JSON.parse(kubectlOutput) as { items: Workload[] };
  let clusterName: string | null = null;

  const workloads = items.flatMap((item): DatadogAgentWorkload[] => {
    const containers = item.spec?.template?.spec?.containers ?? [];
    const match = containers.map((container) => ({ container, match: container.image?.match(agentImage) })).find((it) => it.match);

    if (!match?.match || (item.kind !== "DaemonSet" && item.kind !== "Deployment")) {
      return [];
    }

    clusterName ??= containers.flatMap((container) => container.env ?? []).find((env) => env.name === "DD_CLUSTER_NAME")?.value ?? null;

    const isDaemonSet = item.kind === "DaemonSet";

    return [
      {
        kind: item.kind,
        role: match.match[1] === "cluster-agent" ? "cluster-agent" : "agent",
        name: item.metadata.name,
        namespace: item.metadata.namespace,
        ready: (isDaemonSet ? item.status?.numberReady : item.status?.readyReplicas) ?? 0,
        desired: (isDaemonSet ? item.status?.desiredNumberScheduled : item.spec?.replicas) ?? 0,
        version: match.match[2] ?? null,
      },
    ];
  });

  return { installed: workloads.length > 0, clusterName, workloads };
};
