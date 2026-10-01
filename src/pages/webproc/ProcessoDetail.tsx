import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import ProcessoDocumentosSection from "@/components/webproc/ProcessoDocumentosSection";
import ProcessoFormFields, {
  emptyProcessoForm,
  formStateToDraftUpdate,
  processoToFormState,
  type ProcessoFormState,
} from "@/components/webproc/ProcessoFormFields";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWebProc } from "@/contexts/WebProcContext";
import {
  addProcessoLink,
  cancelarProcesso,
  countActiveProcessoDocumentsForProtocol,
  formatAuthorDisplay,
  getProcessoDetail,
  getProtocolRequirements,
  listProcessoDocuments,
  mapWebprocDomainError,
  protocolarProcesso,
  reabrirProcesso,
  removerDocumento,
  saveProcessoDraft,
} from "@/integrations/supabase/webproc-api";
import {
  getFirstValidationMessage,
  validateLinkUrl,
  validateProtocolFields,
  validateProtocoloDraftFields,
} from "@/integrations/supabase/webproc-validation";
import type { WebProcProcessoDetail, WebProcProcessoDocument } from "@/integrations/supabase/webproc-types";
import { toast } from "sonner";
import { processoStatusLabel } from "@/lib/webproc-status-labels";

export default function ProcessoDetail() {
  const { idProc } = useParams();
  const { user, connectAccess } = useWebProc();
  const canMutateAsClient = connectAccess.kind === "CLIENT";
  const parsedId = Number(idProc);

  const [processo, setProcesso] = useState<WebProcProcessoDetail | null>(null);
  const [documents, setDocuments] = useState<WebProcProcessoDocument[]>([]);
  const [pendingRemoveDocument, setPendingRemoveDocument] =
    useState<WebProcProcessoDocument | null>(null);
  const [form, setForm] = useState<ProcessoFormState>(emptyProcessoForm);
  const [linkNome, setLinkNome] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkUrlError, setLinkUrlError] = useState<string | null>(null);
  const [dtFatalError, setDtFatalError] = useState<string | null>(null);
  const [identificacaoError, setIdentificacaoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [protocolando, setProtocolando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const isCreator = Boolean(processo && user && processo.created_by === user.id);
  const canEdit = Boolean(
    canMutateAsClient && isCreator && processo?.status === "EM_PREENCHIMENTO",
  );
  const canReopen = Boolean(canMutateAsClient && isCreator && processo?.status === "PENDENTE");
  const canCancel = Boolean(
    canMutateAsClient &&
      isCreator &&
      (processo?.status === "EM_PREENCHIMENTO" || processo?.status === "PENDENTE"),
  );

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(parsedId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ processo: loadedProcesso, error }, { data: loadedDocuments, error: documentsError }] =
      await Promise.all([
        getProcessoDetail(parsedId),
        listProcessoDocuments(parsedId),
      ]);

    if (error) {
      toast.error("Erro ao carregar protocolo: " + error.message);
      setProcesso(null);
      setDocuments([]);
    } else if (!loadedProcesso) {
      setProcesso(null);
      setDocuments([]);
    } else {
      setProcesso(loadedProcesso);
      setForm(processoToFormState(loadedProcesso));
    }

    if (documentsError) {
      toast.error("Erro ao carregar documentos: " + documentsError.message);
      setDocuments([]);
    } else {
      setDocuments(loadedDocuments);
    }

    setLoading(false);
  }, [parsedId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const updateField = (field: keyof ProcessoFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "dt_fatal" && dtFatalError) {
      setDtFatalError(null);
    }
    if ((field === "n_processo" || field === "exec_prov") && identificacaoError) {
      setIdentificacaoError(null);
    }
  };

  const activeDocumentCount = useMemo(
    () => countActiveProcessoDocumentsForProtocol(documents),
    [documents],
  );

  const protocolRequirements = useMemo(
    () => getProtocolRequirements(form, activeDocumentCount),
    [form, activeDocumentCount],
  );

  const persistDraft = async () => {
    if (!processo) {
      throw new Error("Protocolo indisponível.");
    }

    const draftValidation = validateProtocoloDraftFields(form);
    const draftMessage = getFirstValidationMessage(draftValidation);
    if (draftMessage) {
      setDtFatalError(draftValidation.dt_fatal ?? null);
      setIdentificacaoError(draftValidation.processo_ou_execucao ?? null);
      throw new Error(draftMessage);
    }

    setDtFatalError(null);
    setIdentificacaoError(null);

    const draftUpdate = formStateToDraftUpdate(form);
    const { result, error, message } = await saveProcessoDraft(processo.id_proc, {
      n_processo: draftUpdate.n_processo ?? null,
      exec_prov: draftUpdate.exec_prov ?? null,
      reclamante: draftUpdate.reclamante ?? null,
      reclamado: draftUpdate.reclamado ?? null,
      instrucao: draftUpdate.instrucao ?? null,
      obs: draftUpdate.obs ?? null,
      dt_fatal: draftUpdate.dt_fatal ?? null,
    });

    if (error) {
      throw error;
    }

    if (!result?.success) {
      if (result?.error === "invalid_dt_fatal_past") {
        setDtFatalError(message);
      }
      throw new Error(message ?? "Erro ao salvar rascunho.");
    }

    const { processo: refreshed, error: refreshError } = await getProcessoDetail(
      processo.id_proc,
    );

    if (refreshError || !refreshed) {
      throw refreshError ?? new Error("Erro ao recarregar protocolo.");
    }

    setProcesso(refreshed);
    setForm(processoToFormState(refreshed));
    return refreshed;
  };

  const handleSaveDraft = async () => {
    if (!canEdit || !processo) return;

    setSaving(true);
    try {
      await persistDraft();
      toast.success("Rascunho salvo.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido ao salvar.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!canEdit || !processo || !user) return;

    const linkValidation = validateLinkUrl(linkUrl);
    if (!linkValidation.valid) {
      setLinkUrlError(linkValidation.message);
      toast.error(linkValidation.message);
      return;
    }

    setLinkUrlError(null);
    setLinkSaving(true);
    try {
      const { error } = await addProcessoLink(processo.id_proc, user.id, {
        nome: linkNome.trim(),
        url: linkValidation.normalizedUrl,
      });

      if (error) {
        throw new Error(mapWebprocDomainError(error.message));
      }

      setLinkNome("");
      setLinkUrl("");
      setLinkUrlError(null);

      const { data: refreshedDocuments, error: documentsError } = await listProcessoDocuments(
        processo.id_proc,
      );

      if (documentsError) {
        throw documentsError;
      }

      setDocuments(refreshedDocuments);
      toast.success("Documento adicionado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido ao adicionar documento.";
      toast.error(message);
    } finally {
      setLinkSaving(false);
    }
  };

  const handleConfirmRemoveDocument = async () => {
    if (!canEdit || !processo || !pendingRemoveDocument) return;

    setLinkSaving(true);
    try {
      const { error, message } = await removerDocumento(pendingRemoveDocument.id);

      if (error) {
        throw new Error(message ?? error.message);
      }

      if (message) {
        throw new Error(message);
      }

      const { data: refreshedDocuments, error: documentsError } = await listProcessoDocuments(
        processo.id_proc,
      );

      if (documentsError) {
        throw documentsError;
      }

      setDocuments(refreshedDocuments);
      setPendingRemoveDocument(null);
      toast.success("Documento removido.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Não foi possível remover o documento.";
      toast.error(text);
    } finally {
      setLinkSaving(false);
    }
  };

  const handleProtocolar = async () => {
    if (!canEdit || !processo) return;

    setProtocolando(true);
    try {
      await persistDraft();

      const protocolErrors = validateProtocolFields(form, activeDocumentCount);
      const protocolMessage = getFirstValidationMessage(protocolErrors);
      if (protocolMessage) {
        setDtFatalError(protocolErrors.dt_fatal ?? null);
        setIdentificacaoError(protocolErrors.processo_ou_execucao ?? null);
        throw new Error(protocolMessage);
      }

      setDtFatalError(null);

      const { result, error, message } = await protocolarProcesso(processo.id_proc);

      if (error || !result?.success) {
        if (message?.includes("anterior à data de hoje")) {
          setDtFatalError(message);
        }
        throw new Error(message ?? error?.message ?? "Erro ao protocolar.");
      }

      await loadDetail();
      toast.success(
        result.already_protocolado
          ? "Protocolo já estava protocolado."
          : "Protocolo protocolado com sucesso.",
      );
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro desconhecido ao protocolar.";
      toast.error(text);
    } finally {
      setProtocolando(false);
    }
  };

  const handleReabrir = async () => {
    if (!canReopen || !processo) return;

    setReabrindo(true);
    try {
      const { result, error, message } = await reabrirProcesso(processo.id_proc);

      if (error || !result) {
        throw new Error(message ?? error?.message ?? "Erro ao reabrir protocolo.");
      }

      await loadDetail();
      toast.success(
        result.already_open
          ? "Protocolo já estava em preenchimento."
          : "Protocolo reaberto para correção.",
      );
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro desconhecido ao reabrir.";
      toast.error(text);
    } finally {
      setReabrindo(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!canCancel || !processo) return;

    setCancelando(true);
    try {
      const { result, error, message } = await cancelarProcesso(
        processo.id_proc,
        cancelMotivo,
      );

      if (error || !result?.success) {
        throw new Error(message ?? error?.message ?? "Erro ao cancelar protocolo.");
      }

      setCancelDialogOpen(false);
      setCancelMotivo("");
      await loadDetail();
      toast.success(
        result.already_cancelado
          ? "Protocolo já estava cancelado."
          : "Protocolo cancelado. O cadastro permanece registrado.",
      );
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro desconhecido ao cancelar.";
      toast.error(text);
    } finally {
      setCancelando(false);
    }
  };

  if (!Number.isFinite(parsedId)) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground mb-4">Protocolo inválido.</p>
        <Button variant="outline" asChild>
          <Link to="/app/processos">Voltar para protocolos</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground"
        aria-busy="true"
      >
        Carregando protocolo...
      </div>
    );
  }

  if (!processo) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground mb-4">
          Protocolo não encontrado ou sem permissão de acesso.
        </p>
        <Button variant="outline" asChild>
          <Link to="/app/processos">Voltar para protocolos</Link>
        </Button>
      </div>
    );
  }

  const author = formatAuthorDisplay(processo.author);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" className="w-fit px-0" asChild>
          <Link to="/app/processos">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para protocolos
          </Link>
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">
              Protocolo #{processo.id_proc}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastrado por {author.primary}
              {author.secondary ? ` (${author.secondary})` : ""}
            </p>
          </div>
          <Badge variant="secondary" className="w-fit">
            {processoStatusLabel(processo.status)}
          </Badge>
        </div>

        {canReopen ? (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Protocolo protocolado e aguardando importação. Para corrigir, reabra o rascunho.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                disabled={reabrindo || cancelando}
                onClick={() => setCancelDialogOpen(true)}
              >
                Cancelar protocolo
              </Button>
              <Button
                type="button"
                variant="legal"
                disabled={reabrindo || cancelando}
                onClick={() => void handleReabrir()}
              >
                {reabrindo ? "Reabrindo..." : "Editar"}
              </Button>
            </div>
          </div>
        ) : null}

        {canCancel && canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving || protocolando || cancelando}
              onClick={() => setCancelDialogOpen(true)}
            >
              Cancelar protocolo
            </Button>
          </div>
        ) : null}

        {!canEdit && !canReopen && isCreator && processo.status === "CANCELADO" ? (
          <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/40 px-4 py-3">
            Este protocolo foi cancelado. O cadastro permanece registrado para consulta.
          </p>
        ) : null}

        {!canEdit && !canReopen && isCreator && processo.status !== "CANCELADO" ? (
          <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/40 px-4 py-3">
            Este protocolo não pode mais ser editado neste fluxo.
          </p>
        ) : null}

        {!isCreator ? (
          <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/40 px-4 py-3">
            Somente o autor original pode editar este protocolo.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-card space-y-8">
        <ProcessoFormFields
          form={form}
          clienteNome={processo.cliente.nome}
          dtEntrada={processo.dt_entrada}
          disabled={!canEdit}
          dtFatalError={dtFatalError}
          processoOuExecucaoError={identificacaoError}
          layout="sectioned"
          onChange={updateField}
        />

        <ProcessoDocumentosSection
          documents={documents}
          canEdit={canEdit}
          linkNome={linkNome}
          linkUrl={linkUrl}
          linkUrlError={linkUrlError}
          linkSaving={linkSaving}
          pendingRemoveDocument={pendingRemoveDocument}
          onLinkNomeChange={setLinkNome}
          onLinkUrlChange={(value) => {
            setLinkUrl(value);
            if (linkUrlError) {
              setLinkUrlError(null);
            }
          }}
          onAddLink={() => void handleAddLink()}
          onRequestRemove={setPendingRemoveDocument}
          onCancelRemove={() => setPendingRemoveDocument(null)}
          onConfirmRemove={() => void handleConfirmRemoveDocument()}
        />

        {canEdit ? (
          <section
            className="space-y-4 border-t border-border pt-8"
            aria-labelledby="protocolizacao-heading"
          >
            <div>
              <h2
                id="protocolizacao-heading"
                className="font-serif text-lg font-semibold text-primary"
              >
                Protocolização
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Revise os requisitos antes de protocolar. O rascunho será salvo automaticamente e
                a validação final ocorre no servidor.
              </p>
            </div>

            <ul className="space-y-2">
              {protocolRequirements.map((requirement) => (
                <li key={requirement.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={requirement.met ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}
                    aria-hidden
                  >
                    {requirement.met ? "✓" : "○"}
                  </span>
                  <span className={requirement.met ? "" : "text-muted-foreground"}>
                    {requirement.label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={saving || protocolando}
                onClick={() => void handleSaveDraft()}
              >
                {saving ? "Salvando..." : "Salvar rascunho"}
              </Button>
              <Button
                type="button"
                variant="legal"
                disabled={saving || protocolando || linkSaving}
                onClick={() => void handleProtocolar()}
              >
                {protocolando ? "Protocolando..." : "Protocolar"}
              </Button>
            </div>
          </section>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end border-t border-border pt-8">
            {processo.pendente_at ? (
              <p className="text-sm text-muted-foreground sm:mr-auto">
                Protocolado em {format(new Date(processo.pendente_at), "dd/MM/yyyy HH:mm")}
              </p>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/app/processos">Voltar para protocolos</Link>
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar protocolo?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  O protocolo será marcado como cancelado. Nenhum cadastro será excluído — o
                  histórico permanece disponível.
                </p>
                <p>
                  Use esta opção quando o protocolo não deve mais seguir para importação ou
                  processamento.
                </p>
                <div className="space-y-2 pt-1">
                  <Label htmlFor="cancel_motivo">Motivo (opcional)</Label>
                  <Textarea
                    id="cancel_motivo"
                    value={cancelMotivo}
                    onChange={(e) => setCancelMotivo(e.target.value)}
                    rows={2}
                    placeholder="Ex.: protocolo aberto por engano"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmCancel();
              }}
            >
              {cancelando ? "Cancelando..." : "Confirmar cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
