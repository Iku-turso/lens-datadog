import { Badge } from "@k8slens/badge";
import { ClickableDiv, Code, Span } from "@k8slens/element-components";
import { getInjectable2 } from "@k8slens/injectable";
import { derivedSubscribable } from "@k8slens/subscribable";
import {
  getTableColumnInjectableBunch,
  getTableInjectableBunch,
  getTableKind,
  type TableColumnCellProps,
  type TableRow,
} from "@k8slens/table-contracts";
import { ColumnHeader } from "@k8slens/table-components";
import { useInject } from "@k8slens/use-inject";
import { action, observable, reaction } from "mobx";
import { type DatadogEvent, type DatadogMonitor, eventsBunch, type Loaded, monitorsBunch } from "./datadog-data.injectable";
import { buildMonitorLink } from "./datadog-links";
import { eventExplorerLinkForQuery, isRangeId } from "./datadog-queries";
import type { DatadogSite } from "./datadog-sites";
import { type MonitorGroup, monitorGroupsBunch } from "./monitor-groups.injectable";
import { openUrlInBrowserInjectable } from "./open-in-datadog.injectable";
import { datadogSettingsBunch } from "./settings.injectable";
import { statusColor } from "./views";

/** The Datadog site as a box rows can read synchronously, so each row carries its own link. */
export const datadogSiteInjectable = getInjectable2({
  id: "datadog-site",
  instantiate: (di) => {
    const getSettings = di.inject(datadogSettingsBunch.persistable);
    const site = observable.box<DatadogSite>("datadoghq.com");

    // Follows the preferences as the user changes the site.
    void getSettings().then((settings) => {
      reaction(() => settings.get().site, (changed) => action(() => site.set(changed))(), { fireImmediately: true });
    });

    return () => site;
  },
});

/** A table fails with the reason, the way a table says its data could not be had. */
const rowsOf = <T,>(loaded: Loaded<T>): T => {
  if (loaded.state === "not-configured") throw new Error("Add a Datadog API key and application key in Preferences > Extensions.");
  if (loaded.state === "failed") throw new Error(loaded.message);

  return loaded.value;
};

// --- Shared cells --------------------------------------------------------------------------------

const StatusBadge = ({ status }: { status: string }) => (
  <Badge small label={status} $backgroundColor={statusColor(status)} $color="white" />
);

const Link = ({ href, children }: { href: string; children: string }) => {
  const openUrl = useInject(openUrlInBrowserInjectable)();

  return (
    <ClickableDiv $onClick={() => openUrl(href)} $color="link" $tooltip={`Open in Datadog: ${children}`} $font={{ textOverflow: "ellipsis", noWrap: true }}>
      {children}
    </ClickableDiv>
  );
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const header = (text: string) => {
  const Header = () => <ColumnHeader>{text}</ColumnHeader>;

  return Header;
};

// --- Monitors of the account -----------------------------------------------------------------------

type MonitorRow = DatadogMonitor & { readonly link: string };

export const monitorsTableKind = getTableKind<MonitorRow>("datadog-monitors");

export const monitorsTable = getTableInjectableBunch({
  kind: monitorsTableKind,
  getRowId: (monitor) => String(monitor.id),
  data: {
    instantiate: (di) => {
      const monitors = di.inject(monitorsBunch.subscribable);
      const site = di.inject(datadogSiteInjectable)();

      return () =>
        derivedSubscribable(monitors(""), (loaded) => rowsOf(loaded).map((monitor) => ({ ...monitor, link: buildMonitorLink(site.get(), monitor.id) })));
    },
  },
});

type MonitorCell = TableColumnCellProps<TableRow<typeof monitorsTableKind>>;

export const monitorStatusColumn = getTableColumnInjectableBunch({
  id: "datadog-monitors-status",
  kind: monitorsTableKind,
  orderNumber: 10,
  Header: header("Status"),
  Cell: ({ row }: MonitorCell) => <StatusBadge status={row.status} />,
});

export const monitorNameColumn = getTableColumnInjectableBunch({
  id: "datadog-monitors-name",
  kind: monitorsTableKind,
  orderNumber: 20,
  Header: header("Monitor"),
  Cell: ({ row }: MonitorCell) => <Link href={row.link}>{row.name}</Link>,
});

export const monitorTypeColumn = getTableColumnInjectableBunch({
  id: "datadog-monitors-type",
  kind: monitorsTableKind,
  orderNumber: 30,
  Header: header("Type"),
  Cell: ({ row }: MonitorCell) => <Span $color="textMuted">{row.type}</Span>,
});

export const monitorQueryColumn = getTableColumnInjectableBunch({
  id: "datadog-monitors-query",
  kind: monitorsTableKind,
  orderNumber: 40,
  Header: header("Query"),
  Cell: ({ row }: MonitorCell) => (
    <Code $color="textMuted" $font={{ size: "s", noWrap: true, textOverflow: "ellipsis" }} $tooltip={row.query ?? ""}>
      {row.query ?? ""}
    </Code>
  ),
});

export const monitorLastTriggeredColumn = getTableColumnInjectableBunch({
  id: "datadog-monitors-last-triggered",
  kind: monitorsTableKind,
  orderNumber: 50,
  Header: header("Last triggered"),
  Cell: ({ row }: MonitorCell) => <Span $color="textMuted">{when(row.lastTriggered)}</Span>,
});

// --- Events --------------------------------------------------------------------------------------

type EventRow = DatadogEvent & { readonly link: string };

export const eventsTableKind = getTableKind<EventRow, [query: string, rangeId: string]>("datadog-events");

export const eventsTable = getTableInjectableBunch({
  kind: eventsTableKind,
  getRowId: (event) => event.id,
  data: {
    instantiate: (di) => {
      const events = di.inject(eventsBunch.subscribable);
      const site = di.inject(datadogSiteInjectable)();

      return (query, rangeId) => {
        const range = isRangeId(rangeId) ? rangeId : "1h";

        return derivedSubscribable(events(query, range), (loaded) =>
          rowsOf(loaded).map((event) => ({ ...event, link: eventExplorerLinkForQuery(site.get(), query, range, event.id) })),
        );
      };
    },
  },
});

type EventCell = TableColumnCellProps<TableRow<typeof eventsTableKind>>;

export const eventStatusColumn = getTableColumnInjectableBunch({
  id: "datadog-events-status",
  kind: eventsTableKind,
  orderNumber: 10,
  Header: header("Status"),
  Cell: ({ row }: EventCell) => <StatusBadge status={row.status} />,
});

export const eventTimeColumn = getTableColumnInjectableBunch({
  id: "datadog-events-time",
  kind: eventsTableKind,
  orderNumber: 20,
  Header: header("Time"),
  Cell: ({ row }: EventCell) => <Span $color="textMuted">{when(row.timestamp)}</Span>,
});

export const eventTitleColumn = getTableColumnInjectableBunch({
  id: "datadog-events-title",
  kind: eventsTableKind,
  orderNumber: 30,
  Header: header("Event"),
  Cell: ({ row }: EventCell) => <Link href={row.link}>{row.title}</Link>,
});

export const eventSourceColumn = getTableColumnInjectableBunch({
  id: "datadog-events-source",
  kind: eventsTableKind,
  orderNumber: 40,
  Header: header("Source"),
  Cell: ({ row }: EventCell) => <Span $color="textMuted">{row.source ?? "—"}</Span>,
});

// --- The monitors of one resource ------------------------------------------------------------------

type MonitorGroupRow = MonitorGroup & { readonly link: string };

export const monitorGroupsTableKind = getTableKind<
  MonitorGroupRow,
  [clusterId: string, kind: string, name: string, namespace: string]
>("datadog-resource-monitors");

export const monitorGroupsTable = getTableInjectableBunch({
  kind: monitorGroupsTableKind,
  getRowId: (group) => `${group.monitorId}/${group.group}`,
  data: {
    instantiate: (di) => {
      const monitorGroups = di.inject(monitorGroupsBunch.subscribable);
      const site = di.inject(datadogSiteInjectable)();

      return (clusterId, kind, name, namespace) =>
        derivedSubscribable(monitorGroups(clusterId, kind, name, namespace), (result) => {
          if (result.state === "not-configured") throw new Error("Add a Datadog API key and application key in Preferences > Extensions.");
          if (result.state === "failed") throw new Error(result.message);

          return result.groups.map((group) => ({ ...group, link: buildMonitorLink(site.get(), group.monitorId) }));
        });
    },
  },
});

type MonitorGroupCell = TableColumnCellProps<TableRow<typeof monitorGroupsTableKind>>;

export const monitorGroupStatusColumn = getTableColumnInjectableBunch({
  id: "datadog-resource-monitors-status",
  kind: monitorGroupsTableKind,
  orderNumber: 10,
  Header: header("Status"),
  Cell: ({ row }: MonitorGroupCell) => <StatusBadge status={row.status} />,
});

export const monitorGroupNameColumn = getTableColumnInjectableBunch({
  id: "datadog-resource-monitors-name",
  kind: monitorGroupsTableKind,
  orderNumber: 20,
  Header: header("Monitor"),
  Cell: ({ row }: MonitorGroupCell) => <Link href={row.link}>{row.monitorName}</Link>,
});

export const monitorGroupGroupColumn = getTableColumnInjectableBunch({
  id: "datadog-resource-monitors-group",
  kind: monitorGroupsTableKind,
  orderNumber: 30,
  Header: header("Group"),
  Cell: ({ row }: MonitorGroupCell) => <Span $color="textMuted">{row.group}</Span>,
});

export const monitorGroupLastTriggeredColumn = getTableColumnInjectableBunch({
  id: "datadog-resource-monitors-last-triggered",
  kind: monitorGroupsTableKind,
  orderNumber: 40,
  Header: header("Last triggered"),
  Cell: ({ row }: MonitorGroupCell) => <Span $color="textMuted">{when(row.lastTriggered)}</Span>,
});
