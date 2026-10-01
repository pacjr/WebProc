import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebProc } from "@/contexts/WebProcContext";
import { insertProcesso } from "@/integrations/supabase/webproc-api";
import {
  getFirstValidationMessage,
  getLocalDateInputToday,
  localDateInputToReferenceIso,
  validateProtocoloDraftFields,
} from "@/integrations/supabase/webproc-validation";
import ProcessoFormFields, {
  emptyProcessoForm,
  formStateToDraftUpdate,
  type ProcessoFormState,
} from "@/components/webproc/ProcessoFormFields";

function createNovoProtocoloFormState(): ProcessoFormState {
  return {
    ...emptyProcessoForm,
    dt_fatal: getLocalDateInputToday(),
  };
}
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  const [saving, setSaving] = useState(false);
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

  const handleSave = async () => {
    if (!user || !membership) {
      toast.error("Sessão ou cliente WebProc indisponível.");
      return;
    }

    const draftErrors = validateProtocoloDraftFields(form);
    const draftMessage = getFirstValidationMessage(draftErrors);
    if (draftMessage) {
      setDtFatalError(draftErrors.dt_fatal ?? null);
      setProcessoOuExecucaoError(draftErrors.processo_ou_execucao ?? null);
      toast.error(draftMessage);
      return;
    }

    setDtFatalError(null);
    setProcessoOuExecucaoError(null);
    setSaving(true);
    try {
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

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-card space-y-6">
        <ProcessoFormFields
          form={form}
          clienteNome={membership?.cliente.nome ?? "—"}
          dtEntrada={dtEntradaPreview}
          dtFatalError={dtFatalError}
          processoOuExecucaoError={processoOuExecucaoError}
          layout="sectioned"
          onChange={updateField}
        />

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end border-t border-border pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/app/processos")}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" variant="legal" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar rascunho"}
          </Button>
        </div>
      </div>
    </div>
  );
}
