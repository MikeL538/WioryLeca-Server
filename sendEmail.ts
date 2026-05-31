import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendEmail(
  name: string,
  contact: string,
  message: string,
  preferable: string,
) {
  if (!resend) {
    throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  }

  const { error } = await resend.emails.send({
    from: "Wiory Leca <kontakt@wioryleca-meblenawymiar.pl>",
    to: "mikel538.work@gmail.com",
    subject: "Wiadomosc kontaktowa",
    html: `<p><strong>Imie i nazwisko:</strong> ${escapeHtml(name)}</p>
    <p><strong>Kontakt:</strong> ${escapeHtml(contact)}</p>
    <p><strong>Wiadomosc:</strong><br>${escapeHtml(message)}</p>
    <p><strong>Preferencje:</strong> ${escapeHtml(preferable)}</p>`,
  });

  if (error) {
    console.log("RESEND ERROR:", error);
    throw new Error("VERIFICATION_EMAIL_FAILED");
  }
}
