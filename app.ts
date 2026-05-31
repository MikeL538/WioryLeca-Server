import "dotenv/config";
import express from "express";
import cors from "cors";
import { sendEmail } from "./sendEmail.js";

export const app = express();

export const API_BASE_URL = process.env.API_BASE_URL || "";

export const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "https://wioryleca-meblenawymiar.pl/";

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
    "https://wioryleca-meblenawymiar.pl/",
    getOrigin(FRONTEND_BASE_URL),
  ].filter((origin): origin is string => Boolean(origin)),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
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
  const { contact, message, preferable } = req.body;

  if (!contact || !message || !preferable) {
    return res.status(400).json({
      ok: false,
      message: "Missing required fields",
    });
  }

  try {
    await sendEmail(String(contact), String(message), String(preferable));

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
