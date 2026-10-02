import { NavLink } from "react-router-dom";
import {
  buildConnectShellNavigation,
  type ConnectShellNavigationModel,
} from "@/lib/connect-shell-nav";
import {
  connectShellNavIconClassName,
  connectShellNavItemClassName,
  connectShellSectionLabelClassName,
} from "@/lib/operational-visual-language";
import { cn } from "@/lib/utils";

type ConnectShellNavListProps = {
  model: ConnectShellNavigationModel;
  onNavigate?: () => void;
  /** `nav` for sidebar; `menu` inside mobile sheet. */
  landmark?: "nav" | "menu";
};

function ShellNavItem({
  to,
  label,
  icon: Icon,
  end,
  nested,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: ConnectShellNavigationModel["pulse"]["icon"];
  end?: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn("group", connectShellNavItemClassName(isActive, nested))
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={connectShellNavIconClassName(isActive)} aria-hidden />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function ConnectShellNavList({
  model,
  onNavigate,
  landmark = "nav",
}: ConnectShellNavListProps) {
  const Tag = landmark === "menu" ? "div" : "nav";
  const ariaLabel = landmark === "menu" ? undefined : "Navegação principal";

  return (
    <Tag className="flex flex-col gap-0.5" aria-label={ariaLabel}>
      <ShellNavItem {...model.pulse} onNavigate={onNavigate} />

      <p className={connectShellSectionLabelClassName} id="connect-shell-protocolos-label">
        Protocolos
      </p>
      <div className="flex flex-col gap-0.5" aria-labelledby="connect-shell-protocolos-label">
        <ShellNavItem {...model.protocolos} nested onNavigate={onNavigate} />
        {model.novoProtocolo ? (
          <ShellNavItem {...model.novoProtocolo} nested onNavigate={onNavigate} />
        ) : null}
      </div>

      {model.administracao ? (
        <>
          <p className={connectShellSectionLabelClassName}>Administração</p>
          <ShellNavItem {...model.administracao} onNavigate={onNavigate} />
        </>
      ) : null}

      <p className={connectShellSectionLabelClassName}>Institucional</p>
      <ShellNavItem {...model.sobre} onNavigate={onNavigate} />
    </Tag>
  );
}

export type { ConnectShellNavigationModel };

export function useConnectShellNavigationModel(options: {
  isClient: boolean;
  isActus: boolean;
  showAdministration: boolean;
}) {
  return buildConnectShellNavigation(options);
}
