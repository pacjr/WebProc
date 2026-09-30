import { useState } from "react";
import { ArrowLeft, Mail, Pencil, Plus, Send } from "lucide-react";
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
import { useAdminClientMembershipMutations } from "@/hooks/useAdminClientMembershipMutations";
import { useAdminClientMembershipsQuery } from "@/hooks/useAdminClientMembershipsQuery";
import type { AdminCliente, AdminClientMembership } from "@/integrations/supabase/admin-types";
import { toAdminUserMessage } from "@/lib/admin-errors";
import {
  canProvisionMembership,
  membershipAccessSituationLabel,
  membershipProvisioningLabel,
  provisionOutcomeMessage,
} from "@/lib/admin-membership-copy";

type Props = {
  cliente: AdminCliente;
  onBack: () => void;
};

function displayNome(membership: AdminClientMembership): string {
  const trimmed = membership.nome?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "—";
}

export function AdminClientAcessosSection({ cliente, onBack }: Props) {
  const membershipsQuery = useAdminClientMembershipsQuery(cliente.id, true);
  const { createAccess, updateNome, setAtivo, provision } =
    useAdminClientMembershipMutations(cliente.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [createNome, setCreateNome] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<AdminClientMembership | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [ativoTarget, setAtivoTarget] = useState<AdminClientMembership | null>(null);
  const [ativoError, setAtivoError] = useState<string | null>(null);

  const [provisionTarget, setProvisionTarget] = useState<AdminClientMembership | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const resetCreateForm = () => {
    setCreateNome("");
    setCreateEmail("");
    setCreateError(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const openEdit = (membership: AdminClientMembership) => {
    setEditTarget(membership);
    setEditNome(membership.nome?.trim() ?? "");
    setEditError(null);
  };

  const handleCreate = async () => {
    setCreateError(null);
    const nome = createNome.trim();
    const email = createEmail.trim();
    if (!nome) {
      setCreateError("Informe o nome da pessoa.");
      return;
    }
    if (!email || !email.includes("@")) {
      setCreateError("Informe um e-mail válido.");
      return;
    }
    try {
      await createAccess.mutateAsync({ nome, email });
      toast.success("Acesso criado.");
      setCreateOpen(false);
      resetCreateForm();
    } catch (error) {
      setCreateError(toAdminUserMessage(error));
    }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setEditError(null);
    const nome = editNome.trim();
    if (!nome) {
      setEditError("Informe o nome da pessoa.");
      return;
    }
    try {
      await updateNome.mutateAsync({ membershipId: editTarget.id, nome });
      toast.success("Nome atualizado.");
      setEditTarget(null);
    } catch (error) {
      setEditError(toAdminUserMessage(error));
    }
  };

  const ativoIsDeactivate = ativoTarget?.ativo === true;

  const handleAtivoConfirm = async () => {
    if (!ativoTarget) return;
    setAtivoError(null);
    const nextAtivo = !ativoTarget.ativo;
    try {
      await setAtivo.mutateAsync({ membershipId: ativoTarget.id, ativo: nextAtivo });
      toast.success(nextAtivo ? "Acesso reativado." : "Acesso desativado.");
      setAtivoTarget(null);
    } catch (error) {
      setAtivoError(toAdminUserMessage(error));
    }
  };

  const handleProvisionConfirm = async () => {
    if (!provisionTarget) return;
    setProvisionError(null);
    try {
      const result = await provision.mutateAsync(provisionTarget.id);
      toast.success(provisionOutcomeMessage(result.outcome));
      setProvisionTarget(null);
    } catch (error) {
      setProvisionError(toAdminUserMessage(error));
    }
  };

  const anyMutationPending =
    createAccess.isPending ||
    updateNome.isPending ||
    setAtivo.isPending ||
    provision.isPending;

  return (
    <section className="space-y-6" aria-labelledby="admin-acessos-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar aos clientes
          </Button>
          <div>
            <h2 id="admin-acessos-heading" className="font-serif text-xl font-semibold text-primary">
              Acessos
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Cliente: <span className="text-foreground font-medium">{cliente.nome}</span>
              {!cliente.ativo ? (
                <span className="text-destructive"> (cliente inativo)</span>
              ) : null}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="legal"
          size="sm"
          className="w-full sm:w-auto shrink-0"
          onClick={openCreate}
          disabled={!cliente.ativo || anyMutationPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          Novo acesso
        </Button>
      </div>

      {!cliente.ativo ? (
        <Alert variant="destructive">
          <AlertTitle>Cliente inativo</AlertTitle>
          <AlertDescription>
            Novos acessos e convites ficam indisponíveis enquanto o cliente estiver inativo.
          </AlertDescription>
        </Alert>
      ) : null}

      {membershipsQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : membershipsQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os acessos</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{toAdminUserMessage(membershipsQuery.error)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void membershipsQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : membershipsQuery.data.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card p-8 text-center text-muted-foreground">
          Nenhum acesso cadastrado para este cliente.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Acesso ao sistema</TableHead>
                  <TableHead className="text-right w-[1%]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membershipsQuery.data.map((membership) => {
                  const showProvision = canProvisionMembership(membership);
                  return (
                    <TableRow key={membership.id}>
                      <TableCell className="min-w-[8rem]">{displayNome(membership)}</TableCell>
                      <TableCell className="min-w-[10rem] break-all">{membership.email}</TableCell>
                      <TableCell>
                        <Badge variant={membership.ativo ? "default" : "secondary"}>
                          {membershipAccessSituationLabel(membership.ativo)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {membershipProvisioningLabel(membership.provisioning_state)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(membership)}
                            aria-label={`Editar acesso de ${displayNome(membership)}`}
                            disabled={anyMutationPending}
                          >
                            <Pencil className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Editar</span>
                          </Button>
                          {showProvision ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setProvisionError(null);
                                setProvisionTarget(membership);
                              }}
                              disabled={anyMutationPending || !cliente.ativo}
                            >
                              <Send className="h-4 w-4 sm:mr-1" />
                              <span className="hidden sm:inline">Enviar convite</span>
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAtivoError(null);
                              setAtivoTarget(membership);
                            }}
                            disabled={anyMutationPending}
                          >
                            {membership.ativo ? "Desativar" : "Reativar"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
            <DialogTitle>Novo acesso</DialogTitle>
            <DialogDescription>
              Cadastre uma pessoa para acessar o Connect neste cliente. O e-mail será usado no
              convite de ativação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="admin-access-nome">Nome</Label>
              <Input
                id="admin-access-nome"
                value={createNome}
                onChange={(e) => setCreateNome(e.target.value)}
                disabled={createAccess.isPending}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-access-email">E-mail</Label>
              <Input
                id="admin-access-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                disabled={createAccess.isPending}
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
              disabled={createAccess.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="legal"
              onClick={() => void handleCreate()}
              disabled={createAccess.isPending}
            >
              {createAccess.isPending ? "Salvando…" : "Criar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar acesso</DialogTitle>
            <DialogDescription>Altere o nome exibido para esta pessoa.</DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="admin-edit-access-nome">Nome</Label>
                <Input
                  id="admin-edit-access-nome"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  disabled={updateNome.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-edit-access-email">E-mail</Label>
                <Input
                  id="admin-edit-access-email"
                  type="email"
                  value={editTarget.email}
                  readOnly
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  O e-mail não pode ser alterado após o cadastro do acesso.
                </p>
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
              onClick={() => setEditTarget(null)}
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
              {ativoIsDeactivate ? "Desativar acesso" : "Reativar acesso"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {ativoTarget ? (
                  <p>
                    Pessoa:{" "}
                    <strong className="text-foreground">{displayNome(ativoTarget)}</strong>
                    <br />
                    <span className="inline-flex items-center gap-1 break-all">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {ativoTarget.email}
                    </span>
                  </p>
                ) : null}
                {ativoIsDeactivate ? (
                  <p>
                    O vínculo de acesso ficará indisponível no Connect. A identidade de autenticação
                    não é removida; apenas este acesso ao cliente deixa de estar ativo.
                  </p>
                ) : (
                  <p>
                    A reativação restaura a elegibilidade deste acesso, respeitando a regra de um
                    cliente ativo por pessoa.
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
            <AlertDialogCancel disabled={setAtivo.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleAtivoConfirm();
              }}
              disabled={setAtivo.isPending}
              className={
                ativoIsDeactivate
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {setAtivo.isPending
                ? "Aguarde…"
                : ativoIsDeactivate
                  ? "Desativar"
                  : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={provisionTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setProvisionTarget(null);
            setProvisionError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar convite de acesso</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {provisionTarget ? (
                  <p>
                    Será iniciado o provisionamento para{" "}
                    <strong className="text-foreground">{provisionTarget.email}</strong>. Se já
                    existir conta com este e-mail, o acesso será vinculado em vez de criar convite.
                  </p>
                ) : null}
                <p>
                  O envio do convite não garante entrega do e-mail; isso depende do provedor e da
                  caixa de entrada do destinatário.
                </p>
                {provisionError ? (
                  <p className="text-destructive" role="alert">
                    {provisionError}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={provision.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleProvisionConfirm();
              }}
              disabled={provision.isPending}
            >
              {provision.isPending ? "Provisionando…" : "Enviar convite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
