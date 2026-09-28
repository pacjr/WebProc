import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WebProcProvider } from "@/contexts/WebProcContext";
import Auth from "@/pages/Auth";
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

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
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
            {/* Reserved for WP-04 native Connect Dashboard; temporary redirect */}
            <Route path="/dashboard" element={<Navigate to="/app/processos" replace />} />
            <Route path="/dashboard/*" element={<Navigate to="/app/processos" replace />} />
            <Route path="/recuperar-senha" element={<RecuperarSenha />} />
            <Route path="/nova-senha" element={<NovaSenha />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
