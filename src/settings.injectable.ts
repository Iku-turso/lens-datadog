import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableMapInjectableBunch, getPersistableValueInjectableBunch } from "@k8slens/persistable-contracts";
import { action } from "mobx";
import type { DatadogSite } from "./datadog-sites";

export interface DatadogSettings {
  readonly site: DatadogSite;
  readonly apiKey: string;
  readonly applicationKey: string;
}

export const datadogSettingsBunch = getPersistableValueInjectableBunch<DatadogSettings>()({
  id: "settings",
  defaultValue: { instantiate: () => async () => ({ site: "datadoghq.com", apiKey: "", applicationKey: "" }) },
});

/** What the user calls each Lens cluster in Datadog (its `kube_cluster_name`), keyed by Lens cluster id. */
export const datadogClusterNamesBunch = getPersistableMapInjectableBunch<string, string>()({
  id: "cluster-names",
});

export const getDatadogSettingsInjectable = getInjectable2({
  id: "datadog-get-settings",
  instantiate: (di) => {
    const getSettings = di.inject(datadogSettingsBunch.persistable);

    return () => async () => (await getSettings()).get();
  },
});

export const updateDatadogSettingsInjectable = getInjectable2({
  id: "datadog-update-settings",
  instantiate: (di) => {
    const getSettings = di.inject(datadogSettingsBunch.persistable);

    return () => async (change: Partial<DatadogSettings>) => {
      const settings = await getSettings();

      action(() => settings.set({ ...settings.get(), ...change }))();
    };
  },
});

export const setDatadogClusterNameInjectable = getInjectable2({
  id: "datadog-set-cluster-name",
  instantiate: (di) => {
    const getClusterNames = di.inject(datadogClusterNamesBunch.persistable);

    return () => async (clusterId: string, name: string) => {
      const clusterNames = await getClusterNames();
      const trimmed = name.trim();

      action(() => (trimmed ? clusterNames.set(clusterId, trimmed) : clusterNames.delete(clusterId)))();
    };
  },
});
