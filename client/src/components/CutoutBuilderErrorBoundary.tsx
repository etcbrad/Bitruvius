import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class CutoutBuilderErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('CutoutBuilderErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
    
    // Attempt to clear any cached state that might cause re-occurrence
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('cutout-builder')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    } catch (cleanupError) {
      console.warn('Failed to cleanup localStorage after error:', cleanupError);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center p-8 text-white">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
            <p className="text-sm text-white/70 mb-4">
              The cutout builder encountered an error. Please try again or refresh the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                // Force parent re-render by triggering a custom event
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('cutout-builder-recovery'));
                }
              }}
              className="px-4 py-2 bg-[#F27D26] text-black rounded-lg text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
