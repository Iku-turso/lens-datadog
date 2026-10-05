import { Component, type ReactNode } from "react";

interface Props {
  readonly fallback: (error: Error) => ReactNode;
  readonly children: ReactNode;
}

/** Keeps a failure to load Datadog data inside the extension's own piece of the UI. */
export class DatadogErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
