export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  consecutiveFailures: number;
  responseTime: number;
  errorRate: number;
}

export interface Env {
  TTT_BASE: string;
  TTT_SHARED_SECRET: string;
}

export class PluctHealthMonitor {
  private health: ServiceHealth = {
    status: 'healthy',
    lastCheck: 0,
    consecutiveFailures: 0,
    responseTime: 0,
    errorRate: 0
  };

  constructor(private env: Env) {}

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      // Simple health check - try to reach TTT service
      const response = await fetch(`${this.env.TTT_BASE}/health`, {
        method: 'GET',
        headers: { 'X-Engine-Auth': this.env.TTT_SHARED_SECRET },
        signal: AbortSignal.timeout(5000)
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        this.health.status = 'healthy';
        this.health.consecutiveFailures = 0;
        this.health.responseTime = responseTime;
        this.health.errorRate = Math.max(0, this.health.errorRate - 0.1);
      } else {
        this.health.status = 'degraded';
        this.health.consecutiveFailures++;
        this.health.responseTime = responseTime;
        this.health.errorRate = Math.min(1, this.health.errorRate + 0.2);
      }
    } catch (error) {
      this.health.status = 'unhealthy';
      this.health.consecutiveFailures++;
      this.health.responseTime = Date.now() - startTime;
      this.health.errorRate = Math.min(1, this.health.errorRate + 0.3);
      
      if (this.health.consecutiveFailures >= 3) {
        this.health.status = 'unhealthy';
      }
    }
    
    this.health.lastCheck = Date.now();
    return { ...this.health };
  }

  getHealth(): ServiceHealth {
    return { ...this.health };
  }
}
