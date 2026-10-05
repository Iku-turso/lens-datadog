#!/usr/bin/env bash
# Walks through the Datadog extension in the running Lens, explaining each step with a notification.
# Needs "Allow AI to access UI" on for the terminal the extension is developed in.
# Usage: demo/ui-demo.sh [lens-cluster-id] [namespace] [deployment]
#   DEMO_PAUSE=<seconds>  pause after each step (5 by default)
#   DEMO_DRY_RUN=1        walk the steps without notifications and without opening the browser, to check them
set -euo pipefail

CLUSTER_ID="${1:-650b5a450afd8c6924353534fb2d7969}"
NAMESPACE="${2:-kube-system}"
DEPLOYMENT="${3:-coredns}"
PAUSE="${DEMO_PAUSE:-5}"
CONVERSATION="$(cd "$(dirname "$0")/.." && pwd)"

fn() { node "$HOME/.k8slens/ask-ai-functions/invoke-ask-ai-function.mjs" --conversation "$CONVERSATION" --id "$1" ${2:+--input "$2"} >/dev/null; }
json() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }
notify() { echo "▶ $1"; [ -n "${DEMO_DRY_RUN:-}" ] || fn ask-ai-lens-functions:notify "{\"level\":\"success\",\"message\":$(json "$1")}"; }
pause() { sleep "$PAUSE"; }
js() { fn ai-tool-driving-renderer:evaluate "{\"expression\":$(json "$1")}"; }
wait_for() { fn ai-tool-driving-renderer:wait-for "{\"expression\":$(json "$1")}"; }
key() { fn ai-tool-driving-renderer:press-key "{\"key\":\"$1\"}"; }
# Whether an expression is true in Lens right now, without waiting.
js_true() { node "$HOME/.k8slens/ask-ai-functions/invoke-ask-ai-function.mjs" --conversation "$CONVERSATION" --id ai-tool-driving-renderer:evaluate --input "{\"expression\":$(json "$1")}" | grep -q '"value": true'; }

# Everything below looks only at what is on screen, outside terminals: Lens keeps terminals in the
# page, and their text would otherwise match first.
on_screen='(e) => !e.closest(".xterm") && e.getClientRects().length > 0'
# The visible element whose text is exactly the given text, a leaf first, optionally within a selector.
find_text="(t, within = \"*\") => [...document.querySelectorAll(within)].find((e) => ($on_screen)(e) && e.childElementCount === 0 && e.textContent.trim() === t) ?? [...document.querySelectorAll(within)].find((e) => ($on_screen)(e) && e.textContent.trim() === t)"
# Clicks with Lens's real mouse click, as a user would: hover menus open, focus moves. The element is
# found and marked first, so the click cannot land on a terminal's text.
click_text() {
  js "(() => { document.querySelectorAll(\"[data-demo-target]\").forEach((e) => e.removeAttribute(\"data-demo-target\")); const el = ($find_text)($(json "$1"), $(json "${2:-*}")); el.setAttribute(\"data-demo-target\", \"\"); return true; })()"
  fn ai-tool-driving-renderer:click '{"selector":"[data-demo-target]"}'
}
scroll_to() { js "(() => { ($find_text)($(json "$1")).scrollIntoView({ block: \"${2:-start}\" }); return true; })()"; }
# Waits for visible text containing the given text.
page_has() { wait_for "[...document.querySelectorAll(\"*\")].some((e) => ($on_screen)(e) && e.childElementCount === 0 && e.textContent.includes($(json "$1")))"; }
# Waits for a visible element whose text is exactly the given text, optionally within a selector.
page_shows() { wait_for "!!($find_text)($(json "$1"), $(json "${2:-*}"))"; }
# Waits until every chart and list on screen has drawn, or said why not.
loaded() { wait_for "![...document.querySelectorAll(\"*\")].some((e) => ($on_screen)(e) && e.childElementCount === 0 && /^Loading/.test(e.textContent.trim()))"; }

show_deployments() {
  fn ask-ai-lens-functions:navigate-to-resource-list "{\"clusterId\":\"$CLUSTER_ID\",\"resource\":\"deployments\",\"namespaces\":[\"$NAMESPACE\"]}"
  page_shows "$DEPLOYMENT"
}

show_datadog_view() {
  show_deployments
  fn ask-ai-lens-functions:run-command '{"id":"datadog.open-view"}'
  page_shows "Overview" '[role=tab]'
}

# --- Agent status ------------------------------------------------------------------------------

notify "Datadog extension demo: Datadog metrics, monitors and events for your Kubernetes resources, right inside Lens, each linking to the Datadog website."
pause

show_deployments
notify "Step 1: in any cluster, the status bar shows the Datadog Agent: the green badge, bottom right, counts the ready Agent pods. The extension finds the Agent itself, with no setup."
pause

# --- The cluster's Datadog view ------------------------------------------------------------------

show_datadog_view
click_text "Overview" '[role=tab]'
click_text "1h" '[role=tab]'
page_shows "Recent events"
loaded
notify "Step 2: the cluster's Datadog view, opened from the badge, the Datadog item under the cluster in the navigator, or the command palette. Live CPU, memory, network and restarts from Datadog."
pause

click_text "1d" '[role=tab]'
loaded
notify "Step 3: switch the time range, here to the last day. The charts refresh every minute."
pause

click_text "All namespaces ▾"
page_shows "$NAMESPACE" '[role=option]'
notify "Step 4: narrow everything to one namespace."
pause
click_text "$NAMESPACE" '[role=option]'
key Escape
page_shows "$NAMESPACE ▾"
loaded
notify "Step 5: now the charts and events show $NAMESPACE only."
pause

scroll_to "Recent events" center
notify "Step 6: below the charts, the monitors by status and the latest Datadog events. Each event links to it on the Datadog website."
pause

click_text "Monitors" '[role=tab]'
page_has "Manage monitors in Datadog"
notify "Step 7: every monitor of your Datadog account, with its status, its query and when it last triggered."
pause

click_text "Events" '[role=tab]'
page_has "event"
loaded
notify "Step 8: the events of the cluster or namespace, newest first: Kubernetes events, Agent events, monitor alerts and recoveries."
pause

click_text "Ask AI" '[role=tab]'
notify "Step 9: Ask AI, right in the view: ask about this cluster's Datadog data, such as \"why did coredns use more CPU this morning?\"."
pause

# Leave the view as it is found next time: overview, last hour, every namespace. The Ask AI
# terminal can take the focus to a tab of its own, so bring the view to the front first.
show_datadog_view
click_text "Overview" '[role=tab]'
click_text "1h" '[role=tab]'
if js_true "!!($find_text)($(json "$NAMESPACE ▾"))"; then
  click_text "$NAMESPACE ▾"
  page_shows "All namespaces" '[role=option]'
  click_text "All namespaces" '[role=option]'
  key Escape
fi

# --- One resource ------------------------------------------------------------------------------

show_deployments
js "(() => { const cell = ($find_text)($(json "$DEPLOYMENT")); const r = cell.getBoundingClientRect(); cell.dispatchEvent(new MouseEvent(\"contextmenu\", { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 5, button: 2 })); return true; })()"
page_shows "Open in Datadog"
click_text "Open in Datadog"
page_shows "Kubernetes Explorer"
notify "Step 10: right-click any pod, deployment, node, service or namespace: Open in Datadog takes you to its logs, traces, metrics, Kubernetes Explorer entry or events, already filtered to it."
pause
key Escape
key Escape

fn ask-ai-lens-functions:open-resource-details "{\"clusterId\":\"$CLUSTER_ID\",\"kind\":\"Deployment\",\"apiVersion\":\"apps/v1\",\"name\":\"$DEPLOYMENT\",\"namespace\":\"$NAMESPACE\"}"
page_shows "Datadog cluster"
scroll_to "Datadog cluster"
loaded
notify "Step 11: the details panel of $DEPLOYMENT has a Datadog section: the monitors watching it, its own CPU and memory charts, and its recent events."
pause
key Escape

# --- Setup -------------------------------------------------------------------------------------

fn ask-ai-lens-functions:open-preferences '{"pageId":"datadog"}'
page_shows "API access"
scroll_to "API access"
click_text "Test connection" button
page_has "Connected: both keys work."
notify "Step 12: setup is one page in Preferences: your Datadog site and two keys. Test connection checks them against Datadog."
pause

# --- Out to Datadog ----------------------------------------------------------------------------

show_datadog_view
page_shows "Recent events"
loaded
notify "Step 13: every chart, monitor and event opens on the Datadog website. Opening the CPU chart in Datadog's metrics explorer now."
pause
if [ -z "${DEMO_DRY_RUN:-}" ]; then
  click_text "CPU"
fi

notify "That's the Datadog extension: Datadog's view of your cluster, inside Lens."
