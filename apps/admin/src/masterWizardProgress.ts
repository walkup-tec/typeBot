export type MasterWizardConfirmedSteps = {
  step2?: true;
  step3?: true;
  step4?: true;
  step5?: true;
};

export type MasterWizardConfirmedByTenant = Record<string, MasterWizardConfirmedSteps>;

export const MASTER_WIZARD_CONFIRMED_STORAGE_KEY = "master-wizard-confirmed-by-tenant";
export const LEGACY_STEP2_CONFIRMED_STORAGE_KEY = "master-step2-confirmed-by-tenant";

export function loadMasterWizardConfirmedByTenant(): MasterWizardConfirmedByTenant {
  const merged: MasterWizardConfirmedByTenant = {};
  try {
    const raw = localStorage.getItem(MASTER_WIZARD_CONFIRMED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MasterWizardConfirmedByTenant;
      if (parsed && typeof parsed === "object") {
        Object.assign(merged, parsed);
      }
    }
  } catch {
    // ignore
  }
  try {
    const legacyRaw = localStorage.getItem(LEGACY_STEP2_CONFIRMED_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Record<string, true>;
      if (legacy && typeof legacy === "object") {
        for (const [tenantId, value] of Object.entries(legacy)) {
          if (value === true) {
            merged[tenantId] = { ...merged[tenantId], step2: true };
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return merged;
}

export function persistMasterWizardConfirmedByTenant(map: MasterWizardConfirmedByTenant): void {
  try {
    localStorage.setItem(MASTER_WIZARD_CONFIRMED_STORAGE_KEY, JSON.stringify(map));
    const legacyStep2: Record<string, true> = {};
    for (const [tenantId, steps] of Object.entries(map)) {
      if (steps.step2) legacyStep2[tenantId] = true;
    }
    localStorage.setItem(LEGACY_STEP2_CONFIRMED_STORAGE_KEY, JSON.stringify(legacyStep2));
  } catch {
    // ignore
  }
}

export function confirmMasterWizardStep(
  map: MasterWizardConfirmedByTenant,
  tenantId: string,
  step: 2 | 3 | 4 | 5,
): MasterWizardConfirmedByTenant {
  const key = step === 2 ? "step2" : step === 3 ? "step3" : step === 4 ? "step4" : "step5";
  return {
    ...map,
    [tenantId]: { ...map[tenantId], [key]: true },
  };
}

export type MasterWizardStepIndex = 1 | 2 | 3 | 4 | 5 | 6;

export type MasterWizardStepCompletion = {
  step1: boolean;
  step2: boolean;
  step3: boolean;
  step4: boolean;
  step5: boolean;
  step6: boolean;
};

/** Primeira etapa ainda não concluída (etapa “atual” de trabalho). */
export function resolveFirstIncompleteWizardStep(completion: MasterWizardStepCompletion): MasterWizardStepIndex {
  const order: MasterWizardStepIndex[] = [1, 2, 3, 4, 5, 6];
  for (const step of order) {
    if (!completion[`step${step}` as keyof MasterWizardStepCompletion]) return step;
  }
  return 6;
}

/** Até qual etapa o usuário pode navegar (inclui a etapa atual incompleta). */
export function resolveWizardUnlockedStep(completion: MasterWizardStepCompletion): MasterWizardStepIndex {
  return resolveFirstIncompleteWizardStep(completion);
}

export function isMasterConsoleFullyConfigured(input: {
  tenantId: string;
  step1Completed: boolean;
  step2Completed: boolean;
  flowsStepCompleted: boolean;
  confirmedByTenant: MasterWizardConfirmedByTenant;
}): boolean {
  if (!input.tenantId || !input.step1Completed || !input.step2Completed || !input.flowsStepCompleted) {
    return false;
  }
  const progress = input.confirmedByTenant[input.tenantId];
  return Boolean(progress?.step3 && progress?.step4 && progress?.step5);
}
