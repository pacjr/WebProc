import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  dtFatalStorageToInputValue,
  getBusinessDateToday,
} from "@/integrations/supabase/webproc-validation";
import type { WebProcProcesso } from "@/integrations/supabase/webproc-types";

export interface ProcessoFormState {
  n_processo: string;
  exec_prov: string;
  reclamante: string;
  reclamado: string;
  dt_fatal: string;
  instrucao: string;
  obs: string;
}

export const emptyProcessoForm: ProcessoFormState = {
  n_processo: "",
  exec_prov: "",
  reclamante: "",
  reclamado: "",
  dt_fatal: "",
  instrucao: "",
  obs: "",
};

export function processoToFormState(processo: WebProcProcesso): ProcessoFormState {
  return {
    n_processo: processo.n_processo ?? "",
    exec_prov: processo.exec_prov ?? "",
    reclamante: processo.reclamante ?? "",
    reclamado: processo.reclamado ?? "",
    dt_fatal: dtFatalStorageToInputValue(processo.dt_fatal),
    instrucao: processo.instrucao ?? "",
    obs: processo.obs ?? "",
  };
}

export function formStateToDraftUpdate(form: ProcessoFormState) {
  return {
    n_processo: form.n_processo.trim() || null,
    exec_prov: form.exec_prov.trim() || null,
    reclamante: form.reclamante.trim() || null,
    reclamado: form.reclamado.trim() || null,
    instrucao: form.instrucao.trim() || null,
    obs: form.obs.trim() || null,
    dt_fatal: form.dt_fatal
      ? new Date(`${form.dt_fatal}T00:00:00-03:00`).toISOString()
      : null,
  };
}

interface ProcessoFormFieldsProps {
  form: ProcessoFormState;
  clienteNome: string;
  dtEntrada: string;
  disabled?: boolean;
  dtFatalError?: string | null;
  onChange: (field: keyof ProcessoFormState, value: string) => void;
}

export default function ProcessoFormFields({
  form,
  clienteNome,
  dtEntrada,
  disabled = false,
  dtFatalError = null,
  onChange,
}: ProcessoFormFieldsProps) {
  const minDtFatal = getBusinessDateToday();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="cliente">Cliente</Label>
        <Input id="cliente" value={clienteNome} readOnly className="bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="n_processo">Número do Processo</Label>
        <Input
          id="n_processo"
          value={form.n_processo}
          disabled={disabled}
          onChange={(e) => onChange("n_processo", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="exec_prov">Execução Provisória</Label>
        <Input
          id="exec_prov"
          value={form.exec_prov}
          disabled={disabled}
          onChange={(e) => onChange("exec_prov", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reclamante">Reclamante</Label>
        <Input
          id="reclamante"
          value={form.reclamante}
          disabled={disabled}
          onChange={(e) => onChange("reclamante", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reclamado">Reclamado</Label>
        <Input
          id="reclamado"
          value={form.reclamado}
          disabled={disabled}
          onChange={(e) => onChange("reclamado", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dt_entrada">Data de Entrada</Label>
        <Input
          id="dt_entrada"
          value={format(new Date(dtEntrada), "dd/MM/yyyy")}
          readOnly
          className="bg-muted"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dt_fatal">Data Fatal</Label>
        <Input
          id="dt_fatal"
          type="date"
          min={minDtFatal}
          value={form.dt_fatal}
          disabled={disabled}
          onChange={(e) => onChange("dt_fatal", e.target.value)}
        />
        {dtFatalError ? (
          <p className="text-sm text-destructive">{dtFatalError}</p>
        ) : null}
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="instrucao">Instrução</Label>
        <Textarea
          id="instrucao"
          value={form.instrucao}
          disabled={disabled}
          onChange={(e) => onChange("instrucao", e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="obs">Observações</Label>
        <Textarea
          id="obs"
          value={form.obs}
          disabled={disabled}
          onChange={(e) => onChange("obs", e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );
}
