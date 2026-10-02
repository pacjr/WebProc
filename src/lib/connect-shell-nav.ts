import type { LucideIcon } from "lucide-react";
import { Activity, Building2, FileText, Info, Plus } from "lucide-react";

export type ConnectShellNavLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** When true, only exact path matches (React Router `end`). */
  end?: boolean;
};

export type ConnectShellNavigationModel = {
  pulse: ConnectShellNavLink;
  protocolos: ConnectShellNavLink;
  novoProtocolo: ConnectShellNavLink | null;
  administracao: ConnectShellNavLink | null;
  sobre: ConnectShellNavLink;
};

const pulseItem: ConnectShellNavLink = {
  to: "/app/pulse",
  label: "Pulse",
  icon: Activity,
  end: true,
};

const protocolosItem: ConnectShellNavLink = {
  to: "/app/processos",
  label: "Protocolos",
  icon: FileText,
  end: true,
};

const novoProtocoloItem: ConnectShellNavLink = {
  to: "/app/processos/novo",
  label: "Novo protocolo",
  icon: Plus,
  end: false,
};

const administracaoItem: ConnectShellNavLink = {
  to: "/app/admin",
  label: "Administração",
  icon: Building2,
  end: true,
};

const sobreItem: ConnectShellNavLink = {
  to: "/app/sobre",
  label: "Sobre",
  icon: Info,
  end: true,
};

/** Capability-aware shell navigation — mirrors pre-shell WebProcShell rules. */
export function buildConnectShellNavigation(options: {
  isClient: boolean;
  isActus: boolean;
  showAdministration: boolean;
}): ConnectShellNavigationModel {
  const { isClient, isActus, showAdministration } = options;

  if (!isClient && !isActus) {
    return {
      pulse: pulseItem,
      protocolos: protocolosItem,
      novoProtocolo: null,
      administracao: null,
      sobre: sobreItem,
    };
  }

  return {
    pulse: pulseItem,
    protocolos: protocolosItem,
    novoProtocolo: isClient ? novoProtocoloItem : null,
    administracao: showAdministration ? administracaoItem : null,
    sobre: sobreItem,
  };
}
