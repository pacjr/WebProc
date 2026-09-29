import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { listProcessos, formatAuthorDisplay } from "@/integrations/supabase/webproc-api";
import type { WebProcProcessoListItem } from "@/integrations/supabase/webproc-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useWebProc } from "@/contexts/WebProcContext";

const statusLabels: Record<string, string> = {
  EM_PREENCHIMENTO: "Em preenchimento",
  PENDENTE: "Pendente",
  IMPORTADO: "Importado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy");
}

export default function ProcessosList() {
  const navigate = useNavigate();
  const { connectAccess } = useWebProc();
  const isClientActor = connectAccess.kind === "CLIENT";
  const [processos, setProcessos] = useState<WebProcProcessoListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProcessos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listProcessos();

    if (error) {
      toast.error("Erro ao carregar processos: " + error.message);
      setProcessos([]);
    } else {
      setProcessos(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProcessos();
  }, [loadProcessos]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">
            Processos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isClientActor
              ? "Processos visíveis para o seu cliente."
              : "Processos visíveis conforme permissões de supervisão Actus."}
          </p>
        </div>
        {isClientActor && (
          <Button variant="legal" asChild>
            <Link to="/app/processos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Processo
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            Carregando processos...
          </div>
        ) : processos.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum processo cadastrado ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID / Protocolo</TableHead>
                  <TableHead>Nº do Processo</TableHead>
                  <TableHead>Execução Provisória</TableHead>
                  <TableHead>Reclamante</TableHead>
                  <TableHead>Data de Entrada</TableHead>
                  <TableHead>Data Fatal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastrado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processos.map((processo) => {
                  const author = formatAuthorDisplay(processo.author);

                  return (
                  <TableRow
                    key={processo.id_proc}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/app/processos/${processo.id_proc}`)}
                  >
                    <TableCell className="font-medium">{processo.id_proc}</TableCell>
                    <TableCell>{processo.n_processo || "—"}</TableCell>
                    <TableCell>{processo.exec_prov || "—"}</TableCell>
                    <TableCell>{processo.reclamante || "—"}</TableCell>
                    <TableCell>{formatDate(processo.dt_entrada)}</TableCell>
                    <TableCell>{formatDate(processo.dt_fatal)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {statusLabels[processo.status] ?? processo.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="leading-tight">
                        <p className="font-medium">{author.primary}</p>
                        {author.secondary ? (
                          <p className="text-xs text-muted-foreground">
                            {author.secondary}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
