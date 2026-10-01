import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProtocoloContextHeaderProps = {
  title: string;
  clienteNome: string;
  metaLine?: ReactNode;
  statusLabel?: string | null;
  modeHint?: ReactNode;
  actions?: ReactNode;
  banners?: ReactNode;
  className?: string;
};

export default function ProtocoloContextHeader({
  title,
  clienteNome,
  metaLine,
  statusLabel,
  modeHint,
  actions,
  banners,
  className,
}: ProtocoloContextHeaderProps) {
  return (
    <header
      className={cn(
        "rounded-lg border border-border bg-card/90 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div className="border-b border-border/80 px-4 py-3 sm:px-5">
        <Button variant="ghost" className="h-auto w-fit px-0 -ml-1 mb-2" asChild>
          <Link to="/app/processos">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden />
            Voltar para protocolos
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">{title}</h1>
              {statusLabel ? (
                <Badge variant="secondary" className="shrink-0 text-sm font-medium">
                  {statusLabel}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Cliente{" "}
              <span className="font-medium text-foreground">{clienteNome}</span>
            </p>
            {metaLine ? (
              <p className="text-sm text-muted-foreground">{metaLine}</p>
            ) : null}
            {modeHint ? <div className="text-sm">{modeHint}</div> : null}
          </div>

          {actions ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end lg:shrink-0">
              {actions}
            </div>
          ) : null}
        </div>
      </div>

      {banners ? (
        <div className="space-y-3 px-4 py-3 sm:px-5 border-t border-border/60 bg-muted/20">
          {banners}
        </div>
      ) : null}
    </header>
  );
}
