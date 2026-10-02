import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ConnectShellBrandBlock } from "@/components/connect/ConnectShellBrandBlock";
import { ConnectShellFooterActions } from "@/components/connect/ConnectShellFooterActions";
import { ConnectShellNavList, type ConnectShellNavigationModel } from "@/components/connect/ConnectShellNavList";
import {
  connectShellBrandEyebrowClassName,
  connectShellMobileHeaderContextClassName,
  connectShellMobileHeaderClassName,
  connectShellProductIdentity,
  connectShellSheetSurfaceClassName,
} from "@/lib/operational-visual-language";
import { cn } from "@/lib/utils";

type ConnectMobileShellBarProps = {
  contextSubtitle: string;
  navModel: ConnectShellNavigationModel;
  onLogout: () => void;
};

export function ConnectMobileShellBar({
  contextSubtitle,
  navModel,
  onLogout,
}: ConnectMobileShellBarProps) {
  const [open, setOpen] = useState(false);

  const handleNavigate = () => {
    setOpen(false);
  };

  const handleLogout = () => {
    setOpen(false);
    onLogout();
  };

  return (
    <header className={connectShellMobileHeaderClassName}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "bg-background/70 dark:bg-background/40",
              connectShellProductIdentity.mobileMenuButtonBorder,
            )}
            aria-label="Abrir menu"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className={cn(
            connectShellSheetSurfaceClassName,
            "w-[min(18rem,100vw-2rem)]",
          )}
        >
          <SheetTitle className="sr-only">Menu Actus Connect</SheetTitle>
          <div className="border-b border-primary/10 px-4 py-4">
            <ConnectShellBrandBlock contextSubtitle={contextSubtitle} />
          </div>
          <div
            className={cn(
              "mx-3 mb-1 flex-1 overflow-y-auto rounded-md px-0.5 py-1",
              connectShellProductIdentity.navWellSurface,
            )}
          >
            <ConnectShellNavList model={navModel} onNavigate={handleNavigate} landmark="menu" />
          </div>
          <div className="px-4 pb-4">
            <ConnectShellFooterActions
              onLogout={handleLogout}
              themeLabelClassName="text-sm text-muted-foreground"
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1 py-0.5">
        <p className={connectShellBrandEyebrowClassName}>Actus Connect</p>
        <p className={connectShellMobileHeaderContextClassName} title={contextSubtitle}>
          {contextSubtitle}
        </p>
      </div>
    </header>
  );
}
