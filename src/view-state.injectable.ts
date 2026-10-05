import { getInjectable2 } from "@k8slens/injectable";
import { observable } from "mobx";
import type { RangeId } from "./datadog-queries";

/** The time range a view shows, one box per view key: "details", or a Datadog tab's cluster id. */
export const viewRangeInjectable = getInjectable2({
  id: "datadog-view-range",
  instantiate: () => (_viewKey: string) => observable.box<RangeId>("1h"),
});

export type DatadogTabView = "overview" | "monitors" | "events" | "ask-ai";

/** Which part of a Datadog tab is shown, per tab. */
export const tabViewInjectable = getInjectable2({
  id: "datadog-tab-view",
  instantiate: () => (_tabId: string) => observable.box<DatadogTabView>("overview"),
});

/** The namespace a Datadog tab narrows to, per tab; empty for the whole cluster. */
export const tabNamespaceInjectable = getInjectable2({
  id: "datadog-tab-namespace",
  instantiate: () => (_tabId: string) => observable.box<string>(""),
});
