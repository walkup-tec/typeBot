import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

export interface SystemMasterLibraryItem {
  id: string;
  sourceFlowId: string;
  title: string;
  description: string;
  suggestedNickname: string;
  viewerUrl: string;
  isSystemDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const FILE_PATH = getDataFilePath("system-master-library.json");

const ensureStorage = () => {
  const folder = dirname(FILE_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(FILE_PATH)) writeFileSync(FILE_PATH, "[]", "utf-8");
};

const loadAll = (): SystemMasterLibraryItem[] => {
  ensureStorage();
  try {
    const raw = readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SystemMasterLibraryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveAll = (rows: SystemMasterLibraryItem[]) => {
  ensureStorage();
  writeFileSync(FILE_PATH, JSON.stringify(rows, null, 2), "utf-8");
};

export const listSystemMasterLibrary = (): SystemMasterLibraryItem[] => loadAll();

export const getSystemMasterLibraryBySourceFlowId = (sourceFlowId: string): SystemMasterLibraryItem | null => {
  return loadAll().find((row) => row.sourceFlowId === sourceFlowId) ?? null;
};

export const getSystemMasterLibraryById = (id: string): SystemMasterLibraryItem | null => {
  return loadAll().find((row) => row.id === id) ?? null;
};

export const upsertSystemMasterLibrary = (
  input: Omit<SystemMasterLibraryItem, "createdAt" | "updatedAt"> & { createdAt?: string },
): SystemMasterLibraryItem => {
  const rows = loadAll();
  const now = new Date().toISOString();
  const index = rows.findIndex((row) => row.id === input.id || row.sourceFlowId === input.sourceFlowId);
  const nextRow: SystemMasterLibraryItem = {
    ...input,
    createdAt: index >= 0 ? rows[index].createdAt : input.createdAt ?? now,
    updatedAt: now,
  };
  if (index >= 0) rows[index] = nextRow;
  else rows.push(nextRow);
  saveAll(rows);
  return nextRow;
};

export const removeSystemMasterLibraryById = (id: string): boolean => {
  const rows = loadAll();
  const next = rows.filter((row) => row.id !== id);
  if (next.length === rows.length) return false;
  saveAll(next);
  return true;
};
