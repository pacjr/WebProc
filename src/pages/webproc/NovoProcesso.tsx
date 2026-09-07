import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebProc } from "@/contexts/WebProcContext";
import { insertProcesso } from "@/integrations/supabase/webproc-api";
import { validateDraftFields, getFirstValidationMessage } from "@/integrations/supabase/webproc-validation";
import ProcessoFormFields, {
  emptyProcessoForm,
  formStateToDraftUpdate,
  type ProcessoFormState,
} from "@/components/webproc/ProcessoFormFields";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function NovoProcesso() {
  const { user, membership } = useWebProc();
  const navigate = useNavigate();
  const [form, setForm] = useState<ProcessoFormState>(emptyProcessoForm);
  const [saving, setSaving] = useState(false);
  const [dtFatalError, setDtFatalError] = useState<string | null>(null);

  const updateField = (field: keyof ProcessoFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "dt_fatal" && dtFatalError) {
      setDtFatalError(null);
    }
  };

  const handleSave = async () => {
    if (!user || !membership) {
      toast.error("Sessão ou cliente WebProc indisponível.");
      return;
    }

    const draftErrors = validateDraftFields(form);
    const draftMessage = getFirstValidationMessage(draftErrors);
    if (draftMessage) {
      setDtFatalError(draftErrors.dt_fatal ?? null);
      toast.error(draftMessage);
      return;
    }

    setDtFatalError(null);
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
        throw error ?? new Error("Processo não retornado após criação.");
      }

      toast.success("Processo salvo como rascunho.");
      navigate(`/app/processos/${data.id_proc}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido ao salvar.";
      toast.error("Erro ao salvar processo: " + message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">
          Novo Processo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Salve um rascunho incompleto. O status inicial será{" "}
          <span className="font-medium">Em preenchimento</span>.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-card space-y-6">
        <ProcessoFormFields
          form={form}
          clienteNome={membership?.cliente.nome ?? "—"}
          dtEntrada={new Date().toISOString()}
          dtFatalError={dtFatalError}
          onChange={updateField}
        />

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
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
