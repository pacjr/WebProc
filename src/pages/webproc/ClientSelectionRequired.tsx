import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { navigateToInstitutionalSite } from "@/lib/site-entry";
import { useWebProc } from "@/contexts/WebProcContext";

export default function ClientSelectionRequired() {
  const { connectAccess } = useWebProc();

  const memberships =
    connectAccess.kind === "CLIENT_SELECTION_REQUIRED"
      ? connectAccess.memberships
      : [];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-background px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-primary mb-2 text-center">
          Seleção de cliente necessária
        </h1>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          Sua conta possui vínculo ativo com mais de um cliente no Actus Connect.
          A escolha do cliente de trabalho será disponibilizada em uma atualização
          futura. Entre em contato com a Actus se precisar de acesso imediato.
        </p>
        {memberships.length > 0 && (
          <ul className="mb-6 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground space-y-1">
            {memberships.map((m) => (
              <li key={m.membershipId}>{m.cliente.nome}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" type="button" onClick={navigateToInstitutionalSite}>
            Voltar ao site
          </Button>
          <Button variant="legal" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
