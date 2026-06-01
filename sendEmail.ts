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
  const trimmedName = name.trim();
  const trimmedContact = contact.trim();
  const trimmedMessage = message.trim();
  const trimmedPreferable = preferable.trim();

  if (trimmedName === "") {
    throw new Error("NAME_REQUIRED");
  }

  if (trimmedName.length > 100) {
    throw new Error("NAME_TOO_LONG");
  }

  if (trimmedContact === "") {
    throw new Error("CONTACT_REQUIRED");
  }

  if (trimmedContact.length > 100) {
    throw new Error("CONTACT_TOO_LONG");
  }

  if (trimmedMessage === "") {
    throw new Error("MESSAGE_REQUIRED");
  }

  if (trimmedMessage.length > 2500) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  if (trimmedPreferable.length > 250) {
    throw new Error("PREFERABLE_TOO_LONG");
  }

  if (!resend) {
    throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  }

  const { error } = await resend.emails.send({
    from: "Wiory Leca <kontakt@wioryleca-meblenawymiar.pl>",
    to: "wiory_leca@wp.pl",
    subject: "Wiadomosc kontaktowa",
    html: `<p><strong>Imie i nazwisko:</strong> ${escapeHtml(trimmedName)}</p>
    <p><strong>Kontakt:</strong> ${escapeHtml(trimmedContact)}</p>
    <p><strong>Wiadomosc:</strong><br>${escapeHtml(trimmedMessage)}</p>
    <p><strong>Preferencje:</strong> ${escapeHtml(trimmedPreferable)}</p>`,
  });

  if (error) {
    console.log("RESEND ERROR:", error);
    throw new Error("VERIFICATION_EMAIL_FAILED");
  }
}
