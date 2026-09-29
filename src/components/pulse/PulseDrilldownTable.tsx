import { Link } from "react-router-dom";
import { AlertCircle, ExternalLink } from "lucide-react";
import type { PulseDrilldownRow } from "@/integrations/supabase/pulse-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPulseRegistrationTimestamp } from "@/lib/pulse-dates";
import { processoStatusLabel } from "@/lib/webproc-status-labels";

function TableSkeleton() {
  return (
    <Card className="shadow-card">
      <CardHeader className="p-4 sm:p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

function formatAuthorLabel(row: PulseDrilldownRow): string {
  const name = row.author_display_name?.trim() || "Usuário desconhecido";
  if (!row.author_membership_active) {
    return `${name} (associação inativa)`;
  }
  return name;
}

function formatProcessNumber(row: PulseDrilldownRow): string {
  const n = row.n_processo?.trim();
  return n && n.length > 0 ? n : "—";
}

function formatClientLabel(row: PulseDrilldownRow): string {
  return row.cliente_nome?.trim() || "Cliente não identificado";
}

export function PulseDrilldownTable({
  rows,
  isActus,
  isLoading,
  isRefetching,
  isError,
  error,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPageError,
  onLoadMore,
  onRetryLoadMore,
}: {
  rows: PulseDrilldownRow[];
  isActus: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPageError: Error | null;
  onLoadMore: () => void;
  onRetryLoadMore: () => void;
}) {
  if (isLoading && rows.length === 0) {
    return (
      <section aria-labelledby="pulse-drilldown-heading">
        <h2 id="pulse-drilldown-heading" className="mb-4 text-lg font-semibold">
          Demandas
        </h2>
        <TableSkeleton />
      </section>
    );
  }

  if (isError && rows.length === 0) {
    return (
      <section aria-labelledby="pulse-drilldown-heading">
        <h2 id="pulse-drilldown-heading" className="mb-4 text-lg font-semibold">
          Demandas
        </h2>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar as demandas</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error?.message ?? "Erro desconhecido"}</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby="pulse-drilldown-heading">
      <h2 id="pulse-drilldown-heading" className="mb-4 text-lg font-semibold">
        Demandas
      </h2>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Demandas no escopo analítico aplicado
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Demandas que compõem o universo analítico atual (cadastro no período e filtros
            aplicados). Para operação completa, abra o detalhe do processo.
          </p>
          {isRefetching && rows.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-1" aria-live="polite">
              Atualizando lista…
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
          {rows.length === 0 && !isLoading && !isRefetching ? (
            <p className="text-sm text-muted-foreground" role="status">
              Nenhuma demanda encontrada neste período.
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="max-w-full overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Processo</TableHead>
                    <TableHead scope="col">Nº processo</TableHead>
                    {isActus ? <TableHead scope="col">Cliente</TableHead> : null}
                    <TableHead scope="col">Cadastrado em</TableHead>
                    <TableHead scope="col">Situação</TableHead>
                    <TableHead scope="col">Autor</TableHead>
                    <TableHead scope="col" className="text-right">
                      Detalhe
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id_proc}>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        #{row.id_proc}
                      </TableCell>
                      <TableCell className="min-w-[8rem] max-w-[12rem] truncate">
                        {formatProcessNumber(row)}
                      </TableCell>
                      {isActus ? (
                        <TableCell className="min-w-[8rem] max-w-[14rem] truncate">
                          {formatClientLabel(row)}
                        </TableCell>
                      ) : null}
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatPulseRegistrationTimestamp(row.created_at)}
                      </TableCell>
                      <TableCell>{processoStatusLabel(row.status)}</TableCell>
                      <TableCell className="min-w-[8rem] max-w-[14rem] truncate">
                        {formatAuthorLabel(row)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2"
                          asChild
                        >
                          <Link to={`/app/processos/${row.id_proc}`}>
                            Ver processo
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only"> processo {row.id_proc}</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {hasNextPage ? (
            <div className="flex flex-col items-start gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={onLoadMore}
              >
                {isFetchingNextPage ? "Carregando…" : "Carregar mais"}
              </Button>
            </div>
          ) : null}

          {isFetchNextPageError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar mais demandas</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{fetchNextPageError?.message ?? "Erro desconhecido"}</span>
                <Button type="button" variant="outline" size="sm" onClick={onRetryLoadMore}>
                  Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
