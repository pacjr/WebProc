import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { listProcessos, formatAuthorDisplay } from "@/integrations/supabase/webproc-api";
import type { WebProcProcessoListItem } from "@/integrations/supabase/webproc-types";
import { getBusinessDateToday } from "@/integrations/supabase/webproc-validation";
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
import { processoStatusLabel } from "@/lib/webproc-status-labels";

function formatDate(value: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy");
}

function isDtFatalOverdue(
  dtFatal: string | null,
  status: WebProcProcessoListItem["status"],
) {
  if (!dtFatal) return false;
  if (status !== "EM_PREENCHIMENTO" && status !== "PENDENTE") return false;
  const fatalDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dtFatal));
  return fatalDay < getBusinessDateToday();
}

function ProtocoloListCard({
  item,
  onOpen,
}: {
  item: WebProcProcessoListItem;
  onOpen: () => void;
}) {
  const author = formatAuthorDisplay(item.author);
  const overdue = isDtFatalOverdue(item.dt_fatal, item.status);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-card p-4 text-left shadow-card transition-smooth hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif font-semibold text-primary">Protocolo #{item.id_proc}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {item.n_processo || item.exec_prov || "Sem número informado"}
          </p>
        </div>
        <Badge variant="secondary">{processoStatusLabel(item.status)}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Reclamante</dt>
          <dd className="font-medium truncate">{item.reclamante || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Data fatal</dt>
          <dd className="font-medium flex flex-wrap items-center gap-2">
            {formatDate(item.dt_fatal)}
            {overdue ? (
              <Badge variant="destructive" className="text-xs">
                Prazo vencido
              </Badge>
            ) : null}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Cadastrado por</dt>
          <dd className="font-medium">{author.primary}</dd>
        </div>
      </dl>
    </button>
  );
}

export default function ProcessosList() {
  const navigate = useNavigate();
  const { connectAccess } = useWebProc();
  const isClientActor = connectAccess.kind === "CLIENT";
  const [processos, setProcessos] = useState<WebProcProcessoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProcessos = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await listProcessos();

    if (error) {
      const message = error.message;
      setLoadError(message);
      toast.error("Erro ao carregar protocolos: " + message);
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
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">Protocolos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isClientActor
              ? "Protocolos visíveis para o seu cliente."
              : "Protocolos visíveis conforme permissões de supervisão Actus."}
          </p>
        </div>
        {isClientActor && (
          <Button variant="legal" asChild>
            <Link to="/app/processos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo protocolo
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground" aria-busy="true">
            Carregando protocolos...
          </div>
        ) : loadError ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-muted-foreground">
              Não foi possível carregar os protocolos. Tente novamente.
            </p>
            <Button type="button" variant="outline" onClick={() => void loadProcessos()}>
              Tentar novamente
            </Button>
          </div>
        ) : processos.length === 0 ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-muted-foreground">Nenhum protocolo cadastrado ainda.</p>
            {isClientActor ? (
              <Button variant="legal" asChild>
                <Link to="/app/processos/novo">Criar primeiro protocolo</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="md:hidden p-4 space-y-3">
              {processos.map((processo) => (
                <ProtocoloListCard
                  key={processo.id_proc}
                  item={processo}
                  onOpen={() => navigate(`/app/processos/${processo.id_proc}`)}
                />
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Protocolo</TableHead>
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
                    const overdue = isDtFatalOverdue(processo.dt_fatal, processo.status);

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
                        <TableCell>
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {formatDate(processo.dt_fatal)}
                            {overdue ? (
                              <Badge variant="destructive" className="text-xs">
                                Prazo vencido
                              </Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {processoStatusLabel(processo.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="leading-tight">
                            <p className="font-medium">{author.primary}</p>
                            {author.secondary ? (
                              <p className="text-xs text-muted-foreground">{author.secondary}</p>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
