import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProcessoDocumentosSection from "@/components/webproc/ProcessoDocumentosSection";
import ProtocoloContextHeader from "@/components/webproc/ProtocoloContextHeader";
import ProtocoloSectionCard from "@/components/webproc/ProtocoloSectionCard";
import { protocoloWorkspaceClassName } from "@/lib/operational-visual-language";
import ProcessoFormFields, {
  emptyProcessoForm,
  formStateToDraftUpdate,
  type ProcessoFormState,
} from "@/components/webproc/ProcessoFormFields";
import { Button } from "@/components/ui/button";
import { useWebProc } from "@/contexts/WebProcContext";
import {
  addProcessoLink,
  downloadProcessoDocumentFile,
  insertProcesso,
  listProcessoDocuments,
  mapWebprocDomainError,
  removerDocumento,
  saveProcessoDraft,
  uploadProcessoDocumentFile,
} from "@/integrations/supabase/webproc-api";
import { validateWebprocUploadFile } from "@/lib/webproc-file-policy";
import type { WebProcProcessoDocument } from "@/integrations/supabase/webproc-types";
import {
  getFirstValidationMessage,
  getLocalDateInputToday,
  localDateInputToReferenceIso,
  validateLinkUrl,
  validateProtocoloDraftFields,
} from "@/integrations/supabase/webproc-validation";
import { toast } from "sonner";

function createNovoProtocoloFormState(): ProcessoFormState {
  return {
    ...emptyProcessoForm,
    dt_fatal: getLocalDateInputToday(),
  };
}

export default function NovoProcesso() {
  const { user, membership, connectAccess, loading } = useWebProc();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && connectAccess.kind !== "CLIENT") {
      navigate("/app/processos", { replace: true });
    }
  }, [connectAccess.kind, loading, navigate]);

  const [form, setForm] = useState<ProcessoFormState>(createNovoProtocoloFormState);
  const dtEntradaPreview = localDateInputToReferenceIso(getLocalDateInputToday());
  const [draftIdProc, setDraftIdProc] = useState<number | null>(null);
  const [documents, setDocuments] = useState<WebProcProcessoDocument[]>([]);
  const [linkNome, setLinkNome] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkUrlError, setLinkUrlError] = useState<string | null>(null);
  const [pendingRemoveDocument, setPendingRemoveDocument] =
    useState<WebProcProcessoDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [dtFatalError, setDtFatalError] = useState<string | null>(null);
  const [processoOuExecucaoError, setProcessoOuExecucaoError] = useState<string | null>(
    null,
  );

  const updateField = (field: keyof ProcessoFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "dt_fatal" && dtFatalError) {
      setDtFatalError(null);
    }
    if ((field === "n_processo" || field === "exec_prov") && processoOuExecucaoError) {
      setProcessoOuExecucaoError(null);
    }
  };

  const validateDraftForm = useCallback(() => {
    const draftErrors = validateProtocoloDraftFields(form);
    const draftMessage = getFirstValidationMessage(draftErrors);
    if (draftMessage) {
      setDtFatalError(draftErrors.dt_fatal ?? null);
      setProcessoOuExecucaoError(draftErrors.processo_ou_execucao ?? null);
      return { ok: false as const, message: draftMessage };
    }
    setDtFatalError(null);
    setProcessoOuExecucaoError(null);
    return { ok: true as const };
  }, [form]);

  const ensureDraftPersisted = useCallback(async (): Promise<number> => {
    if (draftIdProc !== null) {
      return draftIdProc;
    }

    if (!user || !membership) {
      throw new Error("Sessão ou cliente WebProc indisponível.");
    }

    const validation = validateDraftForm();
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const draftFields = formStateToDraftUpdate(form);
    const { data, error } = await insertProcesso({
      cliente_id: membership.clienteId,
      created_by: user.id,
      nome_cli: membership.cliente.nome,
      ...draftFields,
      status: "EM_PREENCHIMENTO",
    });

    if (error || !data) {
      throw error ?? new Error("Protocolo não retornado após criação.");
    }

    setDraftIdProc(data.id_proc);
    return data.id_proc;
  }, [draftIdProc, form, membership, user, validateDraftForm]);

  const refreshDocuments = async (idProc: number) => {
    const { data, error } = await listProcessoDocuments(idProc);
    if (error) {
      throw error;
    }
    setDocuments(data);
  };

  const handleSave = async () => {
    if (!user || !membership) {
      toast.error("Sessão ou cliente WebProc indisponível.");
      return;
    }

    const validation = validateDraftForm();
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    setSaving(true);
    try {
      const draftFields = formStateToDraftUpdate(form);

      if (draftIdProc !== null) {
        const { result, error, message } = await saveProcessoDraft(draftIdProc, draftFields);

        if (error || !result?.success) {
          throw new Error(message ?? error?.message ?? "Erro ao salvar rascunho.");
        }

        toast.success("Protocolo salvo como rascunho.");
        navigate(`/app/processos/${draftIdProc}`);
        return;
      }

      const { data, error } = await insertProcesso({
        cliente_id: membership.clienteId,
        created_by: user.id,
        nome_cli: membership.cliente.nome,
        ...draftFields,
        status: "EM_PREENCHIMENTO",
      });

      if (error || !data) {
        throw error ?? new Error("Protocolo não retornado após criação.");
      }

      setDraftIdProc(data.id_proc);
      toast.success("Protocolo salvo como rascunho.");
      navigate(`/app/processos/${data.id_proc}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido ao salvar.";
      toast.error("Erro ao salvar protocolo: " + message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!user) return;

    const linkValidation = validateLinkUrl(linkUrl);
    if (!linkValidation.valid) {
      setLinkUrlError(linkValidation.message);
      toast.error(linkValidation.message);
      return;
    }

    setLinkUrlError(null);
    setLinkSaving(true);
    try {
      const idProc = await ensureDraftPersisted();

      const { error } = await addProcessoLink(idProc, user.id, {
        nome: linkNome.trim(),
        url: linkValidation.normalizedUrl,
      });

      if (error) {
        throw new Error(mapWebprocDomainError(error.message));
      }

      setLinkNome("");
      setLinkUrl("");
      await refreshDocuments(idProc);
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
    if (!pendingUploadFile || fileBusy) return;

    setFileError(null);
    setFileBusy(true);
    try {
      const idProc = await ensureDraftPersisted();
      await uploadProcessoDocumentFile(idProc, pendingUploadFile);
      setPendingUploadFile(null);
      await refreshDocuments(idProc);
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
    if (!pendingRemoveDocument || draftIdProc === null) return;

    setLinkSaving(true);
    try {
      const { error, message } = await removerDocumento(pendingRemoveDocument.id);

      if (error) {
        throw new Error(message ?? error.message);
      }

      if (message) {
        throw new Error(message);
      }

      await refreshDocuments(draftIdProc);
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

  return (
    <div className={protocoloWorkspaceClassName}>
      <ProtocoloContextHeader
        title="Novo protocolo"
        clienteNome={membership?.cliente.nome ?? "—"}
        statusLabel="Em preenchimento"
        modeHint={
          <p className="font-medium text-primary" role="status">
            Modo edição — criação de rascunho
          </p>
        }
        metaLine="Informe identificação, prazos e documentos; salve quando estiver pronto."
      />

      <ProcessoFormFields
        form={form}
        clienteNome={membership?.cliente.nome ?? "—"}
        dtEntrada={dtEntradaPreview}
        dtFatalError={dtFatalError}
        processoOuExecucaoError={processoOuExecucaoError}
        layout="cards"
        clientePresentation="context"
        onChange={updateField}
      />

      <ProtocoloSectionCard
        headingId="documentos-heading"
        title="Documentos"
        accentRole="documentos"
        description="Links ou arquivos necessários para protocolização."
      >
        <ProcessoDocumentosSection
          embedded
          documents={documents}
          canEdit
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

      <div
        className="flex flex-col-reverse gap-3 rounded-lg border border-border bg-card/80 px-4 py-4 sm:flex-row sm:justify-end sm:px-5"
        role="group"
        aria-label="Ações do rascunho"
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/app/processos")}
          disabled={saving || linkSaving || fileBusy}
        >
          Voltar
        </Button>
        <Button
          type="button"
          variant="legal"
          onClick={() => void handleSave()}
          disabled={saving || linkSaving || fileBusy}
        >
          {saving ? "Salvando..." : "Salvar rascunho"}
        </Button>
      </div>
    </div>
  );
}
