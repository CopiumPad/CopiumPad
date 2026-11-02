"use client";

import { Component, type ReactNode } from "react";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";

type BoundaryProps = { children: ReactNode; onReset: () => void };
type BoundaryState = { message: string | null };

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : "Could not load your data." };
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        <p className="min-w-0">{this.state.message}</p>
        <button
          type="button"
          onClick={() => {
            this.props.onReset();
            this.setState({ message: null });
          }}
          className="shrink-0 rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/10"
        >
          Retry
        </button>
      </div>
    );
  }
}

/** `useSuspenseQuery` throws when a first load fails. Later failures keep the data on screen. */
export function QueryErrorBoundary({ children }: { children: ReactNode }) {
  const { reset } = useQueryErrorResetBoundary();
  return <Boundary onReset={reset}>{children}</Boundary>;
}
