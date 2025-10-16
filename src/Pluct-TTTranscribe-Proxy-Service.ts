export interface Env {
  TTT_BASE: string;
  TTT_SHARED_SECRET: string;
  MAX_RETRIES?: string;
  REQUEST_TIMEOUT?: string;
}

export class PluctTTTranscribeProxy {
  constructor(private env: Env) {}

  async callTTT(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.env.TTT_BASE}${path}`;
    const maxRetries = parseInt(this.env.MAX_RETRIES || '3', 10);
    const timeout = parseInt(this.env.REQUEST_TIMEOUT || '30000', 10);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const requestInit: RequestInit = {
          ...init,
          headers: { ...(init.headers || {}), 'X-Engine-Auth': this.env.TTT_SHARED_SECRET },
          signal: AbortSignal.timeout(timeout)
        };
        
        const response = await fetch(url, requestInit);
        
        // If successful or client error (4xx), don't retry
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        
        // Server error (5xx) - retry if not last attempt
        if (attempt === maxRetries) {
          return response;
        }
        
        console.log(`be:ttt_retry msg=attempt ${attempt}/${maxRetries} failed metadata=${JSON.stringify({ status: response.status, url })}`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // Exponential backoff
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        console.log(`be:ttt_retry msg=attempt ${attempt}/${maxRetries} error metadata=${JSON.stringify({ error: (error as Error).message, url })}`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // Exponential backoff
      }
    }
    
    throw new Error('Max retries exceeded');
  }
}
