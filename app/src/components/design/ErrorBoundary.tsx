"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State {
  hasError: boolean;
  message?: string;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Section-level error boundary. Catches render-time exceptions in a
 * subtree so a single broken card / panel doesn't crash the whole
 * page. The fallback shows a quiet, retryable error card.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("ErrorBoundary", error, info);
    }
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="kx-card text-center py-8 px-4 my-3">
          <div className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-kx-danger/10 text-kx-danger mb-2">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="font-semibold text-kx-text">这里出了点问题</p>
          {this.state.message ? (
            <p className="text-xs text-kx-muted mt-1 line-clamp-3">{this.state.message}</p>
          ) : null}
          <button className="kx-button-ghost mt-3" onClick={this.reset}>
            <RefreshCw className="w-3.5 h-3.5" /> 重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
