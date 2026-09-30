import { format } from "date-fns";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminClientesQuery } from "@/hooks/useAdminClientesQuery";

function formatDateTime(value: string) {
  return format(new Date(value), "dd/MM/yyyy HH:mm");
}

export default function AdminPage() {
  const clientesQuery = useAdminClientesQuery(true);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">
          Administração
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Gerencie o acesso e a estrutura de clientes do Connect.
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="admin-clientes-heading">
        <h2 id="admin-clientes-heading" className="font-serif text-xl font-semibold text-primary">
          Clientes
        </h2>

        {clientesQuery.isLoading ? (
          <div className="rounded-lg border border-border bg-card shadow-card p-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : clientesQuery.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar os clientes</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Tente novamente em instantes.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void clientesQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : clientesQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border bg-card shadow-card p-8 text-center text-muted-foreground">
            Nenhum cliente cadastrado.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden lg:table-cell">Atualizado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesQuery.data.map((cliente) => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {cliente.codigo_cliente}
                      </TableCell>
                      <TableCell className="min-w-[10rem]">{cliente.nome}</TableCell>
                      <TableCell>
                        <Badge variant={cliente.ativo ? "default" : "secondary"}>
                          {cliente.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm whitespace-nowrap">
                        {formatDateTime(cliente.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
