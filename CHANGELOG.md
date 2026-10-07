# Changelog

What changed in each version of this extension, newest first.

## 0.1.1

- Monitors and events are tables, in the Datadog view and in the details panel: columns can be resized, reordered and hidden, and each row links to Datadog. Events show their source.
- The Datadog site in Preferences, and the namespace in the Datadog view, are chosen from a dropdown.
- The Datadog view has proper headings, and the status bar keeps showing the Datadog Agent badge while the view is in front.
- CPU reads in millicores ("34 millicores") instead of a "34m" that looked like minutes, and the restarts chart says it shows the total.
- Event and monitor badges keep their size, and are coloured by status: warnings yellow, recoveries green.
- The namespace picker shows more namespaces at once, and closes once one is picked.
- The API and application key fields in Preferences are labelled, and long cluster names no longer wrap.

## 0.1.0

- "Open in Datadog" in the menu of pods, deployments, stateful sets, daemon sets, replica sets, jobs, cron jobs, services, namespaces and nodes: logs, APM traces, metrics, Kubernetes Explorer and events.
- A Datadog section in the details panel of those resources, with the same links, the Datadog monitors grouped by the resource, CPU and memory charts and the latest events.
- A Datadog view of each cluster, under the cluster in the navigator: charts, monitors and events for the cluster or one namespace, and an Ask AI conversation about them.
- Datadog Agent status of the current cluster in the status bar; click it to open the cluster's Datadog view.
- Preferences for the Datadog site, API and application keys, and each cluster's name in Datadog.
- Command palette: "Datadog: Open cluster in Datadog" and "Datadog: Open preferences".
- Ask AI can give links to a resource in Datadog, open them, tell whether a cluster runs the Datadog Agent, and answer from Datadog's metrics, monitors and events.
