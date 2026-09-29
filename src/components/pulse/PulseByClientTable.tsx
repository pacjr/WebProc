import { AlertCircle } from "lucide-react";
import type { PulseClientAggregate } from "@/integrations/supabase/pulse-types";
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
      </CardContent>
    </Card>
  );
}

function formatClientLabel(row: PulseClientAggregate): string {
  const name = row.cliente_nome?.trim() || "Cliente não identificado";
  if (!row.cliente_ativo) {
    return `${name} (inativo)`;
  }
  return name;
}

export function PulseByClientTable({
  rows,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
}: {
  rows: PulseClientAggregate[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (isLoading && !rows) {
    return (
      <section aria-labelledby="pulse-by-client-heading">
        <h2 id="pulse-by-client-heading" className="mb-4 text-lg font-semibold">
          Distribuição por cliente
        </h2>
        <TableSkeleton />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-labelledby="pulse-by-client-heading">
        <h2 id="pulse-by-client-heading" className="mb-4 text-lg font-semibold">
          Distribuição por cliente
        </h2>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a distribuição por cliente</AlertTitle>
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

  return (
    <section aria-labelledby="pulse-by-client-heading">
      <h2 id="pulse-by-client-heading" className="mb-4 text-lg font-semibold">
        Distribuição por cliente
      </h2>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Volume de demandas cadastradas por cliente
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Demandas registradas no Actus Connect no período aplicado — universo analítico do
            Connect, não volume operacional total da Actus.
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
              Nenhum volume por cliente neste período.
            </p>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Cliente</TableHead>
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
                    <TableRow key={row.cliente_id}>
                      <TableCell className="min-w-[10rem]">{formatClientLabel(row)}</TableCell>
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
