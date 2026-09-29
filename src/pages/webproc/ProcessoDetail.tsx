import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import ProcessoFormFields, {
  emptyProcessoForm,
  formStateToDraftUpdate,
  processoToFormState,
  type ProcessoFormState,
} from "@/components/webproc/ProcessoFormFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWebProc } from "@/contexts/WebProcContext";
import {
  addProcessoLink,
  deleteProcessoLink,
  formatAuthorDisplay,
  getProcessoDetail,
  getProtocolRequirements,
  listProcessoLinks,
  protocolarProcesso,
  reabrirProcesso,
  saveProcessoDraft,
} from "@/integrations/supabase/webproc-api";
import {
  getFirstValidationMessage,
  validateLinkUrl,
  validateProtocolFields,
} from "@/integrations/supabase/webproc-validation";
import type {
  WebProcProcessoDetail,
  WebProcProcessoLink,
} from "@/integrations/supabase/webproc-types";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  EM_PREENCHIMENTO: "Em preenchimento",
  PENDENTE: "Pendente",
  IMPORTADO: "Importado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export default function ProcessoDetail() {
  const { idProc } = useParams();
  const { user, connectAccess } = useWebProc();
  const canMutateAsClient = connectAccess.kind === "CLIENT";
  const parsedId = Number(idProc);

  const [processo, setProcesso] = useState<WebProcProcessoDetail | null>(null);
  const [links, setLinks] = useState<WebProcProcessoLink[]>([]);
  const [form, setForm] = useState<ProcessoFormState>(emptyProcessoForm);
  const [linkNome, setLinkNome] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkUrlError, setLinkUrlError] = useState<string | null>(null);
  const [dtFatalError, setDtFatalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [protocolando, setProtocolando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);

  const isCreator = Boolean(processo && user && processo.created_by === user.id);
  const canEdit = Boolean(
    canMutateAsClient && isCreator && processo?.status === "EM_PREENCHIMENTO",
  );
  const canReopen = Boolean(canMutateAsClient && isCreator && processo?.status === "PENDENTE");

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(parsedId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ processo: loadedProcesso, error }, { data: loadedLinks, error: linksError }] =
      await Promise.all([
        getProcessoDetail(parsedId),
        listProcessoLinks(parsedId),
      ]);

    if (error) {
      toast.error("Erro ao carregar processo: " + error.message);
      setProcesso(null);
      setLinks([]);
    } else if (!loadedProcesso) {
      setProcesso(null);
      setLinks([]);
    } else {
      setProcesso(loadedProcesso);
      setForm(processoToFormState(loadedProcesso));
    }

    if (linksError) {
      toast.error("Erro ao carregar links: " + linksError.message);
      setLinks([]);
    } else {
      setLinks(loadedLinks);
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
  };

  const protocolRequirements = useMemo(
    () => getProtocolRequirements(form, links.length),
    [form, links.length]
  );

  const persistDraft = async () => {
    if (!processo) {
      throw new Error("Processo indisponível.");
    }

    setDtFatalError(null);

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
      processo.id_proc
    );

    if (refreshError || !refreshed) {
      throw refreshError ?? new Error("Erro ao recarregar processo.");
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
        throw error;
      }

      setLinkNome("");
      setLinkUrl("");
      setLinkUrlError(null);

      const { data: refreshedLinks, error: linksError } = await listProcessoLinks(
        processo.id_proc
      );

      if (linksError) {
        throw linksError;
      }

      setLinks(refreshedLinks);
      toast.success("Link adicionado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido ao adicionar link.";
      toast.error(message);
    } finally {
      setLinkSaving(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!canEdit || !processo) return;

    setLinkSaving(true);
    try {
      const { error } = await deleteProcessoLink(linkId);
      if (error) {
        throw error;
      }

      setLinks((current) => current.filter((link) => link.id !== linkId));
      toast.success("Link removido.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido ao remover link.";
      toast.error(message);
    } finally {
      setLinkSaving(false);
    }
  };

  const handleProtocolar = async () => {
    if (!canEdit || !processo) return;

    setProtocolando(true);
    try {
      await persistDraft();

      const protocolErrors = validateProtocolFields(form, links.length);
      const protocolMessage = getFirstValidationMessage(protocolErrors);
      if (protocolMessage) {
        setDtFatalError(protocolErrors.dt_fatal ?? null);
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
          ? "Processo já estava protocolado."
          : "Processo protocolado com sucesso."
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
        throw new Error(message ?? error?.message ?? "Erro ao reabrir processo.");
      }

      await loadDetail();
      toast.success(
        result.already_open
          ? "Processo já estava em preenchimento."
          : "Processo reaberto para correção."
      );
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro desconhecido ao reabrir.";
      toast.error(text);
    } finally {
      setReabrindo(false);
    }
  };

  if (!Number.isFinite(parsedId)) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground mb-4">Processo inválido.</p>
        <Button variant="outline" asChild>
          <Link to="/app/processos">Voltar para processos</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Carregando processo...
      </div>
    );
  }

  if (!processo) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground mb-4">
          Processo não encontrado ou sem permissão de acesso.
        </p>
        <Button variant="outline" asChild>
          <Link to="/app/processos">Voltar para processos</Link>
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
            Voltar para processos
          </Link>
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">
              Processo #{processo.id_proc}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastrado por {author.primary}
              {author.secondary ? ` (${author.secondary})` : ""}
            </p>
          </div>
          <Badge variant="secondary" className="w-fit">
            {statusLabels[processo.status] ?? processo.status}
          </Badge>
        </div>

        {canReopen ? (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Processo protocolado e aguardando importação. Para corrigir, reabra o
              rascunho.
            </p>
            <Button
              type="button"
              variant="legal"
              disabled={reabrindo}
              onClick={() => void handleReabrir()}
            >
              {reabrindo ? "Reabrindo..." : "Editar"}
            </Button>
          </div>
        ) : null}

        {!canEdit && !canReopen && isCreator ? (
          <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/40 px-4 py-3">
            Este processo não pode mais ser editado neste fluxo.
          </p>
        ) : null}

        {!isCreator ? (
          <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/40 px-4 py-3">
            Somente o autor original pode editar este processo.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-card space-y-6">
        <ProcessoFormFields
          form={form}
          clienteNome={processo.cliente.nome}
          dtEntrada={processo.dt_entrada}
          disabled={!canEdit}
          dtFatalError={dtFatalError}
          onChange={updateField}
        />

        <div className="space-y-4 border-t border-border pt-6">
          <div>
            <h2 className="font-serif text-lg font-semibold text-primary">Links</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione links externos necessários para protocolização.
            </p>
          </div>

          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum link cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {link.nome || "Link externo"}
                    </p>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-all"
                    >
                      {link.url}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={linkSaving}
                      onClick={() => void handleDeleteLink(link.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remover
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {canEdit ? (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="link_nome">Nome do link</Label>
                <Input
                  id="link_nome"
                  value={linkNome}
                  onChange={(e) => setLinkNome(e.target.value)}
                  placeholder="Ex.: Sentença"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="link_url">URL</Label>
                <Input
                  id="link_url"
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    if (linkUrlError) {
                      setLinkUrlError(null);
                    }
                  }}
                  placeholder="https://..."
                />
                {linkUrlError ? (
                  <p className="text-sm text-destructive">{linkUrlError}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={linkSaving}
                onClick={() => void handleAddLink()}
              >
                Adicionar link
              </Button>
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <div className="space-y-4 border-t border-border pt-6">
            <div>
              <h2 className="font-serif text-lg font-semibold text-primary">
                Protocolização
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Revise os requisitos antes de protocolar. O rascunho será salvo
                automaticamente e a validação final ocorre no servidor.
              </p>
            </div>

            <ul className="space-y-2">
              {protocolRequirements.map((requirement) => (
                <li
                  key={requirement.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={
                      requirement.met ? "text-green-600" : "text-muted-foreground"
                    }
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
          </div>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end border-t border-border pt-6">
            {processo.pendente_at ? (
              <p className="text-sm text-muted-foreground sm:mr-auto">
                Protocolado em {format(new Date(processo.pendente_at), "dd/MM/yyyy HH:mm")}
              </p>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/app/processos">Voltar para processos</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
