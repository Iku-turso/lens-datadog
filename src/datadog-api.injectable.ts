import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { apiBaseUrl } from "./datadog-sites";
import { getDatadogSettingsInjectable } from "./settings.injectable";

export class DatadogApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Calls the Datadog API with the keys from the preferences. Lens gives extensions no HTTP client of
 * their own, so this runs curl; the keys and the URL travel as environment variables rather than as
 * part of the command, so nothing of them is interpreted by the shell or shows in a process list.
 */
export const datadogApiRequestInjectable = getInjectable2({
  id: "datadog-api-request",
  consumptions: [runCliCommandInjectionToken],
  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    const getSettings = di.inject(getDatadogSettingsInjectable)();

    return () =>
      async <T>(path: string, params: Record<string, string> = {}): Promise<T> => {
        const { site, apiKey, applicationKey } = await getSettings();

        if (!apiKey || !applicationKey) {
          throw new DatadogApiError("Add a Datadog API key and application key in Preferences > Extensions > datadog.", 0);
        }

        const search = new URLSearchParams(params).toString();
        const url = `${apiBaseUrl(site)}${path}${search ? `?${search}` : ""}`;

        const output = await runCliCommand(
          'curl --silent --show-error --max-time 20 -H "Accept: application/json" -H "DD-API-KEY: $LENS_DATADOG_API_KEY" -H "DD-APPLICATION-KEY: $LENS_DATADOG_APP_KEY" --write-out "\\n%{http_code}" "$LENS_DATADOG_URL"',
          { env: { LENS_DATADOG_API_KEY: apiKey, LENS_DATADOG_APP_KEY: applicationKey, LENS_DATADOG_URL: url } },
        );

        const separator = output.lastIndexOf("\n");
        const body = output.slice(0, separator);
        const status = Number(output.slice(separator + 1).trim());

        if (status < 200 || status >= 300) {
          let reason = body.trim();

          try {
            const parsed = JSON.parse(body) as { errors?: unknown[] };

            reason = parsed.errors?.map(String).join("; ") || reason;
          } catch {
            // Not JSON: keep the body as it came.
          }

          throw new DatadogApiError(`Datadog answered ${status}${reason ? `: ${reason}` : ""}`, status);
        }

        return JSON.parse(body) as T;
      };
  },
});

export interface ConnectionCheck {
  readonly ok: boolean;
  readonly message: string;
}

export const checkDatadogConnectionInjectable = getInjectable2({
  id: "datadog-check-connection",
  instantiate: (di) => {
    const request = di.inject(datadogApiRequestInjectable)();

    return () => async (): Promise<ConnectionCheck> => {
      try {
        // Needs both keys, unlike /api/v1/validate, which checks only the API key.
        await request("/api/v1/monitor/search", { per_page: "1" });

        return { ok: true, message: "Connected: both keys work." };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    };
  },
});
