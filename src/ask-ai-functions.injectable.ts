import { getAskAiFunctionInjectableBunch, getAskAiFunctionKind } from "@k8slens/ask-ai-contracts";
import type { DatadogAgentStatus } from "./agent-detection";
import { detectDatadogAgentInjectable } from "./agent-status.injectable";
import { resolveDatadogClusterNameInjectable } from "./cluster-name.injectable";
import { type DatadogLinks, type DatadogView, datadogViews, isSupportedKind, supportedKinds } from "./datadog-links";
import { getDatadogLinksInjectable, openInDatadogInjectable } from "./open-in-datadog.injectable";

interface ResourceInput {
  readonly clusterId: string;
  readonly kind: string;
  readonly name: string;
  readonly namespace?: string;
}

const resourceInputDescription = `\`clusterId\` (string): the Lens cluster id. \`kind\` (string): the Kubernetes kind, one of ${supportedKinds.join(", ")}. \`name\` (string): the resource's name. \`namespace\` (string, optional): its namespace; leave it out for Node and Namespace.`;

const views = datadogViews.map((it) => it.view).join(", ");

const checkKind = (kind: string) => {
  if (!isSupportedKind(kind)) {
    throw new Error(`The Datadog extension has no links for kind ${kind}; it supports ${supportedKinds.join(", ")}.`);
  }
};

export const datadogLinksFunctionKind = getAskAiFunctionKind<
  ResourceInput,
  { clusterName: string | null; clusterNameSource: string; links: DatadogLinks }
>()("datadog-links");

export const datadogLinksFunction = getAskAiFunctionInjectableBunch({
  kind: datadogLinksFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Builds the Datadog web links (logs, APM traces, metrics, Kubernetes Explorer, events) for one Kubernetes resource, scoped by the Datadog tags of its cluster, namespace and name. Use it to give the user links to a resource's telemetry in Datadog; to open one in the browser instead, use open-in-datadog.",
  inputDescription: resourceInputDescription,
  outputDescription:
    "`clusterName` (string or null): the cluster's kube_cluster_name in Datadog, null when unknown, in which case the links search every cluster. `clusterNameSource` (string): \"preferences\", \"agent\" or \"unknown\". `links` (object): one https URL each under `logs`, `apm`, `metrics`, `explorer` and `events`.",
  invoke: {
    instantiate: (di) => {
      const getLinks = di.inject(getDatadogLinksInjectable)();

      return () =>
        async ({ clusterId, kind, name, namespace }) => {
          checkKind(kind);
          const { clusterName, links } = await getLinks(clusterId, { kind, name, namespace });

          return { clusterName: clusterName.name, clusterNameSource: clusterName.source, links };
        };
    },
  },
});

export const openInDatadogFunctionKind = getAskAiFunctionKind<ResourceInput & { readonly view: DatadogView }>()("open-in-datadog");

export const openInDatadogFunction = getAskAiFunctionInjectableBunch({
  kind: openInDatadogFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Opens the Datadog page of one Kubernetes resource in the user's browser: its logs, APM traces, metrics, Kubernetes Explorer entry or events. Use it when the user asks to see a resource in Datadog; to only hand them the links, use datadog-links.",
  inputDescription: `${resourceInputDescription} \`view\` (string): which page, one of ${views}.`,
  outputDescription: "Nothing. Resolves once the browser has been asked to open the page.",
  invoke: {
    instantiate: (di) => {
      const openInDatadog = di.inject(openInDatadogInjectable)();

      return () =>
        async ({ clusterId, kind, name, namespace, view }) => {
          checkKind(kind);

          if (!datadogViews.some((it) => it.view === view)) {
            throw new Error(`Unknown view ${view}; use one of ${views}.`);
          }

          await openInDatadog(clusterId, { kind, name, namespace }, view);
        };
    },
  },
});

export const datadogAgentStatusFunctionKind = getAskAiFunctionKind<
  { readonly clusterId: string },
  DatadogAgentStatus & { readonly datadogClusterName: string | null }
>()("datadog-agent-status");

export const datadogAgentStatusFunction = getAskAiFunctionInjectableBunch({
  kind: datadogAgentStatusFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Reports whether the Datadog Agent and the Datadog Cluster Agent are deployed in a cluster, found by their container images, with how many of their pods are ready and which version runs. Use it to answer whether a cluster is monitored by Datadog or why its data might be missing there.",
  inputDescription: "`clusterId` (string): the Lens cluster id.",
  outputDescription:
    "`installed` (boolean): whether any Datadog Agent workload was found. `workloads` (array): one per DaemonSet or Deployment, with `kind`, `role` (\"agent\" or \"cluster-agent\"), `name`, `namespace`, `ready` and `desired` (numbers of pods) and `version` (image tag, or null). `clusterName` (string or null): the DD_CLUSTER_NAME the Agent sets. `datadogClusterName` (string or null): the name the extension uses for the cluster in Datadog, the user's preference first.",
  invoke: {
    instantiate: (di) => {
      const detect = di.inject(detectDatadogAgentInjectable)();
      const resolveClusterName = di.inject(resolveDatadogClusterNameInjectable)();

      return () =>
        async ({ clusterId }) => {
          const status = await detect(clusterId, { fresh: true });

          return { ...status, datadogClusterName: (await resolveClusterName(clusterId)).name };
        };
    },
  },
});
