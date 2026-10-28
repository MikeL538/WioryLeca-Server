import { createHash } from "node:crypto";

export type LimitResult = { allowed: boolean; retryAfter: number };
export type RateLimiter = (ip: string) => Promise<LimitResult>;
const IP_LIMIT = 5;
const IP_WINDOW = 15 * 60;
const GLOBAL_LIMIT = 50;
const GLOBAL_WINDOW = 60 * 60;

// Development only. Production must share counters between serverless instances.
export function memoryLimiter(now = Date.now): RateLimiter {
  const entries = new Map<string, { count: number; expires: number }>();
  return async ip => {
    const time = now();
    for (const [key, entry] of entries) if (entry.expires <= time) entries.delete(key);
    const rules = [[`ip:${ip}`, IP_LIMIT, IP_WINDOW], ["global", GLOBAL_LIMIT, GLOBAL_WINDOW]] as const;
    let retryAfter = 0;
    for (const [key, limit] of rules) {
      const entry = entries.get(key);
      if (entry && entry.count >= limit) retryAfter = Math.max(retryAfter, Math.ceil((entry.expires - time) / 1000));
    }
    if (retryAfter) return { allowed: false, retryAfter };
    for (const [key, , seconds] of rules) {
      const entry = entries.get(key) ?? { count: 0, expires: time + seconds * 1000 };
      entry.count++;
      entries.set(key, entry);
    }
    return { allowed: true, retryAfter: 0 };
  };
}

// Check and consume both quotas atomically. Denied requests do not extend the window.
export const quotaScript = `
local retry = 0
for i = 1, 2 do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count >= tonumber(ARGV[(i - 1) * 2 + 1]) then
    retry = math.max(retry, redis.call('TTL', KEYS[i]), 1)
  end
end
if retry > 0 then return {0, retry} end
for i = 1, 2 do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('EXPIRE', KEYS[i], ARGV[i * 2]) end
end
return {1, 0}`;

export function createRateLimiter(env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): RateLimiter {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const production = env.NODE_ENV === "production" || env.VERCEL === "1";
  if (!url && !token && !production) return memoryLimiter();
  return async ip => {
    // Fail closed on missing configuration or store failure, never silently use local counters on Vercel.
    if (!url || !token || new URL(url).protocol !== "https:") throw new Error("RATE_LIMIT_UNAVAILABLE");
    const digest = createHash("sha256").update(ip).digest("hex");
    const response = await request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", quotaScript, "2", `contact:{quota}:ip:${digest}`, "contact:{quota}:global", String(IP_LIMIT), String(IP_WINDOW), String(GLOBAL_LIMIT), String(GLOBAL_WINDOW)]),
      signal: AbortSignal.timeout(2500),
      redirect: "error",
    });
    if (!response.ok) throw new Error("RATE_LIMIT_UNAVAILABLE");
    const data = await response.json() as { result?: unknown; error?: unknown };
    const result = data.result;
    if (data.error || !Array.isArray(result) || result.length !== 2 || ![0, 1].includes(result[0]) || !Number.isInteger(result[1]) || result[1] < 0) throw new Error("RATE_LIMIT_UNAVAILABLE");
    return { allowed: result[0] === 1, retryAfter: Math.max(1, result[1]) };
  };
}
