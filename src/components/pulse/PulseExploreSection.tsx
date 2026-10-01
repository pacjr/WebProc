import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { pulseLinkToProcessosList } from "@/lib/pulse-processos-links";
import {
  operationalCardShellClassName,
  operationalCollectionIdentityAccent,
} from "@/lib/operational-visual-language";
import { PulseDrilldownTable } from "@/components/pulse/PulseDrilldownTable";
import type { PulseDrilldownRow } from "@/integrations/supabase/pulse-types";

const QUICK_LINKS = [
  { label: "Todos os protocolos", href: pulseLinkToProcessosList() },
  {
    label: "Data Fatal vencida",
    href: pulseLinkToProcessosList({ fatal: "vencidas" }),
  },
  { label: "Data Fatal hoje", href: pulseLinkToProcessosList({ fatal: "hoje" }) },
  {
    label: "Em preenchimento",
    href: pulseLinkToProcessosList({ status: "EM_PREENCHIMENTO" }),
  },
  { label: "Pendentes", href: pulseLinkToProcessosList({ status: "PENDENTE" }) },
] as const;

export function PulseExploreSection({
  onDrilldownOpenChange,
  drilldownProps,
}: {
  onDrilldownOpenChange: (open: boolean) => void;
  drilldownProps: {
    rows: PulseDrilldownRow[];
    isActus: boolean;
    isLoading: boolean;
    isRefetching: boolean;
    isError: boolean;
    error: Error | null;
    onRetry: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isFetchNextPageError: boolean;
    fetchNextPageError: Error | null;
    onLoadMore: () => void;
    onRetryLoadMore: () => void;
  };
}) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onDrilldownOpenChange(next);
  };

  return (
    <section aria-labelledby="pulse-explore-heading" className="space-y-3">
      <div
        className={cn(
          operationalCardShellClassName,
          operationalCollectionIdentityAccent.topBorder,
        )}
      >
        <div
          className={cn(
            "border-b border-border/70 px-4 py-3 sm:px-5",
            operationalCollectionIdentityAccent.headerTint,
          )}
        >
          <h2
            id="pulse-explore-heading"
            className={cn(
              "font-serif text-base font-semibold",
              operationalCollectionIdentityAccent.titleAccent,
            )}
          >
            Explorar protocolos
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pulse sinaliza e agrega; a lista operacional vive em Protocolos. Use os atalhos para
            investigar ou agir.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
          {QUICK_LINKS.map((item) => (
            <Button key={item.href} variant="outline" size="sm" className="h-8" asChild>
              <Link to={item.href}>
                {item.label}
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          ))}
        </div>
      </div>

      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 px-0 text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
            Demandas cadastradas no período (analítico)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <p className="mb-3 text-xs text-muted-foreground">
            Lista paginada por cadastro no intervalo Pulse — não disponível como filtro na grade
            de Protocolos. Carregada sob demanda.
          </p>
          {open ? <PulseDrilldownTable {...drilldownProps} compact /> : null}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
