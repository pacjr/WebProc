import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function AccessDenied() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-background px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-card text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-primary mb-2">
          Acesso não autorizado
        </h1>
        <p className="text-muted-foreground mb-6">
          Sua conta está autenticada, mas não possui vínculo ativo com um cliente
          WebProc. Entre em contato com a Actus para solicitar acesso.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" asChild>
            <Link to="/">Voltar ao site</Link>
          </Button>
          <Button variant="legal" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
