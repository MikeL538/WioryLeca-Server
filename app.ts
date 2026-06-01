import "dotenv/config";
import express from "express";
import cors from "cors";
import { sendEmail } from "./sendEmail.js";

export const app = express();

export const API_BASE_URL = process.env.API_BASE_URL || "";

export const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "https://wioryleca-meblenawymiar.pl/";

const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || "";

function getOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const allowedOrigins = new Set(
  [
    "http://localhost:5174",
    "https://wioryleca-meblenawymiar.pl",
    FRONTEND_BASE_URL,
    ...CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
  ]
    .map(getOrigin)
    .filter((origin): origin is string => Boolean(origin)),
);

app.use(
  cors({
    origin: (origin, callback) => {
      const isLocalDevOrigin =
        origin?.startsWith("http://localhost:") ||
        origin?.startsWith("http://127.0.0.1:");

      if (!origin || allowedOrigins.has(origin) || isLocalDevOrigin) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "WioryLecą Meblenawymiar server is running",
    message: "WioryLecą Meblenawymiar server is running",
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "WioryLecą Meblenawymiar server is running",
    message: "WioryLecą Meblenawymiar server is running",
  });
});

app.post("/send-email", async (req, res) => {
  const { name, contact, message, preferable } = req.body;

  if (!name || !contact || !message) {
    return res.status(400).json({
      ok: false,
      message: "Missing required fields",
    });
  }

  try {
    await sendEmail(
      String(name),
      String(contact),
      String(message),
      preferable == null ? "" : String(preferable),
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.log("SEND EMAIL ERROR:", error);

    return res.status(500).json({
      ok: false,
      message: "Email could not be sent",
    });
  }
});

export default app;
