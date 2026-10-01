import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProcessoDocumentosSection from "@/components/webproc/ProcessoDocumentosSection";
import ProcessoFormFields, {
  emptyProcessoForm,
  formStateToDraftUpdate,
  type ProcessoFormState,
} from "@/components/webproc/ProcessoFormFields";
import { Button } from "@/components/ui/button";
import { useWebProc } from "@/contexts/WebProcContext";
import {
  addProcessoLink,
  insertProcesso,
  listProcessoDocuments,
  mapWebprocDomainError,
  removerDocumento,
  saveProcessoDraft,
} from "@/integrations/supabase/webproc-api";
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
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">
          Novo protocolo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Informe a identificação inicial e salve um rascunho. O status inicial será{" "}
          <span className="font-medium">Em preenchimento</span>.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-card space-y-8">
        <ProcessoFormFields
          form={form}
          clienteNome={membership?.cliente.nome ?? "—"}
          dtEntrada={dtEntradaPreview}
          dtFatalError={dtFatalError}
          processoOuExecucaoError={processoOuExecucaoError}
          layout="sectioned"
          clientePresentation="context"
          onChange={updateField}
        />

        <ProcessoDocumentosSection
          documents={documents}
          canEdit
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

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end border-t border-border pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/app/processos")}
            disabled={saving || linkSaving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="legal"
            onClick={() => void handleSave()}
            disabled={saving || linkSaving}
          >
            {saving ? "Salvando..." : "Salvar rascunho"}
          </Button>
        </div>
      </div>
    </div>
  );
}
