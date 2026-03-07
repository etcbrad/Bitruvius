export interface PerformanceMetrics {
  operation: string;
  operationId?: string;
  startTime: number;
 endTime?: number;
  duration?: number;
  memoryBefore?: number;
  memoryAfter?: number;
  memoryDelta?: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private activeOperations: Map<string, PerformanceMetrics> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startOperation(operation: string): string {
    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const memoryBefore = this.getMemoryUsage();
    
    const metric: PerformanceMetrics = {
      operation,
      operationId,
      startTime: performance.now(),
      memoryBefore: memoryBefore || undefined,
    };
    
    this.activeOperations.set(operationId, metric);
    console.log(`[Performance] Started: ${operation}`);
    
    return operationId;
  }

  endOperation(operationId: string): PerformanceMetrics | null {
    const metric = this.activeOperations.get(operationId);
    if (!metric) return null;
    
    const endTime = performance.now();
    const memoryAfter = this.getMemoryUsage();
    
    const completedMetric: PerformanceMetrics = {
      ...metric,
      endTime,
      duration: endTime - metric.startTime,
      memoryAfter: memoryAfter || undefined,
      memoryDelta: memoryAfter && metric.memoryBefore ? memoryAfter - metric.memoryBefore : undefined,
    };
    
    this.metrics.push(completedMetric);
    this.activeOperations.delete(operationId);
    
    console.log(`[Performance] Completed: ${metric.operation} in ${completedMetric.duration?.toFixed(2)}ms`);
    
    if (completedMetric.duration && completedMetric.duration > 1000) {
      console.warn(`[Performance] Slow operation detected: ${metric.operation} took ${completedMetric.duration.toFixed(2)}ms`);
    }
    
    return completedMetric;
  }

  async measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const operationId = this.startOperation(operation);
    try {
      const result = await fn();
      this.endOperation(operationId);
      return result;
    } catch (error) {
      this.endOperation(operationId);
      throw error;
    }
  }

  measure<T>(operation: string, fn: () => T): T {
    const operationId = this.startOperation(operation);
    try {
      const result = fn();
      this.endOperation(operationId);
      return result;
    } catch (error) {
      this.endOperation(operationId);
      throw error;
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getMetricsByOperation(operation: string): PerformanceMetrics[] {
    return this.metrics.filter(metric => metric.operation === operation);
  }

  getAverageDuration(operation: string): number {
    const operationMetrics = this.getMetricsByOperation(operation);
    const completedMetrics = operationMetrics.filter(m => m.duration !== undefined);
    if (completedMetrics.length === 0) return 0;
    
    const total = completedMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    return total / completedMetrics.length;
  }

  clearMetrics(): void {
    this.metrics = [];
    console.log('[Performance] Metrics cleared');
  }

  private getMemoryUsage(): number | null {
    if ('memory' in performance && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return null;
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  operation: string,
  fn: T
): T {
  return ((...args: Parameters<T>) => {
    return performanceMonitor.measure(operation, () => fn(...args));
  }) as T;
}

export function withAsyncPerformanceMonitoring<T extends (...args: any[]) => Promise<any>>(
  operation: string,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    return await performanceMonitor.measureAsync(operation, () => fn(...args));
  }) as T;
}
