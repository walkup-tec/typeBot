import { mailService } from "./mail.service";
import { buildWelcomeCredentialsTemplate } from "./mail.templates";
import type { EmailDeliveryResult } from "./tenant-welcome-delivery";

const SYSTEM_LOGIN_URL = String(process.env.SYSTEM_LOGIN_URL ?? "http://localhost:5173").trim();

export const deliverAttendantWelcomeEmail = async (input: {
  toEmail: string;
  recipientName: string;
  userIdentifier: string;
  password: string;
  createdByLabel: string;
}): Promise<EmailDeliveryResult> => {
  const toEmail = input.toEmail.trim().toLowerCase();
  if (!toEmail) {
    return { status: "skipped", message: "Atendente sem e-mail cadastrado." };
  }
  if (!mailService.isConfigured()) {
    return {
      status: "skipped",
      message: "SMTP não configurado na API (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_MODE=smtp).",
    };
  }

  const mail = buildWelcomeCredentialsTemplate({
    recipientName: input.recipientName.trim() || toEmail,
    userIdentifier: input.userIdentifier.trim() || toEmail,
    password: input.password,
    loginUrl: SYSTEM_LOGIN_URL,
    createdByLabel: input.createdByLabel.trim() || "Walkup",
  });

  try {
    const delivery = await mailService.send({
      to: toEmail,
      subject: mail.subject,
      html: mail.html,
    });
    const acceptedRecipients = delivery.accepted.map((item) => item.trim().toLowerCase());
    if (acceptedRecipients.includes(toEmail)) {
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
    console.error("Falha ao enviar e-mail de boas-vindas do atendente:", emailError);
    return { status: "failed", message: reason };
  }
};
