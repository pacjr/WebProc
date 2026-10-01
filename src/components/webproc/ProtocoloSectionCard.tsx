import type { ReactNode } from "react";
import {
  operationalAccentByRole,
  type OperationalAccentRole,
} from "@/lib/operational-visual-language";
import { cn } from "@/lib/utils";

type ProtocoloSectionCardProps = {
  title: string;
  description?: string;
  headingId: string;
  accentRole: OperationalAccentRole;
  children: ReactNode;
  className?: string;
  /** Operational column panels can stretch on desktop. */
  panelStretch?: boolean;
};

export default function ProtocoloSectionCard({
  title,
  description,
  headingId,
  accentRole,
  children,
  className,
  panelStretch = false,
}: ProtocoloSectionCardProps) {
  const accent = operationalAccentByRole[accentRole];
  const Icon = accent.icon;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        accent.topBorder,
        panelStretch && "lg:h-full lg:min-h-[280px] lg:flex lg:flex-col",
        className,
      )}
    >
      <div
        className={cn(
          "border-b border-border/80 px-4 py-3 sm:px-5",
          accent.headerTint,
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              accent.iconWrap,
            )}
            aria-hidden
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={headingId}
              className={cn("font-serif text-base font-semibold leading-snug", accent.titleAccent)}
            >
              {title}
            </h2>
            {description ? (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "px-4 py-4 sm:px-5 sm:py-4",
          panelStretch && "lg:flex-1",
        )}
      >
        {children}
      </div>
    </section>
  );
}
