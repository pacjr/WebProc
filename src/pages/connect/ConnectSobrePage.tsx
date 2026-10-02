import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { ConnectInsightAttribution } from "@/components/connect/ConnectInsightAttribution";
import {
  ACTUS_CONNECT_APP_VERSION,
  ACTUS_CONNECT_PRODUCT_TAGLINE,
} from "@/lib/actus-connect-login-config";
import {
  connectInstitutionalCardClassName,
  connectInstitutionalMetaClassName,
  connectInstitutionalProductHeaderClassName,
  connectInstitutionalTechnologyHeadingClassName,
  connectInstitutionalTechnologySectionClassName,
  connectShellAttributionLinkClassName,
  connectShellBrandEyebrowClassName,
  connectShellBrandTitleClassName,
  connectShellInstitutionalInfo,
  INSIGHT_OFFICIAL_WEBSITE_URL,
  INSIGHT_TECHNOLOGY_PROVIDER_NAME,
  protocoloWorkspaceClassName,
} from "@/lib/operational-visual-language";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ConnectSobrePage() {
  return (
    <div className={protocoloWorkspaceClassName}>
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-bold text-primary sm:text-3xl">Sobre</h1>
        <p className="text-sm text-muted-foreground">Actus Connect — informações do produto</p>
      </header>

      <article className={connectInstitutionalCardClassName}>
        <div className={connectInstitutionalProductHeaderClassName}>
          <p className={connectShellBrandEyebrowClassName}>Actus</p>
          <h2 className={connectShellBrandTitleClassName}>Connect</h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-foreground">
            Plataforma operacional do ambiente Actus para registro, acompanhamento e supervisão de
            protocolos e sinais operacionais.
          </p>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">{ACTUS_CONNECT_PRODUCT_TAGLINE}</p>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">
          <section
            aria-labelledby="sobre-tecnologia-heading"
            className={connectInstitutionalTechnologySectionClassName}
          >
            <h3 id="sobre-tecnologia-heading" className={connectInstitutionalTechnologyHeadingClassName}>
              Tecnologia
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Desenvolvido pela{" "}
              <span className="font-medium text-foreground">{INSIGHT_TECHNOLOGY_PROVIDER_NAME}</span>
              .
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Empresa de tecnologia especializada em software, dados e inteligência operacional.
            </p>
            <Button
              variant="outline"
              size="sm"
              className={cn("mt-1 bg-background/60 dark:bg-background/30", connectShellInstitutionalInfo.outlineButtonBorder)}
              asChild
            >
              <a
                href={INSIGHT_OFFICIAL_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Conheça a Insight
                <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" aria-hidden />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </Button>
            <p className="pt-1 text-xs text-muted-foreground">
              <a
                href={INSIGHT_OFFICIAL_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={connectShellAttributionLinkClassName}
              >
                {INSIGHT_OFFICIAL_WEBSITE_URL}
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </p>
          </section>
        </div>

        <footer className={connectInstitutionalMetaClassName}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ConnectInsightAttribution className="px-0" showExternalIcon />
            <p className="text-xs text-muted-foreground">
              Versão{" "}
              <span className="font-mono text-foreground/80">{ACTUS_CONNECT_APP_VERSION}</span>
            </p>
          </div>
          <p className="mt-3 text-xs">
            <Link
              to="/app/processos"
              className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              Voltar aos protocolos
            </Link>
          </p>
        </footer>
      </article>
    </div>
  );
}
