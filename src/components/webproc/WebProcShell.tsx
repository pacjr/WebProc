import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Activity, Building2, FileText, LogOut, Menu, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWebProc } from "@/contexts/WebProcContext";
import { useActusAdminCapabilityQuery } from "@/hooks/useActusAdminCapabilityQuery";
import { canEnterProtectedApp } from "@/lib/connect-access";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import AccessDenied from "@/pages/webproc/AccessDenied";
import ClientSelectionRequired from "@/pages/webproc/ClientSelectionRequired";

const clientNavItems = [
  { to: "/app/pulse", label: "Pulse", icon: Activity, end: true },
  { to: "/app/processos", label: "Protocolos", icon: FileText, end: true },
  { to: "/app/processos/novo", label: "Novo protocolo", icon: Plus, end: false },
] as const;

const actusNavItems = [
  { to: "/app/pulse", label: "Pulse", icon: Activity, end: true },
  { to: "/app/processos", label: "Protocolos", icon: FileText, end: true },
] as const;

const actusAdminNavItem = {
  to: "/app/admin",
  label: "Administração",
  icon: Building2,
  end: true,
} as const;

function NavLinks({
  items,
  onNavigate,
}: {
  items: readonly { to: string; label: string; icon: typeof FileText; end: boolean }[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-smooth",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-primary",
            ].join(" ")
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function WebProcShell() {
  const { user, connectAccess, membership, loading } = useWebProc();
  const navigate = useNavigate();

  const isActus = connectAccess.kind === "ACTUS";
  const isClient = connectAccess.kind === "CLIENT";
  const adminCapability = useActusAdminCapabilityQuery(connectAccess, user?.id);
  const showAdminNav =
    isActus && adminCapability.isSuccess && adminCapability.data === true;
  const navItems = isActus
    ? showAdminNav
      ? [...actusNavItems, actusAdminNavItem]
      : [...actusNavItems]
    : isClient
      ? clientNavItems
      : [];

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-background">
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

  const headerSubtitle = isActus
    ? "Ambiente de supervisão Actus"
    : membership?.cliente.nome ?? "Actus Connect";

  const headerTitle = isActus ? "Actus Connect" : "Actus Connect";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Abrir menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72">
                  <div className="mb-6">
                    <p className="font-serif text-lg font-bold text-primary">{headerTitle}</p>
                    <p className="text-sm text-muted-foreground truncate">{headerSubtitle}</p>
                  </div>
                  <NavLinks items={navItems} />
                </SheetContent>
              </Sheet>
            </div>
            <div className="min-w-0">
              <p className="font-serif text-lg font-bold text-primary leading-tight">
                {headerTitle}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{headerSubtitle}</p>
            </div>
          </div>

          <div className="hidden md:block">
            <NavLinks items={navItems} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl scroll-pt-[5.5rem] px-4 py-6 sm:px-6 sm:py-8">
        {isActus && (
          <p className="mb-6 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Você está no Actus Connect com autorização interna Actus (escopo transversal de
            supervisão). Operações exclusivas de cliente não estão disponíveis neste perfil.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
