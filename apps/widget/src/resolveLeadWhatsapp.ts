export type LeadWhatsappContext = Record<string, string | number | boolean> | undefined;

const WHATSAPP_CONTEXT_KEYS = ["WhatsApp", "Whatsapp", "whatsapp", "telefone", "celular", "phone", "fone"];

export const resolveLeadWhatsapp = (
  leadWhatsapp: string | undefined,
  leadContext?: LeadWhatsappContext,
): string => {
  const direct = String(leadWhatsapp ?? "").trim();
  if (direct) return direct;
  if (!leadContext) return "";

  for (const key of WHATSAPP_CONTEXT_KEYS) {
    const value = String(leadContext[key] ?? "").trim();
    if (value) return value;
  }

  for (const [key, value] of Object.entries(leadContext)) {
    const normalized = key.trim().toLowerCase();
    if (!WHATSAPP_CONTEXT_KEYS.includes(normalized)) continue;
    const resolved = String(value ?? "").trim();
    if (resolved) return resolved;
  }

  return "";
};
