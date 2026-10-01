import type { LucideIcon } from "lucide-react";
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
