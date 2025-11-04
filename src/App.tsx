import { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClienteProvider } from "@/contexts/ClienteContext";
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

const queryClient = new QueryClient();

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [currentSection, setCurrentSection] = useState("home");
  const location = useLocation();
  const isAuthPage = location.pathname === "/auth" || location.pathname === "/recuperar-senha" || location.pathname === "/nova-senha" || location.pathname.startsWith("/dashboard");

  const handleNavigation = (section: string) => {
    setCurrentSection(section);
  };

  return (
    <div className="min-h-screen">
      {!isAuthPage && (
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
