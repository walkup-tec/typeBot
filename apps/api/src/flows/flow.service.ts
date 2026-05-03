import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { FlowRepository } from "./flow.repository";
import { getFlowLibraryItem } from "./flow-library.repository";

export const createFlowSchema = z.object({
  nickname: z.string().min(2).max(120),
  url: z.string().url().max(2048),
  displayLabel: z.string().min(2).max(120).optional(),
  librarySourceId: z.string().min(2).max(80).optional(),
  redirectTheme: z
    .object({
      pageBg: z.string().min(4).max(20).optional(),
      chatBg: z.string().min(4).max(20).optional(),
      userBubbleBg: z.string().min(4).max(20).optional(),
      botBubbleBg: z.string().min(4).max(20).optional(),
      profileImageUrl: z.string().url().max(2048).optional(),
    })
    .optional(),
});

export const updateFlowDisplayLabelSchema = z.object({
  displayLabel: z.string().min(2).max(120),
});

export const createFlowFromLibrarySchema = z.object({
  libraryItemId: z.string().min(2).max(80),
});

export const updateFlowThemeSchema = z.object({
  redirectTheme: z
    .object({
      pageBg: z.string().min(4).max(20).optional(),
      chatBg: z.string().min(4).max(20).optional(),
      userBubbleBg: z.string().min(4).max(20).optional(),
      botBubbleBg: z.string().min(4).max(20).optional(),
      profileImageUrl: z.string().url().max(2048).optional(),
    })
    .optional(),
});

const shareCodeAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

const generateUniqueShareCode = (repository: FlowRepository): string => {
  for (let attempt = 0; attempt < 24; attempt++) {
    const buf = randomBytes(10);
    let code = "";
    for (let i = 0; i < 8; i++) code += shareCodeAlphabet[buf[i] % shareCodeAlphabet.length];
    if (!repository.findByShortShareCode(code)) return code;
  }
  return randomUUID().replace(/-/g, "").slice(0, 10);
};

export class FlowService {
  constructor(private readonly flowRepository: FlowRepository) {}

  listByTenant(tenantId: string) {
    return this.flowRepository.listByTenant(tenantId);
  }

  create(tenantId: string, input: z.infer<typeof createFlowSchema>) {
    const current = this.flowRepository.listByTenant(tenantId);
    if (current.some((flow) => flow.url === input.url.trim())) {
      throw new Error("Esse fluxo já está salvo para este assinante.");
    }

    const displayLabel = input.displayLabel?.trim() || input.nickname.trim();

    return this.flowRepository.create({
      id: randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      nickname: input.nickname.trim(),
      displayLabel,
      url: input.url.trim(),
      librarySourceId: input.librarySourceId,
      redirectTheme: input.redirectTheme,
    });
  }

  createFromLibrary(tenantId: string, input: z.infer<typeof createFlowFromLibrarySchema>) {
    const item = getFlowLibraryItem(input.libraryItemId.trim());
    if (!item) {
      throw new Error("Item da biblioteca não encontrado.");
    }
    return this.create(tenantId, {
      nickname: item.suggestedNickname.trim(),
      url: item.viewerUrl.trim(),
      displayLabel: item.title.trim(),
      librarySourceId: item.id,
    });
  }

  updateDisplayLabel(flowId: string, input: z.infer<typeof updateFlowDisplayLabelSchema>) {
    return this.flowRepository.updateById(flowId, {
      displayLabel: input.displayLabel.trim(),
    });
  }

  ensureShortShareCode(flowId: string) {
    const flow = this.flowRepository.getById(flowId);
    if (!flow) return null;
    if (flow.shortShareCode) return flow;
    const code = generateUniqueShareCode(this.flowRepository);
    return this.flowRepository.updateById(flowId, { shortShareCode: code });
  }

  updateTheme(flowId: string, input: z.infer<typeof updateFlowThemeSchema>) {
    const existing = this.flowRepository.getById(flowId);
    if (!existing) return null;
    const patch = input.redirectTheme;
    if (!patch) return existing;
    const mergedTheme = { ...existing.redirectTheme, ...patch };
    return this.flowRepository.updateById(flowId, {
      redirectTheme: mergedTheme,
    });
  }

  remove(flowId: string) {
    return this.flowRepository.removeById(flowId);
  }
}
