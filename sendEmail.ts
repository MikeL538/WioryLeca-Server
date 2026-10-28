import { Resend } from "resend";
import type { CreateEmailOptions } from "resend";
import { validateContact, type ContactMessage } from "./validation.js";

type MailClient = { emails: { send: (email: CreateEmailOptions) => Promise<{ data: { id: string } | null; error: unknown }> } };
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function createEmailSender(client: MailClient | null) {
  return async (input: ContactMessage): Promise<void> => {
    const message = validateContact(input);
    if (!client) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
    const rows = [
      ["Imię i nazwisko", message.name], ["Lokalizacja", message.localization],
      ["Kontakt", message.contact], ["Wiadomość", message.message], ["Preferencje", message.preferable],
    ];
    const replyTo = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(message.contact) ? message.contact : undefined;
    const { data, error } = await client.emails.send({
      from: "Wióry Lecą <kontakt@wioryleca-meblenawymiar.pl>",
      to: "wiory_leca@wp.pl",
      subject: "Zapytanie ze strony Wióry Lecą",
      ...(replyTo ? { replyTo } : {}),
      html: rows.map(([label, value]) => `<p><strong>${label}:</strong><br>${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p>`).join("\n"),
      text: rows.map(([label, value]) => `${label}:\n${value}`).join("\n\n"),
    });
    if (error || !data?.id) throw new Error("EMAIL_SEND_FAILED");
  };
}

// Lazy initialization also makes importing the application safe in tests without credentials.
export async function sendEmail(input: ContactMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  await createEmailSender(key ? new Resend(key) : null)(input);
}
