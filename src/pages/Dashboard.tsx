import { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useCliente } from "@/contexts/ClienteContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

const Dashboard = () => {
  const { cliente, user, loading } = useCliente();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!user || !cliente) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background via-accent/5 to-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h2 className="text-xl font-serif font-bold text-primary">
                Actus Nível
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <span className="text-sm text-muted-foreground">
                {cliente.nome_cliente}
              </span>
              <Button variant="outline" onClick={handleLogout} size="sm">
                Sair
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
