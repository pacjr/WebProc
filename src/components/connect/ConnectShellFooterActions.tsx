import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { ConnectInsightAttribution } from "@/components/connect/ConnectInsightAttribution";
import {
  connectShellFooterDividerClassName,
  connectShellFooterSurfaceClassName,
  connectShellProductIdentity,
} from "@/lib/operational-visual-language";
import { cn } from "@/lib/utils";

type ConnectShellFooterActionsProps = {
  onLogout: () => void;
  className?: string;
  themeLabelClassName?: string;
};

export function ConnectShellFooterActions({
  onLogout,
  className,
  themeLabelClassName = "text-xs text-muted-foreground",
}: ConnectShellFooterActionsProps) {
  return (
    <div
      className={cn(
        "space-y-3 pt-4",
        connectShellFooterDividerClassName,
        connectShellFooterSurfaceClassName,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <span className={themeLabelClassName}>Tema</span>
        <ThemeToggle />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "w-full justify-start bg-background/50 hover:bg-background/80 dark:bg-background/25",
          connectShellProductIdentity.mobileMenuButtonBorder,
        )}
        onClick={onLogout}
      >
        <LogOut className="mr-2 h-4 w-4" aria-hidden />
        Sair
      </Button>
      <ConnectInsightAttribution />
    </div>
  );
}
