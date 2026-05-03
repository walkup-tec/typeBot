import nodemailer from "nodemailer";
import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type MailDeliveryResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
};

type MailRuntimeConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  mode: string;
};

let didEnsureEnv = false;

const ensureEnvLoaded = () => {
  if (didEnsureEnv) return;
  didEnsureEnv = true;

  // Tentativa padrão (cwd atual).
  dotenvConfig();

  // Fallback para monorepo (apps/api -> ../../.env).
  if (!process.env.SMTP_HOST) {
    const rootEnv = resolve(process.cwd(), "..", "..", ".env");
    if (existsSync(rootEnv)) {
      dotenvConfig({ path: rootEnv, override: false });
    }
  }
};

const readConfig = (): MailRuntimeConfig => {
  ensureEnvLoaded();
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure = String(process.env.SMTP_SECURE ?? "true")
    .trim()
    .toLowerCase() === "true";
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  const from = String(process.env.MAIL_FROM ?? user).trim();
  const mode = String(process.env.MAIL_MODE ?? "smtp")
    .trim()
    .toLowerCase();
  return { host, port, secure, user, pass, from, mode };
};

const isSmtpConfigured = (cfg: MailRuntimeConfig): boolean =>
  Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from && cfg.mode === "smtp");

const buildTextFromHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .trim();

export const mailService = {
  isConfigured(): boolean {
    const cfg = readConfig();
    return isSmtpConfigured(cfg);
  },

  async send(payload: MailPayload): Promise<MailDeliveryResult> {
    const cfg = readConfig();
    if (!isSmtpConfigured(cfg)) {
      throw new Error("Serviço de e-mail não configurado.");
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
    });

    const info = await transporter.sendMail({
      from: cfg.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text?.trim() || buildTextFromHtml(payload.html),
    });
    return {
      messageId: String(info.messageId ?? ""),
      accepted: Array.isArray(info.accepted) ? info.accepted.map((item) => String(item)) : [],
      rejected: Array.isArray(info.rejected) ? info.rejected.map((item) => String(item)) : [],
      response: String(info.response ?? ""),
    };
  },
};
