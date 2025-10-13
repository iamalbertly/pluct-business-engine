export async function resolveMeta(env: any, url: string) {
  // Check cache first
  const cacheKey = `meta:${url}`;
  const cached = await env.KV_USERS.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Parse TikTok page (server-side)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = await response.text();
    
    // Extract metadata from TikTok page
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'Unknown Title';
    
    // Extract author from meta tags or JSON-LD
    const authorMatch = html.match(/"author":\s*"([^"]+)"/) || 
                       html.match(/<meta property="og:site_name" content="([^"]+)"/);
    const author = authorMatch ? authorMatch[1] : 'Unknown Author';
    
    // Extract description
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';
    
    // Extract duration (if available)
    const durationMatch = html.match(/"duration":\s*(\d+)/);
    const duration_sec = durationMatch ? parseInt(durationMatch[1]) : 0;
    
    // Extract author handle
    const handleMatch = html.match(/@([a-zA-Z0-9_]+)/);
    const author_handle = handleMatch ? handleMatch[1] : '';
    
    const meta = {
      title,
      author,
      description,
      duration_sec,
      author_handle
    };
    
    // Cache for 1-6 hours (randomized to prevent thundering herd)
    const cacheHours = 1 + Math.random() * 5; // 1-6 hours
    const cacheSeconds = Math.floor(cacheHours * 3600);
    
    await env.KV_USERS.put(cacheKey, JSON.stringify(meta), {
      expirationTtl: cacheSeconds
    });
    
    return meta;
  } catch (error) {
    console.error('Error resolving metadata:', error);
    return {
      title: 'Error',
      author: 'Unknown',
      description: 'Failed to resolve metadata',
      duration_sec: 0,
      author_handle: ''
    };
  }
}
