import { attendantRepository } from "../lib/repositories";
import {
  allowSystemMasterEnsureOnBoot,
  ensureSystemMasterAuth,
  shouldResetSystemMasterPasswordOnBoot,
} from "../auth/system-master-auth";

export async function ensureSystemMasterAuthIfConfigured(): Promise<void> {
  if (!allowSystemMasterEnsureOnBoot()) return;

  await attendantRepository.reloadFromStorage();
  const password = String(process.env.API_SYSTEM_MASTER_PASSWORD ?? "").trim();
  if (password.length < 4) {
    // eslint-disable-next-line no-console
    console.warn("[auth] API_ENSURE_SYSTEM_MASTER: defina API_SYSTEM_MASTER_PASSWORD (mín. 4 caracteres).");
    return;
  }

  const attendant = ensureSystemMasterAuth(password, {
    resetExistingPassword: shouldResetSystemMasterPasswordOnBoot(),
  });
  if (!attendant) {
    // eslint-disable-next-line no-console
    console.error("[auth] API_ENSURE_SYSTEM_MASTER: não foi possível garantir o Master do Sistema.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log("[auth] Master do Sistema garantido via API_ENSURE_SYSTEM_MASTER.");
}
