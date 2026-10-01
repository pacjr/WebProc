import {
  operationalCollectionIdentityAccent,
  operationalCollectionPageHeaderBandClassName,
  operationalCollectionPageHeaderClassName,
} from "@/lib/operational-visual-language";
import { formatPeriodRangeLabel, pulseTimezoneParenthetical } from "@/lib/pulse-dates";

export function PulsePageHeader({
  periodStart,
  periodEnd,
  scopeHint,
}: {
  periodStart: string;
  periodEnd: string;
  scopeHint: string | null;
}) {
  const periodLabel = formatPeriodRangeLabel(periodStart, periodEnd);

  return (
    <header className={operationalCollectionPageHeaderClassName}>
      <div className={operationalCollectionPageHeaderBandClassName}>
        <div className="space-y-1">
          <p
            className={`text-xs font-medium uppercase tracking-wide ${operationalCollectionIdentityAccent.titleAccent}`}
          >
            Actus Connect
          </p>
          <h1 className="font-serif text-2xl font-bold text-primary sm:text-3xl">Pulse</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Onde o seu escopo precisa de atenção agora — sinais operacionais e fluxo no período,
            sem substituir a lista de protocolos.
          </p>
          <p className="text-xs text-muted-foreground">
            Período aplicado: {periodLabel} {pulseTimezoneParenthetical()}
            {scopeHint ? ` · ${scopeHint}` : null}
          </p>
        </div>
      </div>
    </header>
  );
}
