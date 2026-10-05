import {
  dropDownMenu,
  getDropDownMenuItemInjectableBunch,
  getDropDownMenuKind,
} from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow, DropDownMenuSubMenu } from "@k8slens/drop-down-menu-items";
import {
  getKubeResourceMenuItemInjectableBunch,
  kubeResourceMenuOrderNumbers,
  type KubeResourceMenuTarget,
} from "@k8slens/kube-resource-menu-contracts";
import { useInject } from "@k8slens/use-inject";
import { DatadogIcon } from "./datadog-icon";
import { datadogViews, type DatadogView, isSupportedKind } from "./datadog-links";
import { openInDatadogInjectable } from "./open-in-datadog.injectable";

const datadogResourceMenuKind = getDropDownMenuKind<KubeResourceMenuTarget>()("datadog-resource-menu");

const OpenInDatadog = ({ data }: { data: KubeResourceMenuTarget }) => (
  <DropDownMenuSubMenu Icon={DatadogIcon} menu={dropDownMenu(datadogResourceMenuKind, { data, openOn: "hover", position: "right span-bottom" })}>
    Open in Datadog
  </DropDownMenuSubMenu>
);

export const openInDatadogMenuItem = getKubeResourceMenuItemInjectableBunch({
  id: "datadog-resource-menu-open-in-datadog",
  orderNumber: kubeResourceMenuOrderNumbers.sectionEnd + 100,
  isVisible: (target) => isSupportedKind(target.kind),
  Component: OpenInDatadog,
});

const viewItem = (view: DatadogView, label: string) => {
  const Item = ({ data }: { data: KubeResourceMenuTarget }) => {
    const openInDatadog = useInject(openInDatadogInjectable)();

    return (
      <DropDownMenuItemRow
        $onClick={() => void openInDatadog(data.clusterId, { kind: data.kind, name: data.name, namespace: data.namespace }, view).catch(() => {})}
      >
        {label}
      </DropDownMenuItemRow>
    );
  };

  return getDropDownMenuItemInjectableBunch({
    id: `datadog-resource-menu-${view}`,
    kind: datadogResourceMenuKind,
    orderNumber: (datadogViews.findIndex((it) => it.view === view) + 1) * 10,
    Component: Item,
  });
};

export const logsMenuItem = viewItem("logs", "Logs");
export const apmMenuItem = viewItem("apm", "APM traces");
export const metricsMenuItem = viewItem("metrics", "Metrics");
export const explorerMenuItem = viewItem("explorer", "Kubernetes Explorer");
export const eventsMenuItem = viewItem("events", "Events");
