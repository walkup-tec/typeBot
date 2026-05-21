import type { SavedFlow } from "../flows/flow.repository";
import { typebotPublicIdFromViewerUrl } from "./typebot-public-id";

const normalizeToken = (value: string): string => value.trim().toLowerCase();

const flowMatchesSourceLabel = (flow: SavedFlow, sourceFlowLabel: string): boolean => {
  const label = normalizeToken(sourceFlowLabel);
  if (label.length < 2) return false;
  const nick = normalizeToken(flow.nickname);
  const disp = normalizeToken(flow.displayLabel ?? "");
  const pidStored = normalizeToken(flow.typebotPublicId ?? "");
  const pidFromUrl = normalizeToken(typebotPublicIdFromViewerUrl(flow.url));
  const urlLower = flow.url.trim().toLowerCase();
  return (
    nick === label ||
    disp === label ||
    pidStored === label ||
    pidFromUrl === label ||
    urlLower.includes(`/${label}`)
  );
};

const humanizeSlug = (slug: string): string => {
  const parts = slug.split("-").filter(Boolean);
  if (parts.length <= 1) return slug;
  const last = parts[parts.length - 1] ?? "";
  const looksLikeSuffixId = /^[a-z0-9]{4,12}$/i.test(last) && parts.length > 2;
  const core = looksLikeSuffixId ? parts.slice(0, -1) : parts;
  return core.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
};

const looksLikeTechnicalSlug = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(trimmed) && trimmed.length >= 12;
};

/** Nome amigável do fluxo para exibir na fila (ex.: "Drax Sistemas" em vez do publicId). */
export const resolveSourceFlowDisplayName = (
  flows: SavedFlow[],
  sourceFlowLabel: string,
): string => {
  const raw = String(sourceFlowLabel ?? "").trim();
  if (!raw) return "";

  const matched = flows.find((flow) => flowMatchesSourceLabel(flow, raw));
  if (matched) {
    const display = String(matched.displayLabel ?? "").trim();
    if (display) return display;
    const nickname = String(matched.nickname ?? "").trim();
    if (nickname && !looksLikeTechnicalSlug(nickname)) return nickname;
    if (nickname) return humanizeSlug(nickname);
  }

  if (looksLikeTechnicalSlug(raw)) return humanizeSlug(raw);
  return raw;
};
