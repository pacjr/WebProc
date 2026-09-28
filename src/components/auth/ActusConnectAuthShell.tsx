import type { ReactNode } from "react";
import { ProductLoginLayout } from "@insight/product-login-system";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ACTUS_AUTH_CARD,
  ACTUS_CONNECT_APP_VERSION,
  getActusConnectAuthPresentation,
} from "@/lib/actus-connect-login-config";

type AuthCardKey = keyof typeof ACTUS_AUTH_CARD;

interface ActusConnectAuthShellProps {
  flow: AuthCardKey;
  children: ReactNode;
}

export function ActusConnectAuthShell({ flow, children }: ActusConnectAuthShellProps) {
  const presentation = getActusConnectAuthPresentation(ACTUS_AUTH_CARD[flow]);

  return (
    <div className="actus-connect-auth">
      <div className="fixed top-4 right-4 z-[100]">
        <ThemeToggle />
      </div>

      <ProductLoginLayout {...presentation} version={ACTUS_CONNECT_APP_VERSION}>
        {children}
      </ProductLoginLayout>
    </div>
  );
}
