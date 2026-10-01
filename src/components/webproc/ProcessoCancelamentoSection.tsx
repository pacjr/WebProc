import { format } from "date-fns";
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
    <section
      aria-labelledby="cancelamento-heading"
      className="rounded-md border border-border bg-muted/40 px-4 py-4 space-y-3"
    >
      <div>
        <h2 id="cancelamento-heading" className="font-serif text-lg font-semibold text-primary">
          Cancelamento
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Registro de governança do cancelamento. Estas informações não podem ser alteradas.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Motivo</dt>
          <dd className="font-medium text-foreground whitespace-pre-wrap">{motivo}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cancelado em</dt>
          <dd className="font-medium">{formatDateTime(processo.cancelado_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cancelado por</dt>
          <dd className="font-medium">
            {canceladoPor.primary}
            {canceladoPor.secondary ? (
              <span className="block text-xs text-muted-foreground font-normal">
                {canceladoPor.secondary}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status anterior</dt>
          <dd className="font-medium">{statusAnterior}</dd>
        </div>
      </dl>
    </section>
  );
}
