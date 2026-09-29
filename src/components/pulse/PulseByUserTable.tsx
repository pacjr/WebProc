import { AlertCircle } from "lucide-react";
import type { PulseUserAggregate } from "@/integrations/supabase/pulse-types";
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
import {
  formatRegisteredParticipation,
  sumRegisteredAggregateCounts,
} from "@/lib/pulse-participation";

function TableSkeleton() {
  return (
    <Card className="shadow-card">
      <CardHeader className="p-4 sm:p-6">
        <Skeleton className="h-5 w-56" />
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

function userRowKey(row: PulseUserAggregate): string {
  return `${row.cliente_id}:${row.user_id}`;
}

function formatUserLabel(row: PulseUserAggregate): string {
  const name = row.display_name?.trim() || "Usuário desconhecido";
  if (!row.membership_active) {
    return `${name} (associação inativa)`;
  }
  return name;
}

const UNRESOLVED_CLIENTE_LABEL = "Cliente não identificado";

export function PulseByUserTable({
  rows,
  isActus,
  clienteLabelById,
  actusClienteLabelContext,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
}: {
  rows: PulseUserAggregate[] | undefined;
  isActus: boolean;
  clienteLabelById?: ReadonlyMap<number, string>;
  /** When ACTUS rows need client disambiguation, wait for by-client projection before showing the table. */
  actusClienteLabelContext?: "loading" | "ready" | "unavailable" | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (isLoading && !rows) {
    return (
      <section aria-labelledby="pulse-by-user-heading">
        <h2 id="pulse-by-user-heading" className="mb-4 text-lg font-semibold">
          Distribuição por usuário
        </h2>
        <TableSkeleton />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-labelledby="pulse-by-user-heading">
        <h2 id="pulse-by-user-heading" className="mb-4 text-lg font-semibold">
          Distribuição por usuário
        </h2>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a distribuição por usuário</AlertTitle>
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

  if (!rows) {
    return null;
  }

  const total = sumRegisteredAggregateCounts(rows);

  const waitingForActusClienteLabels =
    isActus &&
    total > 0 &&
    actusClienteLabelContext === "loading";

  function clienteCell(clienteId: number): string {
    const fromMap = clienteLabelById?.get(clienteId);
    if (fromMap) return fromMap;
    return UNRESOLVED_CLIENTE_LABEL;
  }

  if (waitingForActusClienteLabels) {
    return (
      <section aria-labelledby="pulse-by-user-heading">
        <h2 id="pulse-by-user-heading" className="mb-4 text-lg font-semibold">
          Distribuição por usuário
        </h2>
        <Card className="shadow-card" aria-busy="true" aria-live="polite">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="text-base font-semibold">
              Volume de demandas cadastradas por usuário
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Carregando contexto de clientes para exibir a distribuição…
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="pulse-by-user-heading">
      <h2 id="pulse-by-user-heading" className="mb-4 text-lg font-semibold">
        Distribuição por usuário
      </h2>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Volume de demandas cadastradas por usuário
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Contagem de demandas registradas no Actus Connect no período e filtros aplicados —
            identidade conforme projeção analítica do servidor.
          </p>
          {isFetching ? (
            <p className="text-xs text-muted-foreground mt-1" aria-live="polite">
              Atualizando distribuição…
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-2">
          {total === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              Nenhum cadastro de demanda para distribuir neste período.
            </p>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Usuário</TableHead>
                    {isActus ? <TableHead scope="col">Cliente</TableHead> : null}
                    <TableHead scope="col" className="text-right">
                      Demandas cadastradas
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Participação
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={userRowKey(row)}>
                      <TableCell className="min-w-[10rem]">{formatUserLabel(row)}</TableCell>
                      {isActus ? (
                        <TableCell className="min-w-[8rem]">{clienteCell(row.cliente_id)}</TableCell>
                      ) : null}
                      <TableCell className="text-right tabular-nums">{row.count ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRegisteredParticipation(row.count ?? 0, total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
