#!/usr/bin/env bash
# Walks through the Datadog extension in the running Lens through Lens's own UI, as a user would:
# real mouse clicks on the navigator, the status bar, tabs, menus and rows, and typing into the
# command palette, explaining each step with a notification.
# Needs "Allow AI to access UI" on for the terminal the extension is developed in.
# Usage: demo/ui-demo.sh [cluster name in the navigator] [namespace] [deployment]
#   DEMO_PAUSE=<seconds>  pause after each step (5 by default)
#   DEMO_DRY_RUN=1        walk the steps without notifications and without opening the browser, to check them
set -euo pipefail

CLUSTER="${1:-colima}"
NAMESPACE="${2:-kube-system}"
DEPLOYMENT="${3:-coredns}"
PAUSE="${DEMO_PAUSE:-5}"
CONVERSATION="$(cd "$(dirname "$0")/.." && pwd)"

# What the interactions under way are for, in one short sentence in the user's terms.
WHY=""
why() { WHY="$1"; }

# Set when the user stops the driving: from then on nothing more is asked of Lens.
ABORTED="$(mktemp -u "${TMPDIR:-/tmp}/datadog-demo-aborted.XXXXXX")"
DEMO_PID=$$

# Runs a Lens function. When the user has stopped the driving, or it is not offered, the demo stops
# there for good, also when the call ran inside a check or a pipeline that would otherwise carry on.
fn() {
  [ ! -e "$ABORTED" ] || exit 3

  local errors output
  errors="$(mktemp "${TMPDIR:-/tmp}/datadog-demo-call.XXXXXX")"
  local input="${2:-}"

  # Every interaction says what it is for, while a motivation is set: Lens shows it under the
  # driving indicator, so the user sees why the pointer is moving, not only where.
  case "$1" in
    ai-tool-driving-renderer:conclude-driving) ;;
    ai-tool-driving-renderer:*)
      [ -z "$WHY" ] || input="$(python3 -c 'import json,sys; i=json.loads(sys.argv[1] or "{}"); i["why"]=sys.argv[2]; print(json.dumps(i))' "$input" "$WHY")"
      ;;
  esac

  local args=(--conversation "$CONVERSATION" --id "$1")
  [ -z "$input" ] || args+=(--input "$input")

  if output="$(node "$HOME/.k8slens/ask-ai-functions/invoke-ask-ai-function.mjs" "${args[@]}" 2>"$errors")"; then
    rm -f "$errors"
    printf '%s\n' "$output"
    return 0
  fi

  local reason
  reason="$(cat "$errors")"
  rm -f "$errors"

  case "$reason" in
    *"stopped you driving"* | *"not offered right now"*)
      touch "$ABORTED"
      echo "■ Stopped: $reason" >&2
      kill -TERM "$DEMO_PID" 2>/dev/null
      exit 3
      ;;
  esac

  echo "$reason" >&2
  return 1
}

# Whatever ends the demo, the drive is ended too, so Lens stops showing it, unless the user ended
# it themselves. A dry run only checked the steps, so it takes them back to where they were.
finish() {
  local status=$?

  if [ -e "$ABORTED" ]; then
    rm -f "$ABORTED"
    exit 3
  fi

  if [ -n "${DEMO_DRY_RUN:-}" ]; then
    fn ai-tool-driving-renderer:conclude-driving '{"message":"Checked the Datadog demo steps.","return":true}' >/dev/null || true
  elif [ "$status" -eq 0 ]; then
    fn ai-tool-driving-renderer:conclude-driving '{"message":"Showed the Datadog extension: its view of the cluster, its menus, details and setup."}' >/dev/null || true
  else
    fn ai-tool-driving-renderer:conclude-driving '{"message":"The Datadog demo stopped: a step did not work."}' >/dev/null || true
  fi
}
trap finish EXIT
trap 'exit 130' INT TERM
json() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }
quietly() { "$@" >/dev/null; }

say() {
  echo "▶ $1"
  [ -n "${DEMO_DRY_RUN:-}" ] || quietly fn ask-ai-lens-functions:notify "{\"level\":\"success\",\"message\":$(json "$1")}"
  sleep "$PAUSE"
}
evaluate() { quietly fn ai-tool-driving-renderer:evaluate "{\"expression\":$(json "$1")}"; }
wait_for() { quietly fn ai-tool-driving-renderer:wait-for "{\"timeoutMs\":20000,\"expression\":$(json "$1")}"; }
key() { quietly fn ai-tool-driving-renderer:press-key "{\"key\":\"$1\"}"; }
type_text() { quietly fn ai-tool-driving-renderer:type-text "{\"text\":$(json "$1")}"; }

# Where to look for an element. Terminals are never looked in: Lens keeps them in the page, and
# their text (this very conversation's, say) would otherwise be clicked.
#   page     anywhere but the navigator
#   nav      the navigator on the left
#   subtab   the extension's own row of tabs: Overview, Monitors, Events, Ask AI
#   tab      the tabs along the top of the window, not a tooltip that says the same
#   option   the options of an open select
#   menu     the items of an open drop-down menu
scope_js() {
  case "$1" in
    nav) echo '(e) => !!e.closest("[role=treeitem]")' ;;
    subtab) echo '(e) => e.getAttribute("role") === "tab" && [...e.parentElement.querySelectorAll("[role=tab]")].some((t) => t.textContent.trim() === "Overview")' ;;
    option) echo '(e) => !!e.closest("[role=option]")' ;;
    tab) echo '(e) => !!e.closest("[role=tab]")' ;;
    menu) echo '(e) => !!e.closest("li") && !e.closest("[role=treeitem]")' ;;
    *) echo '(e) => !e.closest("[role=treeitem]")' ;;
  esac
}

# The visible element in a scope whose own text is exactly the given text, the innermost first.
find_js() {
  echo "(() => { const inScope = $(scope_js "${2:-page}"); const shown = (e) => !e.closest(\".xterm\") && e.getClientRects().length > 0 && inScope(e); return [...document.querySelectorAll(\"*\")].filter((e) => shown(e) && e.textContent.trim() === $(json "$1")).sort((a, b) => a.querySelectorAll(\"*\").length - b.querySelectorAll(\"*\").length)[0]; })()"
}

# Clicks it with Lens's real mouse click. It is found and marked in one go, so that nothing can
# re-render in between, and marked again when Lens redraws it before the click lands.
click() {
  local attempt
  for attempt in 1 2 3; do
    wait_for "(() => { document.querySelectorAll(\"[data-demo-target]\").forEach((e) => e.removeAttribute(\"data-demo-target\")); const el = $(find_js "$1" "${2:-page}"); if (!el) return false; el.setAttribute(\"data-demo-target\", \"\"); return true; })()"
    if fn ai-tool-driving-renderer:click '{"selector":"[data-demo-target]"}' >/dev/null; then
      return 0
    fi
  done
  echo "Could not click \"$1\": it kept changing under the pointer." >&2
  return 1
}

# Waits until something visible, outside terminals, shows the given text.
sees() { wait_for "[...document.querySelectorAll(\"*\")].some((e) => !e.closest(\".xterm\") && e.getClientRects().length > 0 && (e.childElementCount === 0 ? e.textContent.includes($(json "$1")) : e.textContent.trim() === $(json "$1")))"; }

# Waits until no chart or list on screen is still loading.
settled() { wait_for "![...document.querySelectorAll(\"*\")].some((e) => !e.closest(\".xterm\") && e.getClientRects().length > 0 && e.childElementCount === 0 && /^Loading/.test(e.textContent.trim()))"; }

# Runs a command the way a user does: opens the palette, types the command's name, and once it is
# listed, presses Enter, which runs the entry the palette highlights first.
command() {
  quietly fn ask-ai-lens-functions:open-command-palette '{}'
  type_text "$1"
  sees "$1"
  key Enter
}

# Lens has no right-click for its UI functions, so the menu of a row is opened with the event a
# right-click sends.
right_click() {
  wait_for "(() => { const e = $(find_js "$1"); if (!e) return false; const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent(\"contextmenu\", { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 5, button: 2 })); return true; })()"
}

# Whether an element is on screen right now, without waiting.
showing() { fn ai-tool-driving-renderer:evaluate "{\"expression\":$(json "!!$(find_js "$1" "${2:-page}")")}" | grep -q '"value": true'; }

show_deployments() {
  # The cluster's tree opens on a click, and closes on another: click only when it is closed.
  # The same goes for its Workloads group, which Deployments is in.
  if ! showing "Deployments" nav; then
    showing "Workloads" nav || { click "$CLUSTER" nav; sleep 1; }
    showing "Deployments" nav || click "Workloads" nav
  fi
  click "Deployments" nav
  # From a terminal tab, Lens does not always bring the list to the front on the navigator click;
  # its tab does.
  if ! showing "$DEPLOYMENT"; then
    sleep 1
    showing "$DEPLOYMENT" || click "Deployments - $CLUSTER" tab
  fi
  sees "$DEPLOYMENT"
}

# --- Setup, before the demo starts ---------------------------------------------------------------

if [ ! -S "$HOME/.k8slens/cli.sock" ]; then
  echo "Lens is not running: start it, and run the demo again." >&2
  trap - EXIT
  exit 2
fi

# A cluster's pages show in the navigator only while Lens is connected to it, as after Lens restarts
# it is not: connect it first.
CLUSTER_ID="$(fn ask-ai-lens-functions:list-clusters | python3 -c 'import json,sys; print(next(c["id"] for c in json.load(sys.stdin)["clusters"] if c["name"] == sys.argv[1]))' "$CLUSTER")"
quietly fn ask-ai-lens-functions:connect-cluster "{\"clusterId\":\"$CLUSTER_ID\"}"

# --- Agent status ------------------------------------------------------------------------------

say "Datadog for Lens, driven through Lens's own UI: Datadog metrics, monitors and events for your Kubernetes resources, each linking to the Datadog website."

why "Opening the deployments"
show_deployments
say "Step 1: the deployments of $CLUSTER, opened from the navigator. Bottom right, the green Datadog badge counts the ready Datadog Agent pods. The extension found the Agent by itself."

# --- The cluster's Datadog view ------------------------------------------------------------------

why "Opening the Datadog view"
# The badge says "Datadog 1/1" or the like, so it is found by its pattern rather than its text.
wait_for "(() => { document.querySelectorAll(\"[data-demo-target]\").forEach((e) => e.removeAttribute(\"data-demo-target\")); const badge = [...document.querySelectorAll(\"*\")].find((e) => !e.closest(\".xterm\") && e.getClientRects().length > 0 && e.childElementCount === 0 && /^Datadog (\\d+\\/\\d+|: no Agent)$/.test(e.textContent.trim())); if (!badge) return false; badge.setAttribute(\"data-demo-target\", \"\"); return true; })()"
quietly fn ai-tool-driving-renderer:click '{"selector":"[data-demo-target]"}'
click "Overview" subtab
click "1h"
sees "Recent events"
settled
say "Step 2: clicking the badge opens the cluster's Datadog view: live CPU, memory, network and restarts from Datadog."

why "Looking back a day"
click "1d"
settled
say "Step 3: switch the time range, here to the last day. The charts refresh every minute."

why "Narrowing to $NAMESPACE"
click "All namespaces ▾"
click "$NAMESPACE" option 2>/dev/null || { sleep 1; click "$NAMESPACE" option; }
say "Step 4: narrow everything to one namespace."
sees "$NAMESPACE ▾"
settled
say "Step 5: now the charts and events show $NAMESPACE only. Below them, the monitors by status and the latest Datadog events, each linking to the Datadog website."

why "Checking the monitors"
click "Monitors" subtab
sees "Manage monitors in Datadog →"
say "Step 6: every monitor of your Datadog account, with its status, its query and when it last triggered."

why "Checking recent events"
click "Events" subtab
settled
say "Step 7: the events of the cluster or namespace, newest first: Kubernetes events, Agent events, monitor alerts and recoveries."

why "Opening Ask AI"
click "Ask AI" subtab
say "Step 8: Ask AI, right in the view: ask about this cluster's Datadog data, such as \"why did $DEPLOYMENT use more CPU this morning?\"."

why "Resetting the view"
# Leave the view as it is found next time: overview, last hour, every namespace. Starting the Ask AI
# terminal can bring another tab to the front, so bring the view back first, by its tab.
click "Datadog: $CLUSTER" tab
click "Overview" subtab
click "1h"
click "$NAMESPACE ▾"
click "All namespaces" option
sees "All namespaces ▾"

# --- One resource ------------------------------------------------------------------------------

why "Opening $DEPLOYMENT's menu"
show_deployments
right_click "$DEPLOYMENT"
click "Open in Datadog" menu
wait_for "!!$(find_js "Kubernetes Explorer" menu)"
say "Step 9: right-click any pod, deployment, node, service or namespace: Open in Datadog takes you to its logs, traces, metrics, Kubernetes Explorer entry or events, already filtered to it."
key Escape
key Escape

why "Opening $DEPLOYMENT details"
click "$DEPLOYMENT"
click "Datadog cluster"
settled
say "Step 10: the details panel of $DEPLOYMENT has a Datadog section: the monitors watching it, its own CPU and memory charts, and its recent events."
key Escape

# --- Setup -------------------------------------------------------------------------------------

why "Checking the connection"
command "Datadog: Open preferences"
click "API access"
click "Test connection"
sees "Connected: both keys work."
say "Step 11: Datadog's commands are in the command palette. Setup is one page in Preferences: your Datadog site and two keys. Test connection checks them against Datadog."

# --- Out to Datadog ----------------------------------------------------------------------------

why "Reopening the Datadog view"
show_deployments
command "Datadog: Open Datadog view of cluster"
sees "Recent events"
settled
say "Step 12: every chart, monitor and event opens on the Datadog website. Opening the CPU chart in Datadog's metrics explorer now."
why "Opening the chart in Datadog"
if [ -z "${DEMO_DRY_RUN:-}" ]; then
  click "CPU"
fi

say "That's Datadog for Lens: Datadog's view of your cluster, inside Lens."
