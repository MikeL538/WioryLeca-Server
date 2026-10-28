import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { isIP } from "node:net";
import { sendEmail } from "./sendEmail.js";
import { validateContact, ValidationError, type ContactMessage } from "./validation.js";
import { createRateLimiter, type RateLimiter } from "./rateLimit.js";

function getOrigin(value: string): string | null {
  try { return new URL(value).origin; } catch { return null; }
}

export function createApp(options: {
  env?: NodeJS.ProcessEnv;
  sender?: (message: ContactMessage) => Promise<void>;
  limiter?: RateLimiter;
} = {}) {
  const env = options.env ?? process.env;
  const sender = options.sender ?? sendEmail;
  const limiter = options.limiter ?? createRateLimiter(env);
  const production = env.NODE_ENV === "production" || env.VERCEL === "1";
  const allowedOrigins = new Set([
    "https://wioryleca-meblenawymiar.pl", "https://www.wioryleca-meblenawymiar.pl",
    env.FRONTEND_BASE_URL ?? "", ...(env.CORS_ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()),
  ].map(getOrigin).filter((s): s is string => !!s));
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    next();
  });
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (!origin) return next(); // Non-browser clients still pass validation and rate limiting.
    const local = !production && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!allowedOrigins.has(origin) && !local) return res.status(403).json({ ok: false, code: "ORIGIN_NOT_ALLOWED" });
    next();
  });
  app.use(cors({ origin: true, methods: ["POST", "OPTIONS"], allowedHeaders: ["Content-Type"], maxAge: 600 }));
  app.get(["/", "/health"], (_req, res) => res.json({ ok: true, service: "Wiory Leca contact API" }));

  app.post("/send-email", (req, res, next) => {
    if (!req.is("application/json")) return res.status(415).json({ ok: false, code: "JSON_REQUIRED" });
    next();
  }, express.json({ limit: "16kb" }), async (req, res) => {
    let message: ContactMessage;
    try { message = validateContact(req.body); }
    catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ ok: false, code: error.code, field: error.field });
      throw error;
    }
    // Trust only Vercel's overwritten header when actually deployed on Vercel.
    const ip = env.VERCEL === "1" ? req.get("x-vercel-forwarded-for") : req.socket.remoteAddress;
    if (!ip || !isIP(ip)) return res.status(503).json({ ok: false, code: "SERVICE_UNAVAILABLE" });
    try {
      const quota = await limiter(ip);
      if (!quota.allowed) return res.set("Retry-After", String(quota.retryAfter)).status(429).json({ ok: false, code: "RATE_LIMITED" });
    } catch {
      console.error("CONTACT_RATE_LIMIT_UNAVAILABLE");
      return res.status(503).json({ ok: false, code: "SERVICE_UNAVAILABLE" });
    }
    try {
      await sender(message);
      return res.json({ ok: true });
    } catch {
      // Never log the body, API credentials or the provider's potentially sensitive response.
      console.error("CONTACT_EMAIL_SEND_FAILED");
      return res.status(502).json({ ok: false, code: "EMAIL_SEND_FAILED" });
    }
  });
  app.use((_req, res) => res.status(404).json({ ok: false, code: "NOT_FOUND" }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error?.type === "entity.too.large" ? 413 : error?.status === 400 ? 400 : error?.status === 415 ? 415 : 500;
    res.status(status).json({ ok: false, code: status === 413 ? "PAYLOAD_TOO_LARGE" : status === 400 ? "INVALID_JSON" : status === 415 ? "UNSUPPORTED_ENCODING" : "INTERNAL_ERROR" });
  };
  app.use(errors);
  return app;
}

export const app = createApp();
export default app;
