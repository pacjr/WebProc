import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Neutral in-shell denial for /app/admin without exposing role internals. */
export function AdminAreaDenied() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 shadow-card text-center max-w-lg mx-auto">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="font-serif text-xl font-bold text-primary mb-2">
        Área restrita
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Você não tem permissão para acessar esta área do Connect.
      </p>
      <Button variant="outline" asChild>
        <Link to="/app/processos">Voltar aos processos</Link>
      </Button>
    </div>
  );
}
