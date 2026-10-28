export const fieldLimits = { name: 100, localization: 100, contact: 100, message: 2500, preferable: 250 } as const;
export type ContactMessage = Record<keyof typeof fieldLimits, string>;
export class ValidationError extends Error {
  constructor(public field: string, public code: string) { super(code); }
}

export function validateContact(body: unknown): ContactMessage {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("body", "INVALID_BODY");
  const input = body as Record<string, unknown>;
  const result = {} as ContactMessage;
  for (const field of Object.keys(fieldLimits) as (keyof ContactMessage)[]) {
    const value = input[field];
    if (field === "preferable" && value === undefined) { result[field] = ""; continue; }
    if (typeof value !== "string") throw new ValidationError(field, "INVALID_TYPE");
    const trimmed = value.trim();
    if (field !== "preferable" && !trimmed) throw new ValidationError(field, "REQUIRED");
    if (trimmed.length > fieldLimits[field]) throw new ValidationError(field, "TOO_LONG");
    result[field] = trimmed;
  }
  return result;
}
