export type StatusToastTone = "success" | "error" | "info";

const ERROR_PATTERNS: RegExp[] = [
  /\bfalha\b/i,
  /\berro\b/i,
  /\bfalhou\b/i,
  /n[aã]o foi poss[ií]vel/i,
  /imposs[ií]vel/i,
  /indispon[ií]vel/i,
  /inv[aá]lid/i,
  /\bausente\b/i,
  /n[aã]o confere/i,
  /n[aã]o encontrad/i,
  /sem liga[cç][aã]o/i,
  /^informe\b/i,
  /^preencha\b/i,
  /^selecione\b/i,
  /precisa ter no m[ií]nimo/i,
  /use pelo menos/i,
  /mas o envio de e-mail falhou/i,
  /configure typebot/i,
];

const SUCCESS_PATTERNS: RegExp[] = [
  /\bsucesso\b/i,
  /bem-vindo/i,
  /\bcopiado\b/i,
  /lista atualizada/i,
  /lista de fluxos atualizada/i,
  /atualizad[oa]s?\b/i,
  /cadastrad[oa]s?\b/i,
  /\bsalv[oa]\b/i,
  /inclu[ií]d[oa]/i,
  /removid[oa]/i,
  /encerrada/i,
  /definid[oa]/i,
  /importad[oa]/i,
  /republicad[oa]/i,
  /criad[oa]/i,
  /assumid[oa]/i,
  /adicionad[oa]/i,
  /ativad[oa]/i,
  /redefinid[oa]/i,
  /e-mail enviado/i,
  /conclu[ií]d[oa]/i,
  /sincroniza[cç][aã]o:/i,
  /prioridade (adicionada|atualizada|removida)/i,
  /etiqueta (criada|atualizada|removida)/i,
  /configura[cç][aã]o do kanban salva/i,
  /fluxo padr[aã]o inclu[ií]do/i,
  /fluxo salvo/i,
  /fluxo definido/i,
  /atendente cadastrado/i,
  /atendente removido/i,
  /assinante criado/i,
  /assinante atualizado/i,
  /status atualizado/i,
  /atendimento assumido/i,
  /op[cç][aã]o atualizada/i,
  /fluxo adicionado/i,
  /fluxo inclu[ií]do/i,
  /fluxo removido/i,
];

/** Classifica o tom visual do toast: verde (sucesso), vermelho (erro) ou neutro (info). */
export function resolveStatusToastTone(message: string): StatusToastTone {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "info";

  if (ERROR_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "error";
  }

  if (SUCCESS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "success";
  }

  return "info";
}
