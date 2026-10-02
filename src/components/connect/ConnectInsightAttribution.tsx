import { ExternalLink } from "lucide-react";
import {
  connectShellAttributionClassName,
  connectShellAttributionLinkClassName,
  INSIGHT_OFFICIAL_WEBSITE_URL,
  INSIGHT_TECHNOLOGY_PROVIDER_NAME,
} from "@/lib/operational-visual-language";

type ConnectInsightAttributionProps = {
  className?: string;
  showExternalIcon?: boolean;
};

export function ConnectInsightAttribution({
  className,
  showExternalIcon = false,
}: ConnectInsightAttributionProps) {
  return (
    <p className={className ?? connectShellAttributionClassName}>
      Tecnologia por{" "}
      <a
        href={INSIGHT_OFFICIAL_WEBSITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={connectShellAttributionLinkClassName}
      >
        {INSIGHT_TECHNOLOGY_PROVIDER_NAME}
        {showExternalIcon ? (
          <ExternalLink className="ml-0.5 inline h-3 w-3 align-text-top opacity-70" aria-hidden />
        ) : null}
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    </p>
  );
}
