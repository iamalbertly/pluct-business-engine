export async function callTTT(env: any, path: string, init: RequestInit) {
  init.headers = { 
    ...(init.headers || {}), 
    'X-Engine-Auth': env.TTT_SHARED_SECRET 
  };
  
  const url = `${env.TTT_BASE}${path}`;
  const r = await fetch(url, init);
  
  return r;
}
