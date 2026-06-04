import { mailService } from "./mail.service";
import { buildTenantWelcomeTemplate } from "./mail.templates";

export type EmailDeliveryResult = {
  status: "sent" | "failed" | "skipped";
  message?: string;
};

const SYSTEM_LOGIN_URL = String(process.env.SYSTEM_LOGIN_URL ?? "http://localhost:5173").trim();

export const deliverTenantWelcomeEmail = async (input: {
  ownerEmail: string;
  recipientName: string;
  initialPassword: string;
}): Promise<EmailDeliveryResult> => {
  const ownerEmail = input.ownerEmail.trim();
  if (!ownerEmail) {
    return { status: "skipped", message: "Assinante sem e-mail." };
  }
  if (!mailService.isConfigured()) {
    return { status: "skipped", message: "SMTP não configurado na API (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_MODE=smtp)." };
  }

  const recipientName = String(input.recipientName || ownerEmail).trim();
  const mail = buildTenantWelcomeTemplate({
    recipientName,
    tenantName: recipientName,
    ownerEmail,
    initialPassword: input.initialPassword,
    loginUrl: SYSTEM_LOGIN_URL,
  });

  try {
    const delivery = await mailService.send({
      to: ownerEmail,
      subject: mail.subject,
      html: mail.html,
    });
    const acceptedRecipients = delivery.accepted.map((item) => item.trim().toLowerCase());
    const expectedRecipient = ownerEmail.toLowerCase();
    if (acceptedRecipients.includes(expectedRecipient)) {
      return {
        status: "sent",
        message: `SMTP accepted. messageId=${delivery.messageId || "n/a"}`,
      };
    }
    return {
      status: "failed",
      message: `SMTP não confirmou aceitação do destinatário. messageId=${delivery.messageId || "n/a"} response=${delivery.response || "n/a"}`,
    };
  } catch (emailError) {
    const reason = emailError instanceof Error ? emailError.message : "Falha no envio SMTP.";
    // eslint-disable-next-line no-console
    console.error("Falha ao enviar e-mail de boas-vindas do assinante:", emailError);
    return { status: "failed", message: reason };
  }
};
