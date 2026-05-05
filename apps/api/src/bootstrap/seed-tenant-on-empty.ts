import { attendantRepository, flowRepository, queueRepository, tenantRepository } from "../lib/repositories";
import { TenantService } from "../tenants/tenant.service";

/**
 * Quando `tenants.json` e `attendants.json` estão vazios (ex.: novo contentor sem volume),
 * cria um assinante + master a partir de variáveis de ambiente.
 *
 * Segurança: só ativa com `API_SEED_ON_EMPTY=true`. Em produção o ideal é `DATABASE_URL`
 * (Postgres para tenants/attendants) ou volume em `apps/api/data`; não uses senha fraca em env.
 */
export async function seedTenantOnEmptyIfConfigured(): Promise<void> {
  if (String(process.env.API_SEED_ON_EMPTY ?? "").trim().toLowerCase() !== "true") return;

  await attendantRepository.reloadFromStorage();
  const tenants = tenantRepository.list();
  const attendantCount = attendantRepository.countAll();

  if (tenants.length > 0 || attendantCount > 0) return;

  const ownerEmail = String(process.env.API_SEED_OWNER_EMAIL ?? "").trim();
  const password = String(process.env.API_SEED_OWNER_PASSWORD ?? "").trim();
  const rawName = String(process.env.API_SEED_TENANT_NAME ?? "Assinante").trim();
  const rawWhatsapp = String(process.env.API_SEED_WHATSAPP ?? "5500000000000").trim();

  if (!ownerEmail || password.length < 4) {
    // eslint-disable-next-line no-console
    console.warn(
      "[API_SEED_ON_EMPTY] Ignorado: defina API_SEED_OWNER_EMAIL e API_SEED_OWNER_PASSWORD (mín. 4 caracteres).",
    );
    return;
  }

  const tenantName = rawName.length >= 2 ? rawName : "Assinante";
  const whatsapp = rawWhatsapp.length >= 8 && rawWhatsapp.length <= 30 ? rawWhatsapp : "5500000000000";

  try {
    const svc = new TenantService(tenantRepository, attendantRepository, flowRepository, queueRepository);
    svc.create({
      name: tenantName,
      ownerEmail,
      whatsapp,
      initialPassword: password,
    });
    // eslint-disable-next-line no-console
    console.log("[API_SEED_ON_EMPTY] Assinante e master criados (base estava vazia).");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[API_SEED_ON_EMPTY] Falha ao criar assinante inicial:", e);
  }
}
