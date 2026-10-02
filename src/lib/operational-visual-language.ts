import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  FileText,
  FolderOpen,
  ListChecks,
  MessageSquareText,
  ShieldAlert,
} from "lucide-react";

/** Semantic accent roles for Actus Connect operational surfaces (Protocolos first). */
export type OperationalAccentRole =
  | "identificacao"
  | "prazos"
  | "informacoes"
  | "documentos"
  | "protocolizacao"
  | "cancelamento";

type AccentDefinition = {
  icon: LucideIcon;
  topBorder: string;
  headerTint: string;
  titleAccent: string;
  iconWrap: string;
};

export const operationalAccentByRole: Record<OperationalAccentRole, AccentDefinition> = {
  identificacao: {
    icon: FileText,
    topBorder: "border-t-[3px] border-t-primary",
    headerTint: "bg-primary/[0.045]",
    titleAccent: "text-primary",
    iconWrap: "bg-primary/10 text-primary",
  },
  prazos: {
    icon: CalendarClock,
    topBorder: "border-t-[3px] border-t-emerald-600 dark:border-t-emerald-500",
    headerTint: "bg-emerald-500/[0.07] dark:bg-emerald-500/10",
    titleAccent: "text-emerald-800 dark:text-emerald-300",
    iconWrap: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  informacoes: {
    icon: MessageSquareText,
    topBorder: "border-t-[3px] border-t-violet-600/80 dark:border-t-violet-400/80",
    headerTint: "bg-violet-500/[0.06] dark:bg-violet-500/10",
    titleAccent: "text-violet-900 dark:text-violet-200",
    iconWrap: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  },
  documentos: {
    icon: FolderOpen,
    topBorder: "border-t-[3px] border-t-sky-700/90 dark:border-t-sky-400/90",
    headerTint: "bg-sky-500/[0.06] dark:bg-sky-500/10",
    titleAccent: "text-sky-900 dark:text-sky-200",
    iconWrap: "bg-sky-500/12 text-sky-800 dark:text-sky-300",
  },
  protocolizacao: {
    icon: ListChecks,
    topBorder: "border-t-[3px] border-t-amber-600/90 dark:border-t-amber-400/90",
    headerTint: "bg-amber-500/[0.08] dark:bg-amber-500/10",
    titleAccent: "text-amber-950 dark:text-amber-100",
    iconWrap: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  cancelamento: {
    icon: ShieldAlert,
    topBorder: "border-t-[3px] border-t-destructive/70",
    headerTint: "bg-destructive/[0.06]",
    titleAccent: "text-destructive",
    iconWrap: "bg-destructive/10 text-destructive",
  },
};

/** Shared page workspace width aligned with WebProc shell content column. */
export const protocoloWorkspaceClassName =
  "mx-auto w-full max-w-6xl space-y-4 pb-10 scroll-mt-24";

/** Base card shell for operational sections and collection panels. */
export const operationalCardShellClassName =
  "overflow-hidden rounded-lg border border-border bg-card shadow-sm";

/**
 * Primary / legal brand identity for operational collection surfaces (lists, grids).
 * Same hue family as `identificacao` — structural navigation, not lifecycle status.
 */
export const operationalCollectionIdentityAccent = {
  topBorder: operationalAccentByRole.identificacao.topBorder,
  sideBorder: "border-l-[3px] border-l-primary",
  headerTint: operationalAccentByRole.identificacao.headerTint,
  titleAccent: operationalAccentByRole.identificacao.titleAccent,
  tableHeadTint: "bg-primary/[0.045] dark:bg-primary/[0.08]",
} as const;

/**
 * Query / filter band within a collection — `informacoes` role (complementary context).
 * Not for status, deadlines, or destructive semantics.
 */
export const operationalCollectionQueryAccent = {
  topBorder: operationalAccentByRole.informacoes.topBorder,
  headerTint: operationalAccentByRole.informacoes.headerTint,
  titleAccent: operationalAccentByRole.informacoes.titleAccent,
} as const;

/** List route page context header (title + primary actions). */
export const operationalCollectionPageHeaderClassName = [
  operationalCardShellClassName,
  operationalCollectionIdentityAccent.sideBorder,
  "bg-card/95 backdrop-blur-sm",
].join(" ");

export const operationalCollectionPageHeaderBandClassName = [
  "border-b border-border/80 px-4 py-4 sm:px-5",
  operationalCollectionIdentityAccent.headerTint,
].join(" ");

/** Compact filter/search toolbar attached to the collection. */
export const operationalCollectionQueryToolbarClassName = [
  operationalCardShellClassName,
  operationalCollectionQueryAccent.topBorder,
].join(" ");

export const operationalCollectionQueryToolbarBandClassName = [
  "border-b border-border/70 px-3 py-2 sm:px-4",
  operationalCollectionQueryAccent.headerTint,
].join(" ");

/** Table / result set container — primary collection identity on top edge. */
export const operationalCollectionDataPanelClassName = [
  operationalCardShellClassName,
  operationalCollectionIdentityAccent.topBorder,
].join(" ");

/** Neutral pagination footer integrated with the data panel. */
export const operationalCollectionPaginationFooterClassName =
  "flex flex-col gap-3 border-t border-border/80 bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between";

/** Pulse / cockpit: immediate operational attention — Data Fatal overdue. */
export const operationalAttentionOverdueAccent = {
  topBorder: operationalAccentByRole.cancelamento.topBorder,
  headerTint: operationalAccentByRole.cancelamento.headerTint,
  titleAccent: operationalAccentByRole.cancelamento.titleAccent,
  icon: ShieldAlert,
  iconWrap: operationalAccentByRole.cancelamento.iconWrap,
} as const;

/** Pulse / cockpit: readiness-style attention — Data Fatal today. */
export const operationalAttentionTodayAccent = {
  topBorder: operationalAccentByRole.protocolizacao.topBorder,
  headerTint: operationalAccentByRole.protocolizacao.headerTint,
  titleAccent: operationalAccentByRole.protocolizacao.titleAccent,
  icon: Clock,
  iconWrap: operationalAccentByRole.protocolizacao.iconWrap,
} as const;

/** Pulse / cockpit: neutral analytical surfaces (period flow, distribution). */
export const operationalAnalyticsAccent = {
  topBorder: operationalAccentByRole.identificacao.topBorder,
  headerTint: "bg-muted/30 dark:bg-muted/20",
  titleAccent: "text-foreground",
  icon: AlertTriangle,
  iconWrap: "bg-muted text-muted-foreground",
} as const;

/** Compact metric group inside a cockpit panel body. */
export const operationalCockpitMetricGridClassName =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3";

/**
 * CONNECT-SHELL.1b — product/navigation chromatic identity.
 * Palette derived from approved operational families (sky ≈ documentos blue, violet ≈ informações).
 * Shell-only names — not domain Documentos/Informações behavior.
 */
export const connectShellProductIdentity = {
  railSurface:
    "bg-sky-500/[0.06] dark:bg-sky-400/[0.09]",
  railBorder: "border-sky-800/12 dark:border-sky-400/18",
  navWellSurface: "bg-background/35 dark:bg-background/20",
  brandBlockSurface:
    "bg-background/75 dark:bg-sky-950/35",
  brandBlockBorder:
    "border-sky-700/25 dark:border-sky-400/30",
  brandBlockAccentRule: "border-l-[3px] border-l-sky-600/70 dark:border-l-sky-400/80",
  brandEyebrow: "text-sky-900/65 dark:text-sky-300/75",
  brandTitle: operationalAccentByRole.documentos.titleAccent,
  brandContextRule: "border-sky-700/15 dark:border-sky-400/20",
  navActiveRail: "border-l-sky-700 dark:border-l-sky-400",
  navActiveBg: "bg-sky-500/12 dark:bg-sky-400/16",
  navActiveText: "text-sky-950 dark:text-sky-50",
  navActiveIcon: "text-sky-800 dark:text-sky-300",
  navHoverBg: "hover:bg-sky-500/[0.07] dark:hover:bg-sky-400/[0.10]",
  navHoverRail: "hover:border-l-sky-600/35 dark:hover:border-l-sky-400/40",
  footerDivider: "border-sky-800/12 dark:border-sky-400/15",
  attributionLinkHover:
    "hover:text-sky-800 dark:hover:text-sky-300",
  mobileMenuButtonBorder: "border-sky-700/25 dark:border-sky-400/30",
} as const;

/** Institutional informational tint — derived from `informacoes` accent, shell/Sobre only. */
export const connectShellInstitutionalInfo = {
  sectionTint: operationalAccentByRole.informacoes.headerTint,
  sectionBorder: "border border-violet-600/12 dark:border-violet-400/18",
  sectionTopRule: operationalAccentByRole.informacoes.topBorder.replace("border-t-[3px]", "border-t-2"),
  heading: operationalAccentByRole.informacoes.titleAccent,
  outlineButtonBorder: "border-violet-600/20 dark:border-violet-400/25",
} as const;

/** CONNECT-SHELL.1 / 1a / 1b — application chrome (brand in shell; operational semantics in content). */
export const connectShellSidebarWidthClassName = "w-[14rem]";

export const connectShellSurfaceClassName = cn(
  connectShellProductIdentity.railSurface,
  connectShellProductIdentity.railBorder,
);

export const connectShellAsideClassName = cn(
  "hidden lg:flex lg:flex-col lg:shrink-0 lg:border-r",
  connectShellSurfaceClassName,
  connectShellSidebarWidthClassName,
);

export const connectShellSheetSurfaceClassName = cn(
  "flex flex-col p-0",
  connectShellSurfaceClassName,
);

export const connectShellContentMainClassName =
  "mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 scroll-pt-[3.75rem] lg:scroll-pt-6";

export const connectShellMobileHeaderClassName = cn(
  "sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 lg:hidden",
  connectShellSurfaceClassName,
);

export const connectShellBrandBlockClassName = cn(
  "rounded-md border px-3 py-3",
  connectShellProductIdentity.brandBlockBorder,
  connectShellProductIdentity.brandBlockSurface,
  connectShellProductIdentity.brandBlockAccentRule,
);

export const connectShellBrandTitleClassName = cn(
  "font-serif text-[1.35rem] font-bold leading-none tracking-tight",
  connectShellProductIdentity.brandTitle,
);

export const connectShellBrandEyebrowClassName = cn(
  "text-[0.62rem] font-semibold uppercase tracking-[0.16em]",
  connectShellProductIdentity.brandEyebrow,
);

export const connectShellBrandContextClassName = cn(
  "mt-2.5 truncate border-t pt-2 text-xs font-medium leading-snug text-foreground/90",
  connectShellProductIdentity.brandContextRule,
);

export const connectShellMobileHeaderContextClassName =
  "truncate text-xs font-medium leading-snug text-foreground/90";

export const INSIGHT_TECHNOLOGY_PROVIDER_NAME = "Insight AI Solutions";

export const INSIGHT_OFFICIAL_WEBSITE_URL = "https://www.insightaisolutions.com.br/";

export const connectShellAttributionClassName =
  "px-1 text-[0.65rem] leading-snug text-muted-foreground";

export const connectShellAttributionLinkClassName = cn(
  "font-medium text-sky-900/70 underline-offset-2 dark:text-sky-300/80",
  connectShellProductIdentity.attributionLinkHover,
  "hover:underline",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm",
);

export const connectShellFooterDividerClassName = connectShellProductIdentity.footerDivider;

export const connectShellFooterSurfaceClassName = cn(
  "rounded-md px-1",
  connectShellProductIdentity.navWellSurface,
);

export function connectShellNavItemClassName(isActive: boolean, nested = false): string {
  const id = connectShellProductIdentity;
  return cn(
    "flex min-h-9 w-full items-center gap-2.5 rounded-md py-2 text-sm transition-smooth",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600/40 focus-visible:ring-offset-2 ring-offset-background dark:focus-visible:ring-sky-400/45",
    nested ? "pl-6 pr-2" : "pl-2 pr-2",
    isActive
      ? [
          "border-l-[3px] font-semibold",
          id.navActiveRail,
          id.navActiveBg,
          id.navActiveText,
          "shadow-[inset_0_0_0_1px_rgba(14,116,144,0.08)] dark:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]",
        ].join(" ")
      : [
          "border-l-[3px] border-l-transparent font-medium text-muted-foreground",
          id.navHoverRail,
          id.navHoverBg,
          "hover:text-foreground",
        ].join(" "),
  );
}

export function connectShellNavIconClassName(isActive: boolean): string {
  const id = connectShellProductIdentity;
  return cn(
    "h-4 w-4 shrink-0",
    isActive ? id.navActiveIcon : "text-muted-foreground/75 group-hover:text-sky-900/70 dark:group-hover:text-sky-200/80",
  );
}

export const connectShellSectionLabelClassName =
  "px-2.5 pb-0.5 pt-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90";

/** Institutional in-app surface (Sobre) — product identity, not marketing layout. */
export const connectInstitutionalCardClassName = cn(
  operationalCardShellClassName,
  operationalCollectionIdentityAccent.topBorder,
  "overflow-hidden",
);

export const connectInstitutionalProductHeaderClassName = cn(
  "border-b border-border/80 px-4 py-5 sm:px-6",
  operationalCollectionIdentityAccent.headerTint,
  "border-l-[3px] border-l-sky-700/40 dark:border-l-sky-400/50",
);

export const connectInstitutionalTechnologySectionClassName = cn(
  "space-y-2 rounded-md px-4 py-4",
  connectShellInstitutionalInfo.sectionBorder,
  connectShellInstitutionalInfo.sectionTint,
  connectShellInstitutionalInfo.sectionTopRule,
);

export const connectInstitutionalTechnologyHeadingClassName = cn(
  "text-sm font-semibold",
  connectShellInstitutionalInfo.heading,
);

export const connectInstitutionalMetaClassName =
  "border-t border-border/60 bg-muted/15 px-4 py-3 text-xs text-muted-foreground dark:bg-muted/10 sm:px-6";
