import { useEffect, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWebProc } from "@/contexts/WebProcContext";
import { useActusAdminCapabilityQuery } from "@/hooks/useActusAdminCapabilityQuery";
import { canEnterProtectedApp } from "@/lib/connect-access";
import { buildConnectShellNavigation } from "@/lib/connect-shell-nav";
import { ConnectAppSidebar } from "@/components/connect/ConnectAppSidebar";
import { ConnectMobileShellBar } from "@/components/connect/ConnectMobileShellBar";
import { connectShellContentMainClassName } from "@/lib/operational-visual-language";
import AccessDenied from "@/pages/webproc/AccessDenied";
import ClientSelectionRequired from "@/pages/webproc/ClientSelectionRequired";

export default function WebProcShell() {
  const { user, connectAccess, membership, loading } = useWebProc();
  const navigate = useNavigate();

  const isActus = connectAccess.kind === "ACTUS";
  const isClient = connectAccess.kind === "CLIENT";
  const adminCapability = useActusAdminCapabilityQuery(connectAccess, user?.id);
  const showAdminNav =
    isActus && adminCapability.isSuccess && adminCapability.data === true;

  const navModel = useMemo(
    () =>
      buildConnectShellNavigation({
        isClient,
        isActus,
        showAdministration: showAdminNav,
      }),
    [isActus, isClient, showAdminNav],
  );

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [loading, user, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/5 to-background">
        <p className="text-muted-foreground">Carregando Actus Connect...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (connectAccess.kind === "CLIENT_SELECTION_REQUIRED") {
    return <ClientSelectionRequired />;
  }

  if (connectAccess.kind === "UNAUTHORIZED") {
    return <AccessDenied />;
  }

  if (!canEnterProtectedApp(connectAccess)) {
    return <AccessDenied />;
  }

  const contextSubtitle = isActus
    ? "Ambiente de supervisão Actus"
    : (membership?.cliente.nome ?? "Organização");

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-background via-accent/5 to-background">
      <ConnectAppSidebar
        contextSubtitle={contextSubtitle}
        navModel={navModel}
        onLogout={() => void handleLogout()}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectMobileShellBar
          contextSubtitle={contextSubtitle}
          navModel={navModel}
          onLogout={() => void handleLogout()}
        />

        <main className={connectShellContentMainClassName}>
          {isActus && (
            <p className="mb-6 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Você está no Actus Connect com autorização interna Actus (escopo transversal de
              supervisão). Operações exclusivas de cliente não estão disponíveis neste perfil.
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
