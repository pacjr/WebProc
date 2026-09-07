import { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClienteProvider } from "@/contexts/ClienteContext";
import { WebProcProvider } from "@/contexts/WebProcContext";
import Navigation from "@/components/ui/navigation";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import DashboardHome from "@/pages/DashboardHome";
import CadastroProcessos from "@/pages/CadastroProcessos";
import ConsultaProcessos from "@/pages/ConsultaProcessos";
import RecuperarSenha from "@/pages/RecuperarSenha";
import NovaSenha from "@/pages/NovaSenha";
import NotFound from "@/pages/NotFound";
import WebProcShell from "@/components/webproc/WebProcShell";
import ProcessosList from "@/pages/webproc/ProcessosList";
import NovoProcesso from "@/pages/webproc/NovoProcesso";
import ProcessoDetail from "@/pages/webproc/ProcessoDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [currentSection, setCurrentSection] = useState("home");
  const location = useLocation();
  const isPublicOnlyRoute =
    location.pathname === "/" ||
    location.pathname.startsWith("/#");

  const hidePublicNavigation =
    location.pathname === "/auth" ||
    location.pathname === "/recuperar-senha" ||
    location.pathname === "/nova-senha" ||
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/app");

  const handleNavigation = (section: string) => {
    setCurrentSection(section);
  };

  return (
    <div className="min-h-screen">
      {!hidePublicNavigation && isPublicOnlyRoute && (
        <Navigation
          currentSection={currentSection}
          onSectionChange={handleNavigation}
        />
      )}
      {children}
    </div>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ClienteProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/app"
                  element={
                    <WebProcProvider>
                      <WebProcShell />
                    </WebProcProvider>
                  }
                >
                  <Route index element={<Navigate to="processos" replace />} />
                  <Route path="processos" element={<ProcessosList />} />
                  <Route path="processos/novo" element={<NovoProcesso />} />
                  <Route path="processos/:idProc" element={<ProcessoDetail />} />
                </Route>
                <Route path="/dashboard" element={<Dashboard />}>
                  <Route index element={<DashboardHome />} />
                  <Route path="cadastro" element={<CadastroProcessos />} />
                  <Route path="consulta" element={<ConsultaProcessos />} />
                </Route>
                <Route path="/recuperar-senha" element={<RecuperarSenha />} />
                <Route path="/nova-senha" element={<NovaSenha />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </ClienteProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
