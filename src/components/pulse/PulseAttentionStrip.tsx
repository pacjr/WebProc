import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { pulseLinkToProcessosList } from "@/lib/pulse-processos-links";
import {
  operationalAttentionOverdueAccent,
  operationalAttentionTodayAccent,
  operationalCardShellClassName,
} from "@/lib/operational-visual-language";

function AttentionCard({
  to,
  label,
  count,
  description,
  accent,
  ariaLabel,
}: {
  to: string;
  label: string;
  count: number;
  description: string;
  accent: typeof operationalAttentionOverdueAccent;
  ariaLabel: string;
}) {
  const Icon = accent.icon;
  const isZero = count === 0;

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={cn(
        operationalCardShellClassName,
        accent.topBorder,
        "group block transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className={cn("flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-4", accent.headerTint)}>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            accent.iconWrap,
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("font-serif text-sm font-semibold", accent.titleAccent)}>{label}</p>
          <p
            className={cn(
              "mt-1 text-3xl font-bold tabular-nums sm:text-4xl",
              isZero ? "text-muted-foreground" : accent.titleAccent,
            )}
          >
            {count}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          {isZero ? (
            <p className="mt-1 text-xs text-muted-foreground/90">Nenhuma demanda nesta condição.</p>
          ) : (
            <p className="mt-2 text-xs font-medium text-primary group-hover:underline">
              Abrir na lista de protocolos
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function PulseAttentionStrip({
  fatalOverdue,
  fatalToday,
  actusClienteScopeNote,
}: {
  fatalOverdue: number;
  fatalToday: number;
  actusClienteScopeNote: string | null;
}) {
  return (
    <section aria-labelledby="pulse-attention-heading" className="space-y-2">
      <h2 id="pulse-attention-heading" className="sr-only">
        Atenção operacional
      </h2>
      {actusClienteScopeNote ? (
        <p className="text-xs text-muted-foreground" role="note">
          {actusClienteScopeNote}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AttentionCard
          to={pulseLinkToProcessosList({ fatal: "vencidas" })}
          label="Data Fatal vencida"
          count={fatalOverdue}
          description="Em preenchimento ou pendente com prazo anterior a hoje."
          accent={operationalAttentionOverdueAccent}
          ariaLabel={`Data Fatal vencida: ${fatalOverdue} protocolos. Abrir lista filtrada.`}
        />
        <AttentionCard
          to={pulseLinkToProcessosList({ fatal: "hoje" })}
          label="Data Fatal hoje"
          count={fatalToday}
          description="Em preenchimento ou pendente com prazo no dia de hoje."
          accent={operationalAttentionTodayAccent}
          ariaLabel={`Data Fatal hoje: ${fatalToday} protocolos. Abrir lista filtrada.`}
        />
      </div>
    </section>
  );
}
