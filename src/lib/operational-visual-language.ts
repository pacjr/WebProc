import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
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
