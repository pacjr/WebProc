import { ConnectShellBrandBlock } from "@/components/connect/ConnectShellBrandBlock";
import { ConnectShellFooterActions } from "@/components/connect/ConnectShellFooterActions";
import { ConnectShellNavList, type ConnectShellNavigationModel } from "@/components/connect/ConnectShellNavList";
import {
  connectShellAsideClassName,
  connectShellProductIdentity,
} from "@/lib/operational-visual-language";
import { cn } from "@/lib/utils";

type ConnectAppSidebarProps = {
  contextSubtitle: string;
  navModel: ConnectShellNavigationModel;
  onLogout: () => void;
};

export function ConnectAppSidebar({
  contextSubtitle,
  navModel,
  onLogout,
}: ConnectAppSidebarProps) {
  return (
    <aside className={connectShellAsideClassName}>
      <div className="flex h-full min-h-0 flex-col px-3 py-4">
        <div className="mb-4 px-0.5">
          <ConnectShellBrandBlock contextSubtitle={contextSubtitle} />
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-md px-0.5 py-1",
            connectShellProductIdentity.navWellSurface,
          )}
        >
          <ConnectShellNavList model={navModel} />
        </div>

        <ConnectShellFooterActions onLogout={onLogout} className="mt-4 px-0.5" />
      </div>
    </aside>
  );
}
