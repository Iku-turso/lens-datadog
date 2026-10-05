export type DatadogSite =
  | "datadoghq.com"
  | "us3.datadoghq.com"
  | "us5.datadoghq.com"
  | "datadoghq.eu"
  | "ap1.datadoghq.com"
  | "ap2.datadoghq.com"
  | "ddog-gov.com";

interface SiteHosts {
  readonly label: string;
  readonly app: string;
  readonly api: string;
}

export const datadogSites: Record<DatadogSite, SiteHosts> = {
  "datadoghq.com": { label: "US1 (datadoghq.com)", app: "app.datadoghq.com", api: "api.datadoghq.com" },
  "us3.datadoghq.com": { label: "US3 (us3.datadoghq.com)", app: "us3.datadoghq.com", api: "api.us3.datadoghq.com" },
  "us5.datadoghq.com": { label: "US5 (us5.datadoghq.com)", app: "us5.datadoghq.com", api: "api.us5.datadoghq.com" },
  "datadoghq.eu": { label: "EU1 (datadoghq.eu)", app: "app.datadoghq.eu", api: "api.datadoghq.eu" },
  "ap1.datadoghq.com": { label: "AP1 (ap1.datadoghq.com)", app: "ap1.datadoghq.com", api: "api.ap1.datadoghq.com" },
  "ap2.datadoghq.com": { label: "AP2 (ap2.datadoghq.com)", app: "ap2.datadoghq.com", api: "api.ap2.datadoghq.com" },
  "ddog-gov.com": { label: "US1-FED (ddog-gov.com)", app: "app.ddog-gov.com", api: "api.ddog-gov.com" },
};

export const isDatadogSite = (value: string): value is DatadogSite => Object.hasOwn(datadogSites, value);

export const appBaseUrl = (site: DatadogSite) => `https://${datadogSites[site].app}`;
export const apiBaseUrl = (site: DatadogSite) => `https://${datadogSites[site].api}`;
