import { useState } from "react";
import { format } from "date-fns";
import { AlertCircle, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminClienteMutations } from "@/hooks/useAdminClienteMutations";
import { useAdminClientesQuery } from "@/hooks/useAdminClientesQuery";
import type { AdminCliente } from "@/integrations/supabase/admin-types";
import { toAdminUserMessage } from "@/lib/admin-errors";

function formatDateTime(value: string) {
  return format(new Date(value), "dd/MM/yyyy HH:mm");
}

function parseCodigoCliente(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function AdminClientesSection() {
  const clientesQuery = useAdminClientesQuery(true);
  const { createCliente, updateNome, setAtivo } = useAdminClienteMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [createCodigo, setCreateCodigo] = useState("");
  const [createNome, setCreateNome] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editCliente, setEditCliente] = useState<AdminCliente | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [ativoTarget, setAtivoTarget] = useState<AdminCliente | null>(null);
  const [ativoError, setAtivoError] = useState<string | null>(null);

  const resetCreateForm = () => {
    setCreateCodigo("");
    setCreateNome("");
    setCreateError(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const openEdit = (cliente: AdminCliente) => {
    setEditCliente(cliente);
    setEditNome(cliente.nome);
    setEditError(null);
  };

  const handleCreate = async () => {
    setCreateError(null);
    const codigo = parseCodigoCliente(createCodigo);
    const nome = createNome.trim();
    if (codigo === null) {
      setCreateError("Informe um código numérico válido.");
      return;
    }
    if (!nome) {
      setCreateError("Informe o nome do cliente.");
      return;
    }

    try {
      await createCliente.mutateAsync({ codigoCliente: codigo, nome });
      toast.success("Cliente criado com sucesso.");
      setCreateOpen(false);
      resetCreateForm();
    } catch (error) {
      setCreateError(toAdminUserMessage(error));
    }
  };

  const handleEdit = async () => {
    if (!editCliente) return;
    setEditError(null);
    const nome = editNome.trim();
    if (!nome) {
      setEditError("Informe o nome do cliente.");
      return;
    }

    try {
      await updateNome.mutateAsync({ clienteId: editCliente.id, nome });
      toast.success("Cliente atualizado.");
      setEditCliente(null);
    } catch (error) {
      setEditError(toAdminUserMessage(error));
    }
  };

  const handleAtivoConfirm = async () => {
    if (!ativoTarget) return;
    setAtivoError(null);
    const nextAtivo = !ativoTarget.ativo;

    try {
      await setAtivo.mutateAsync({ clienteId: ativoTarget.id, ativo: nextAtivo });
      toast.success(nextAtivo ? "Cliente reativado." : "Cliente desativado.");
      setAtivoTarget(null);
    } catch (error) {
      setAtivoError(toAdminUserMessage(error));
    }
  };

  const ativoPending = setAtivo.isPending;
  const ativoIsDeactivate = ativoTarget?.ativo === true;

  return (
    <section className="space-y-4" aria-labelledby="admin-clientes-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="admin-clientes-heading" className="font-serif text-xl font-semibold text-primary">
          Clientes
        </h2>
        <Button type="button" variant="legal" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo cliente
        </Button>
      </div>

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
                  <TableHead className="text-right w-[1%]">Ações</TableHead>
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
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(cliente)}
                          aria-label={`Editar ${cliente.nome}`}
                        >
                          <Pencil className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Editar</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAtivoError(null);
                            setAtivoTarget(cliente);
                          }}
                        >
                          {cliente.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>
              Cadastre um cliente no Connect. O código não poderá ser alterado depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="admin-create-codigo">Código</Label>
              <Input
                id="admin-create-codigo"
                inputMode="numeric"
                autoComplete="off"
                value={createCodigo}
                onChange={(e) => setCreateCodigo(e.target.value)}
                disabled={createCliente.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-create-nome">Nome do cliente</Label>
              <Input
                id="admin-create-nome"
                value={createNome}
                onChange={(e) => setCreateNome(e.target.value)}
                disabled={createCliente.isPending}
              />
            </div>
            {createError ? (
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createCliente.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="legal"
              onClick={() => void handleCreate()}
              disabled={createCliente.isPending}
            >
              {createCliente.isPending ? "Salvando…" : "Criar cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editCliente !== null}
        onOpenChange={(open) => {
          if (!open) setEditCliente(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>Altere o nome exibido no Connect.</DialogDescription>
          </DialogHeader>
          {editCliente ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Código</p>
                <p className="text-sm font-mono text-muted-foreground">
                  {editCliente.codigo_cliente}
                </p>
                <p className="text-xs text-muted-foreground">
                  O código do cliente não pode ser alterado após o cadastro.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-edit-nome">Nome do cliente</Label>
                <Input
                  id="admin-edit-nome"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  disabled={updateNome.isPending}
                />
              </div>
              {editError ? (
                <p className="text-sm text-destructive" role="alert">
                  {editError}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditCliente(null)}
              disabled={updateNome.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="legal"
              onClick={() => void handleEdit()}
              disabled={updateNome.isPending}
            >
              {updateNome.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={ativoTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAtivoTarget(null);
            setAtivoError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ativoIsDeactivate ? "Desativar cliente" : "Reativar cliente"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {ativoTarget ? (
                  <p>
                    Cliente: <strong className="text-foreground">{ativoTarget.nome}</strong>
                  </p>
                ) : null}
                {ativoIsDeactivate ? (
                  <p>
                    Ao desativar, o acesso normal ao Connect ficará indisponível para usuários
                    deste cliente enquanto ele permanecer inativo. Os cadastros existentes não
                    são apagados.
                  </p>
                ) : (
                  <p>
                    A reativação restaura a elegibilidade de acesso ao Connect para este cliente,
                    conforme as regras de autorização vigentes.
                  </p>
                )}
                {ativoError ? (
                  <p className="text-destructive" role="alert">
                    {ativoError}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ativoPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleAtivoConfirm();
              }}
              disabled={ativoPending}
              className={ativoIsDeactivate ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {ativoPending
                ? "Aguarde…"
                : ativoIsDeactivate
                  ? "Desativar"
                  : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
