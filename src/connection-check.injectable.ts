import { getInjectable2 } from "@k8slens/injectable";
import { action, observable } from "mobx";
import { checkDatadogConnectionInjectable, type ConnectionCheck } from "./datadog-api.injectable";

export type ConnectionCheckState = { readonly state: "idle" } | { readonly state: "checking" } | ({ readonly state: "done" } & ConnectionCheck);

/** The result of the preferences page's "Test connection", kept while the page is away. */
export const connectionCheckStateInjectable = getInjectable2({
  id: "datadog-connection-check-state",
  instantiate: () => {
    const state = observable.box<ConnectionCheckState>({ state: "idle" });

    return () => state;
  },
});

export const runConnectionCheckInjectable = getInjectable2({
  id: "datadog-run-connection-check",
  instantiate: (di) => {
    const state = di.inject(connectionCheckStateInjectable)();
    const check = di.inject(checkDatadogConnectionInjectable)();

    return () => async () => {
      action(() => state.set({ state: "checking" }))();
      const result = await check();

      action(() => state.set({ state: "done", ...result }))();
    };
  },
});
