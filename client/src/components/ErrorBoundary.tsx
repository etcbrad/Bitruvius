import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  context?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    
    // Enhanced error logging
    console.error(`ErrorBoundary${this.props.context ? ` (${this.props.context})` : ''} caught an error:`, error, errorInfo);
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="fixed inset-0 bg-red-900 bg-opacity-90 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-red-600 mb-4">
              Something went wrong {this.props.context && `in ${this.props.context}`}
            </h2>
            <div className="text-gray-700 mb-4">
              The application encountered an unexpected error. This could be due to:
            </div>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Missing or invalid joint data</li>
              <li>Physics calculation errors</li>
              <li>Animation system conflicts</li>
              <li>Memory or performance issues</li>
              <li>Invalid user input or configuration</li>
            </ul>
            <div className="mt-6 p-4 bg-gray-100 rounded">
              <h3 className="font-semibold mb-2">Error Details:</h3>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap break-all">
                {this.state.error?.stack || 'No error details available'}
              </pre>
              {this.state.errorInfo && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-blue-600 hover:text-blue-700 text-sm">
                    Component Stack
                  </summary>
                  <pre className="mt-2 text-xs text-gray-600">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export const useErrorHandler = (context?: string) => {
  return (error: Error, errorInfo?: ErrorInfo) => {
    console.error(`Error caught by error handler${context ? ` (${context})` : ''}`, error, errorInfo);
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: sendToErrorReporting(error, errorInfo);
    }
  };
};
