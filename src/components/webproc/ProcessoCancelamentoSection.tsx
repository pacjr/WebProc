import { format } from "date-fns";
import ProtocoloSectionCard from "@/components/webproc/ProtocoloSectionCard";
import { formatAuthorDisplay } from "@/integrations/supabase/webproc-api";
import type { WebProcProcessoDetail } from "@/integrations/supabase/webproc-types";
import { processoStatusLabel } from "@/lib/webproc-status-labels";

type ProcessoCancelamentoSectionProps = {
  processo: WebProcProcessoDetail;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy HH:mm");
}

export default function ProcessoCancelamentoSection({
  processo,
}: ProcessoCancelamentoSectionProps) {
  if (processo.status !== "CANCELADO") {
    return null;
  }

  const canceladoPor = formatAuthorDisplay(processo.canceladoPor);
  const motivo = processo.motivo_cancelamento?.trim() || "—";
  const statusAnterior = processo.status_antes_cancelamento
    ? processoStatusLabel(processo.status_antes_cancelamento)
    : "—";

  return (
    <ProtocoloSectionCard
      headingId="cancelamento-heading"
      title="Cancelamento"
      accentRole="cancelamento"
      description="Registro de governança do cancelamento. Estas informações não podem ser alteradas."
    >
      <dl className="grid gap-4 sm:grid-cols-2 text-sm">
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted-foreground">Motivo</dt>
          <dd className="mt-1 font-medium text-foreground whitespace-pre-wrap break-words">
            {motivo}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Cancelado em</dt>
          <dd className="mt-1 font-medium">{formatDateTime(processo.cancelado_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Cancelado por</dt>
          <dd className="mt-1 font-medium">
            {canceladoPor.primary}
            {canceladoPor.secondary ? (
              <span className="block text-xs text-muted-foreground font-normal">
                {canceladoPor.secondary}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Status anterior</dt>
          <dd className="mt-1 font-medium">{statusAnterior}</dd>
        </div>
      </dl>
    </ProtocoloSectionCard>
  );
}
