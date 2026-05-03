import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { listSystemMasterLibrary } from "./system-master-library.repository";
import { getDataFilePath } from "../lib/data-path";

export interface FlowLibraryItem {
  id: string;
  title: string;
  description: string;
  suggestedNickname: string;
  viewerUrl: string;
}

const LIBRARY_PATH = getDataFilePath("flow-library.json");

export const loadFlowLibrary = (): FlowLibraryItem[] => {
  const folder = dirname(LIBRARY_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(LIBRARY_PATH)) return [];
  try {
    const raw = readFileSync(LIBRARY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as FlowLibraryItem[];
    const fileItems = Array.isArray(parsed) ? parsed : [];
    const systemItems: FlowLibraryItem[] = listSystemMasterLibrary()
      .filter((item) => item.isSystemDefault)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        suggestedNickname: item.suggestedNickname,
        viewerUrl: item.viewerUrl,
      }));
    const merged = [...systemItems, ...fileItems];
    const byId = new Map<string, FlowLibraryItem>();
    for (const item of merged) byId.set(item.id, item);
    return [...byId.values()];
  } catch {
    return listSystemMasterLibrary()
      .filter((item) => item.isSystemDefault)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        suggestedNickname: item.suggestedNickname,
        viewerUrl: item.viewerUrl,
      }));
  }
};

export const getFlowLibraryItem = (id: string): FlowLibraryItem | null => {
  return loadFlowLibrary().find((item) => item.id === id) ?? null;
};
