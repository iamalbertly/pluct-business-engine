export interface Env {
  KV_USERS: any;
}

export class PluctMetadataResolver {
  constructor(private env: Env) {}

  isTikTokUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('tiktok.com') || urlObj.hostname.includes('vm.tiktok.com');
    } catch {
      return false;
    }
  }
  
  async fetchTikTokMetadata(url: string): Promise<any> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!response.ok) throw new Error('fetch_failed');
    const html = await response.text();
    
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'Unknown Title';
    
    const authorMatch = html.match(/"author":\s*"([^"]+)"/) || 
                       html.match(/<meta property="og:site_name" content="([^"]+)"/);
    const author = authorMatch ? authorMatch[1] : 'Unknown Author';
    
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';
    
    const durationMatch = html.match(/"duration":\s*(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
    
    const handleMatch = html.match(/@([a-zA-Z0-9_]+)/);
    const handle = handleMatch ? handleMatch[1] : '';
    
    return { title, author, description, duration, handle, url };
  }
  
  async resolveMetadata(url: string): Promise<any> {
    const cacheKey = `meta:${url}`;
    const cached = await this.env.KV_USERS.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!response.ok) throw new Error('fetch_failed');
    const html = await response.text();
    
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'Unknown Title';
    
    const authorMatch = html.match(/"author":\s*"([^"]+)"/) || 
                       html.match(/<meta property="og:site_name" content="([^"]+)"/);
    const author = authorMatch ? authorMatch[1] : 'Unknown Author';
    
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';
    
    const durationMatch = html.match(/"duration":\s*(\d+)/);
    const duration_sec = durationMatch ? parseInt(durationMatch[1]) : 0;
    
    const handleMatch = html.match(/@([a-zA-Z0-9_]+)/);
    const author_handle = handleMatch ? handleMatch[1] : '';
    
    const meta = { title, author, description, duration_sec, author_handle, resolved_at: Date.now() };
    
    const cacheHours = 1 + Math.random() * 5;
    const cacheSeconds = Math.floor(cacheHours * 3600);
    await this.env.KV_USERS.put(cacheKey, JSON.stringify(meta), { expirationTtl: cacheSeconds });
    
    return meta;
  }
}
