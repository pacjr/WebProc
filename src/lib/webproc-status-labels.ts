import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";

export const PROCESSO_STATUS_LABELS: Record<ProcessoStatus, string> = {
  EM_PREENCHIMENTO: "Em preenchimento",
  PENDENTE: "Pendente",
  IMPORTADO: "Importado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const PROCESSO_STATUS_ORDER: ProcessoStatus[] = [
  "EM_PREENCHIMENTO",
  "PENDENTE",
  "IMPORTADO",
  "CONCLUIDO",
  "CANCELADO",
];

export function processoStatusLabel(status: string): string {
  return PROCESSO_STATUS_LABELS[status as ProcessoStatus] ?? status;
}
