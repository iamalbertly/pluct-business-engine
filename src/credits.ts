export async function getCredits(env: any, userId: string) {
  const v = await env.KV_USERS.get(`credits:${userId}`);
  return parseInt(v || '0', 10);
}

export async function addCredits(env: any, userId: string, amount: number) {
  const cur = await getCredits(env, userId);
  await env.KV_USERS.put(`credits:${userId}`, String(cur + amount));
}

export async function spendCredit(env: any, userId: string) {
  const cur = await getCredits(env, userId);
  if (cur <= 0) throw new Error('no_credits');
  await env.KV_USERS.put(`credits:${userId}`, String(cur - 1));
}
