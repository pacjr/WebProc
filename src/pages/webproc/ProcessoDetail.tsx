import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { format } from "date-fns";
import ProcessoDocumentosSection from "@/components/webproc/ProcessoDocumentosSection";
import ProtocoloContextHeader from "@/components/webproc/ProtocoloContextHeader";
import ProtocoloSectionCard from "@/components/webproc/ProtocoloSectionCard";
import { protocoloWorkspaceClassName } from "@/lib/operational-visual-language";
import ProtocolizationBlockerDialog from "@/components/webproc/ProtocolizationBlockerDialog";
import ProcessoCancelamentoSection from "@/components/webproc/ProcessoCancelamentoSection";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWebProc } from "@/contexts/WebProcContext";
import {
  addProcessoLink,
  cancelarProcesso,
  cleanupProcessoDocumentR2AfterCancel,
  countActiveProcessoDocumentsForProtocol,
  downloadProcessoDocumentFile,
  formatAuthorDisplay,
  getProcessoDetail,
  getProtocolRequirements,
  listProcessoDocuments,
  mapWebprocDomainError,
  protocolarProcesso,
  reabrirProcesso,
  removeProcessoDocumentFile,
  removerDocumento,
  saveProcessoDraft,
  uploadProcessoDocumentFile,
} from "@/integrations/supabase/webproc-api";
import { validateWebprocUploadFile } from "@/lib/webproc-file-policy";
import {
  collectProtocolizationBlockers,
  getFirstValidationMessage,
  isProtocolizationReadinessFailure,
  validateLinkUrl,
  validateProtocolFields,
  validateProtocoloDraftFields,
} from "@/integrations/supabase/webproc-validation";
import { cn } from "@/lib/utils";
import type { WebProcProcessoDetail, WebProcProcessoDocument } from "@/integrations/supabase/webproc-types";
import { toast } from "sonner";
import { processoStatusLabel } from "@/lib/webproc-status-labels";

type ProcessoDetailLocationState = {
  listSearch?: string;
};

export default function ProcessoDetail() {
  const { idProc } = useParams();
  const location = useLocation();
  const { user, connectAccess } = useWebProc();
  const listBackTo = `/app/processos${(location.state as ProcessoDetailLocationState | null)?.listSearch ?? ""}`;
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
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [protocolando, setProtocolando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [protocolBlockerOpen, setProtocolBlockerOpen] = useState(false);
  const [protocolBlockerItems, setProtocolBlockerItems] = useState<string[]>([]);
  const [requirementsHighlighted, setRequirementsHighlighted] = useState(false);
  const protocolSectionRef = useRef<HTMLElement>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelMotivoError, setCancelMotivoError] = useState<string | null>(null);
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

  const focusProtocolRequirements = useCallback(() => {
    setRequirementsHighlighted(true);
    requestAnimationFrame(() => {
      protocolSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      protocolSectionRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const openProtocolBlocker = useCallback(
    (items: string[]) => {
      setProtocolBlockerItems(items);
      setProtocolBlockerOpen(true);
    },
    [],
  );

  const closeProtocolBlocker = useCallback(() => {
    setProtocolBlockerOpen(false);
    focusProtocolRequirements();
  }, [focusProtocolRequirements]);

  useEffect(() => {
    if (protocolRequirements.every((requirement) => requirement.met)) {
      setRequirementsHighlighted(false);
    }
  }, [protocolRequirements]);

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

  const handlePickUploadFile = (file: File | null) => {
    setPendingUploadFile(file);
    setFileError(null);
    if (!file) {
      return;
    }
    const validation = validateWebprocUploadFile(file);
    if (validation.ok === false) {
      setFileError(validation.message);
      setPendingUploadFile(null);
    }
  };

  const handleAttachFile = async () => {
    if (!canEdit || !processo || !pendingUploadFile || fileBusy) return;

    setFileError(null);
    setFileBusy(true);
    try {
      await uploadProcessoDocumentFile(processo.id_proc, pendingUploadFile);
      setPendingUploadFile(null);

      const { data: refreshedDocuments, error: documentsError } = await listProcessoDocuments(
        processo.id_proc,
      );

      if (documentsError) {
        throw documentsError;
      }

      setDocuments(refreshedDocuments);
      toast.success("Arquivo anexado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível anexar o arquivo.";
      setFileError(message);
      toast.error(message);
    } finally {
      setFileBusy(false);
    }
  };

  const handleDownloadFile = async (document: WebProcProcessoDocument) => {
    if (downloadBusyId) return;

    setDownloadBusyId(document.id);
    try {
      await downloadProcessoDocumentFile(document.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível baixar o arquivo.";
      toast.error(message);
    } finally {
      setDownloadBusyId(null);
    }
  };

  const handleConfirmRemoveDocument = async () => {
    if (!canEdit || !processo || !pendingRemoveDocument) return;

    setLinkSaving(true);
    try {
      if (pendingRemoveDocument.tipo === "ARQUIVO") {
        await removeProcessoDocumentFile(pendingRemoveDocument.id);
      } else {
        const { error, message } = await removerDocumento(pendingRemoveDocument.id);

        if (error) {
          throw new Error(message ?? error.message);
        }

        if (message) {
          throw new Error(message);
        }
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
      const blockers = collectProtocolizationBlockers(form, activeDocumentCount);
      if (blockers.length > 0) {
        setDtFatalError(protocolErrors.dt_fatal ?? null);
        setIdentificacaoError(protocolErrors.processo_ou_execucao ?? null);
        openProtocolBlocker(blockers);
        return;
      }

      setDtFatalError(null);
      setIdentificacaoError(null);

      const { result, error, message } = await protocolarProcesso(processo.id_proc);

      if (error || !result?.success) {
        const domainSignal = [result?.error, error?.message, message]
          .filter(Boolean)
          .join(" ");
        if (isProtocolizationReadinessFailure(domainSignal)) {
          const mapped = mapWebprocDomainError(domainSignal);
          if (protocolErrors.dt_fatal || domainSignal.includes("invalid_dt_fatal")) {
            setDtFatalError(mapped);
          }
          if (protocolErrors.processo_ou_execucao || domainSignal.includes("identificacao")) {
            setIdentificacaoError(mapped);
          }
          openProtocolBlocker([mapped]);
          return;
        }

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

    const trimmedMotivo = cancelMotivo.trim();
    if (!trimmedMotivo) {
      setCancelMotivoError("Informe o motivo do cancelamento.");
      return;
    }

    setCancelMotivoError(null);
    setCancelando(true);
    try {
      const { result, error, message } = await cancelarProcesso(
        processo.id_proc,
        trimmedMotivo,
      );

      if (error || !result?.success) {
        throw new Error(message ?? error?.message ?? "Erro ao cancelar protocolo.");
      }

      setCancelDialogOpen(false);
      setCancelMotivo("");
      setCancelMotivoError(null);
      await loadDetail();
      void cleanupProcessoDocumentR2AfterCancel(processo.id_proc);
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
          <Link to={listBackTo}>Voltar para protocolos</Link>
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
          <Link to={listBackTo}>Voltar para protocolos</Link>
        </Button>
      </div>
    );
  }

  const author = formatAuthorDisplay(processo.author);

  const statusLabel = processoStatusLabel(processo.status);

  const headerActions = canReopen ? (
    <>
      <Button
        type="button"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
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
    </>
  ) : null;

  const headerBanners = (
    <>
      {canReopen ? (
        <p className="text-sm text-muted-foreground">
          Protocolo protocolado e aguardando importação. Use{" "}
          <span className="font-medium text-foreground">Editar</span> para reabrir o rascunho
          antes de alterar dados ou documentos.
        </p>
      ) : null}
      {!canEdit && !canReopen && isCreator && processo.status !== "CANCELADO" ? (
        <p className="text-sm text-muted-foreground">
          Este protocolo não pode mais ser editado neste fluxo.
        </p>
      ) : null}
      {!isCreator ? (
        <p className="text-sm text-muted-foreground">
          Somente o autor original pode editar este protocolo.
        </p>
      ) : null}
    </>
  );

  return (
    <div className={protocoloWorkspaceClassName}>
      <ProtocoloContextHeader
        title={`Protocolo #${processo.id_proc}`}
        clienteNome={processo.cliente.nome}
        backTo={listBackTo}
        statusLabel={statusLabel}
        metaLine={
          <>
            Cadastrado por {author.primary}
            {author.secondary ? ` (${author.secondary})` : ""}
          </>
        }
        modeHint={
          canEdit ? (
            <p className="font-medium text-primary" role="status">
              Modo edição — rascunho em preenchimento
            </p>
          ) : (
            <p className="text-muted-foreground" role="status">
              Visualização — alterações exigem reabrir o protocolo quando permitido
            </p>
          )
        }
        actions={headerActions}
        banners={
          canReopen ||
          (!canEdit && !canReopen && isCreator && processo.status !== "CANCELADO") ||
          !isCreator
            ? headerBanners
            : undefined
        }
      />

      <ProcessoFormFields
        form={form}
        clienteNome={processo.cliente.nome}
        dtEntrada={processo.dt_entrada}
        disabled={!canEdit}
        dtFatalError={dtFatalError}
        processoOuExecucaoError={identificacaoError}
        layout="cards"
        clientePresentation="context"
        statusLabel={statusLabel}
        onChange={updateField}
      />

      <ProtocoloSectionCard
        headingId="documentos-heading"
        title="Documentos"
        accentRole="documentos"
        description={
          canEdit
            ? "Links ou arquivos necessários para protocolização."
            : "Documentos vinculados a este protocolo."
        }
      >
        <ProcessoDocumentosSection
          embedded
          documents={documents}
          canEdit={canEdit}
          linkNome={linkNome}
          linkUrl={linkUrl}
          linkUrlError={linkUrlError}
          linkSaving={linkSaving}
          pendingUploadFile={pendingUploadFile}
          fileError={fileError}
          fileBusy={fileBusy}
          downloadBusyId={downloadBusyId}
          pendingRemoveDocument={pendingRemoveDocument}
          onLinkNomeChange={setLinkNome}
          onLinkUrlChange={(value) => {
            setLinkUrl(value);
            if (linkUrlError) {
              setLinkUrlError(null);
            }
          }}
          onAddLink={() => void handleAddLink()}
          onPickUploadFile={handlePickUploadFile}
          onAttachFile={() => void handleAttachFile()}
          onDownloadFile={(doc) => void handleDownloadFile(doc)}
          onRequestRemove={setPendingRemoveDocument}
          onCancelRemove={() => setPendingRemoveDocument(null)}
          onConfirmRemove={() => void handleConfirmRemoveDocument()}
        />
      </ProtocoloSectionCard>

      {processo.status === "CANCELADO" ? (
        <ProcessoCancelamentoSection processo={processo} />
      ) : null}

      {canEdit ? (
        <>
          {canCancel ? (
            <div className="flex justify-end border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={saving || protocolando || cancelando || fileBusy || linkSaving}
                onClick={() => setCancelDialogOpen(true)}
              >
                Cancelar protocolo
              </Button>
            </div>
          ) : null}

          <ProtocoloSectionCard
            headingId="protocolizacao-heading"
            title="Protocolização"
            accentRole="protocolizacao"
            description="Revise os requisitos antes de protocolar. O rascunho será salvo automaticamente; a validação final ocorre no servidor."
            className={cn(
              "outline-none transition-shadow",
              requirementsHighlighted && "ring-2 ring-primary/40",
            )}
          >
            <section ref={protocolSectionRef} tabIndex={-1} className="space-y-4 outline-none">
              <ul className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3">
                {protocolRequirements.map((requirement) => (
                  <li key={requirement.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={
                        requirement.met
                          ? "text-green-600 dark:text-green-500"
                          : "text-muted-foreground"
                      }
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

              <div
                className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
                role="group"
                aria-label="Ações de protocolização"
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || protocolando || fileBusy || linkSaving}
                  onClick={() => void handleSaveDraft()}
                >
                  {saving ? "Salvando..." : "Salvar rascunho"}
                </Button>
                <Button
                  type="button"
                  variant="legal"
                  disabled={saving || protocolando || linkSaving || fileBusy}
                  onClick={() => void handleProtocolar()}
                >
                  {protocolando ? "Protocolando..." : "Protocolar"}
                </Button>
              </div>
            </section>
          </ProtocoloSectionCard>
        </>
      ) : (
        <div
          className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end"
          role="group"
          aria-label="Navegação"
        >
          {processo.pendente_at ? (
            <p className="text-sm text-muted-foreground sm:mr-auto">
              Protocolado em {format(new Date(processo.pendente_at), "dd/MM/yyyy HH:mm")}
            </p>
          ) : null}
          <Button variant="outline" asChild>
            <Link to={listBackTo}>Voltar para protocolos</Link>
          </Button>
        </div>
      )}

      <ProtocolizationBlockerDialog
        open={protocolBlockerOpen}
        blockers={protocolBlockerItems}
        onClose={closeProtocolBlocker}
      />

      <AlertDialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) {
            setCancelMotivoError(null);
          }
        }}
      >
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
                  processamento. O motivo informado permanece registrado no histórico do protocolo.
                </p>
                <div className="space-y-2 pt-1">
                  <Label htmlFor="cancel_motivo">
                    Motivo do cancelamento <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="cancel_motivo"
                    value={cancelMotivo}
                    onChange={(e) => {
                      setCancelMotivo(e.target.value);
                      if (cancelMotivoError) {
                        setCancelMotivoError(null);
                      }
                    }}
                    rows={2}
                    placeholder="Ex.: protocolo aberto por engano"
                    aria-invalid={cancelMotivoError ? true : undefined}
                    aria-describedby={
                      cancelMotivoError ? "cancel_motivo_error" : "cancel_motivo_hint"
                    }
                    disabled={cancelando}
                  />
                  <p id="cancel_motivo_hint" className="text-xs text-muted-foreground">
                    Campo obrigatório.
                  </p>
                  {cancelMotivoError ? (
                    <p id="cancel_motivo_error" className="text-sm text-destructive" role="alert">
                      {cancelMotivoError}
                    </p>
                  ) : null}
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
