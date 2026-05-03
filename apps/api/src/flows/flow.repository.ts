import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

export interface SavedFlow {
  id: string;
  tenantId: string;
  createdAt: string;
  /** Apelido técnico / roteamento (Typebot sourceFlowLabel); não editável pelo painel. */
  nickname: string;
  /** Nome exibido no front (editável pelo assinante master). */
  displayLabel?: string;
  /** Alias / publicId do Typebot (último segmento da URL do viewer); preenchido na listagem da Biblioteca Master. */
  typebotPublicId?: string;
  /** Id interno do typebot na Builder API (para deduplicar fluxos criados manualmente no workspace). */
  typebotRemoteId?: string;
  url: string;
  /** Código curto global para `/r/:code` → redireciona para `url` (divulgação). */
  shortShareCode?: string;
  /** Id do item da biblioteca de origem, se aplicável. */
  librarySourceId?: string;
  redirectTheme?: {
    pageBg?: string;
    chatBg?: string;
    userBubbleBg?: string;
    botBubbleBg?: string;
    profileImageUrl?: string;
  };
}

const FLOWS_FILE_PATH = getDataFilePath("saved-flows.json");

const ensureStorage = () => {
  const folder = dirname(FLOWS_FILE_PATH);
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
  if (!existsSync(FLOWS_FILE_PATH)) {
    writeFileSync(FLOWS_FILE_PATH, "[]", "utf-8");
  }
};

const loadPersistedFlows = (): SavedFlow[] => {
  ensureStorage();
  try {
    const raw = readFileSync(FLOWS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SavedFlow[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const savePersistedFlows = (flows: SavedFlow[]) => {
  ensureStorage();
  writeFileSync(FLOWS_FILE_PATH, JSON.stringify(flows, null, 2), "utf-8");
};

export class FlowRepository {
  private flows: SavedFlow[] = [];

  constructor() {
    this.flows = loadPersistedFlows();
  }

  listByTenant(tenantId: string): SavedFlow[] {
    return this.flows.filter((flow) => flow.tenantId === tenantId);
  }

  listAll(): SavedFlow[] {
    return [...this.flows];
  }

  getById(id: string): SavedFlow | null {
    return this.flows.find((flow) => flow.id === id) ?? null;
  }

  findByShortShareCode(code: string): SavedFlow | null {
    const normalized = code.trim().toLowerCase();
    return this.flows.find((flow) => flow.shortShareCode?.toLowerCase() === normalized) ?? null;
  }

  create(input: SavedFlow): SavedFlow {
    this.flows.push(input);
    savePersistedFlows(this.flows);
    return input;
  }

  updateById(id: string, patch: Partial<SavedFlow>): SavedFlow | null {
    const index = this.flows.findIndex((flow) => flow.id === id);
    if (index < 0) return null;
    const updated = { ...this.flows[index], ...patch };
    this.flows[index] = updated;
    savePersistedFlows(this.flows);
    return updated;
  }

  removeById(id: string): SavedFlow | null {
    const index = this.flows.findIndex((flow) => flow.id === id);
    if (index < 0) return null;
    const [removed] = this.flows.splice(index, 1);
    savePersistedFlows(this.flows);
    return removed;
  }
}
