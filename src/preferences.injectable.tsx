import { allClusterRecordsReactiveInjectionToken, type ClusterRecord } from "@k8slens/cluster-contracts";
import { Div, Span } from "@k8slens/element-components";
import { PrimaryButton, type SelectOption, SingleSelect, TextInput } from "@k8slens/input-components";
import { getExtensionPreferencePageInjectableBunch } from "@k8slens/preferences-contracts";
import { useInject, useSyncInject } from "@k8slens/use-inject";
import { action, type IObservableValue, type ObservableMap } from "mobx";
import { observer } from "mobx-react";
import { type ReactNode, Suspense, use } from "react";
import packageJson from "../package.json";
import { connectionCheckStateInjectable, runConnectionCheckInjectable } from "./connection-check.injectable";
import { type DatadogSite, datadogSites } from "./datadog-sites";
import { datadogClusterNamesBunch, type DatadogSettings, datadogSettingsBunch } from "./settings.injectable";

const siteOptions: readonly SelectOption<DatadogSite>[] = Object.entries(datadogSites).map(([id, { label }]) => ({
  id: id as DatadogSite,
  label,
}));

// Synchronous, so that a controlled input keeps its caret where the user types.
const change = (settings: IObservableValue<DatadogSettings>, patch: Partial<DatadogSettings>) =>
  action(() => settings.set({ ...settings.get(), ...patch }))();

const Block = ({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) => (
  <Div $flex={{ direction: "vertical", gap: "s" }} $padding={{ bottom: "xl" }}>
    <Span $font={{ size: "l", bold: true }}>{title}</Span>
    <Span $color="textMuted">{description}</Span>
    {children}
  </Div>
);

const Loading = () => <Span $color="textMuted">Loading…</Span>;

const SiteSelect = observer(() => {
  const settings = use(useSyncInject(datadogSettingsBunch.persistable));

  return <SingleSelect options={siteOptions} selected={settings.get().site} onSelect={(site) => change(settings, { site })} />;
});

const SiteBlock = () => (
  <Block title="Datadog site" description="The Datadog site your organization uses. Links and API calls go there.">
    <Suspense fallback={<Loading />}>
      <SiteSelect />
    </Suspense>
  </Block>
);

const KeyInputs = observer(() => {
  const settings = use(useSyncInject(datadogSettingsBunch.persistable));
  const checkState = useInject(connectionCheckStateInjectable)().get();
  const runCheck = useInject(runConnectionCheckInjectable)();
  const { apiKey, applicationKey } = settings.get();

  return (
    <Div $flex={{ direction: "vertical", gap: "s" }}>
      <TextInput
        type="password"
        placeholder="API key"
        aria-label="Datadog API key"
        value={apiKey}
        onChange={(event) => change(settings, { apiKey: event.target.value.trim() })}
      />
      <TextInput
        type="password"
        placeholder="Application key"
        aria-label="Datadog application key"
        value={applicationKey}
        onChange={(event) => change(settings, { applicationKey: event.target.value.trim() })}
      />
      <Div $flex={{ direction: "horizontal", gap: "m", verticalAlign: "center" }}>
        <PrimaryButton $disabled={!apiKey || !applicationKey || checkState.state === "checking"} $onClick={() => void runCheck()}>
          Test connection
        </PrimaryButton>
        {checkState.state === "checking" && <Span $color="textMuted">Checking…</Span>}
        {checkState.state === "done" && <Span $color={checkState.ok ? "success" : "critical"}>{checkState.message}</Span>}
      </Div>
    </Div>
  );
});

const KeysBlock = () => (
  <Block
    title="API access"
    description="An API key and an application key let Lens show Datadog charts (timeseries_query scope), monitors (monitors_read) and events (events_read). The keys are stored in Lens's data directory on this machine, and requests are made with curl."
  >
    <Suspense fallback={<Loading />}>
      <KeyInputs />
    </Suspense>
  </Block>
);

const ClusterNameRow = observer(({ cluster, clusterNames }: { cluster: ClusterRecord; clusterNames: ObservableMap<string, string> }) => (
  <Div $flex={{ direction: "horizontal", gap: "m", verticalAlign: "center" }}>
    <Span $width="11xl">{cluster.name.get()}</Span>
    <TextInput
      placeholder="Detected from the Datadog Agent"
      aria-label={`Datadog cluster name of ${cluster.name.get()}`}
      value={clusterNames.get(cluster.id) ?? ""}
      onChange={(event) => {
        const value = event.target.value;

        action(() => (value ? clusterNames.set(cluster.id, value) : clusterNames.delete(cluster.id)))();
      }}
    />
  </Div>
));

const ClusterNames = observer(() => {
  const clusters = use(useSyncInject(allClusterRecordsReactiveInjectionToken)).get();
  const clusterNames = use(useSyncInject(datadogClusterNamesBunch.persistable));

  if (clusters.length === 0) {
    return <Span $color="textMuted">Lens knows no clusters yet.</Span>;
  }

  return (
    <Div $flex={{ direction: "vertical", gap: "s" }}>
      {clusters.map((cluster) => (
        <ClusterNameRow key={cluster.id} cluster={cluster} clusterNames={clusterNames} />
      ))}
    </Div>
  );
});

const ClusterNamesBlock = () => (
  <Block
    title="Cluster names in Datadog"
    description="The kube_cluster_name each cluster reports under. Left empty, it is read from the DD_CLUSTER_NAME of the Datadog Agent in the cluster; without either, links search all clusters."
  >
    <Suspense fallback={<Loading />}>
      <ClusterNames />
    </Suspense>
  </Block>
);

export default getExtensionPreferencePageInjectableBunch({
  packageJson,
  blocks: [
    { id: "site", orderNumber: 10, Component: SiteBlock },
    { id: "keys", orderNumber: 20, Component: KeysBlock },
    { id: "cluster-names", orderNumber: 30, Component: ClusterNamesBlock },
  ],
});
