import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";

const LIST_MOTIVO_MAX_LENGTH = 56;

export function cancellationReasonForList(
  status: ProcessoStatus,
  motivo: string | null | undefined,
) {
  if (status !== "CANCELADO") {
    return { display: "—", full: null as string | null };
  }

  const trimmed = motivo?.trim();
  if (!trimmed) {
    return { display: "—", full: null };
  }

  if (trimmed.length <= LIST_MOTIVO_MAX_LENGTH) {
    return { display: trimmed, full: trimmed };
  }

  return {
    display: `${trimmed.slice(0, LIST_MOTIVO_MAX_LENGTH)}…`,
    full: trimmed,
  };
}
