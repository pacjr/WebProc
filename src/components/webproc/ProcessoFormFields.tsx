import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  dtFatalStorageToInputValue,
  getBusinessDateToday,
  type IdentificacaoModo,
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

export type ProcessoFormLayout = "flat" | "sectioned";

interface ProcessoFormFieldsProps {
  form: ProcessoFormState;
  clienteNome: string;
  dtEntrada: string;
  disabled?: boolean;
  dtFatalError?: string | null;
  processoOuExecucaoError?: string | null;
  layout?: ProcessoFormLayout;
  onChange: (field: keyof ProcessoFormState, value: string) => void;
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="md:col-span-2 space-y-1 pb-1">
      <h2 className="font-serif text-lg font-semibold text-primary">{title}</h2>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function deriveIdentificacaoModo(form: ProcessoFormState): IdentificacaoModo | "" {
  const hasN = Boolean(form.n_processo.trim());
  const hasE = Boolean(form.exec_prov.trim());
  if (hasN && !hasE) return "n_processo";
  if (hasE && !hasN) return "exec_prov";
  return "";
}

export default function ProcessoFormFields({
  form,
  clienteNome,
  dtEntrada,
  disabled = false,
  dtFatalError = null,
  processoOuExecucaoError = null,
  layout = "flat",
  onChange,
}: ProcessoFormFieldsProps) {
  const minDtFatal = getBusinessDateToday();
  const sectioned = layout === "sectioned";
  const [identificacaoModo, setIdentificacaoModo] = useState<IdentificacaoModo | "">(() =>
    deriveIdentificacaoModo(form),
  );

  const hasBothIdentificadores =
    Boolean(form.n_processo.trim()) && Boolean(form.exec_prov.trim());

  useEffect(() => {
    if (disabled) return;
    const derived = deriveIdentificacaoModo(form);
    if (hasBothIdentificadores) {
      setIdentificacaoModo("");
      return;
    }
    if (derived) {
      setIdentificacaoModo(derived);
    }
  }, [disabled, form.n_processo, form.exec_prov, hasBothIdentificadores]);

  const handleIdentificacaoModoChange = (value: string) => {
    if (value !== "n_processo" && value !== "exec_prov") return;
    setIdentificacaoModo(value);
    if (value === "n_processo") {
      onChange("exec_prov", "");
    } else {
      onChange("n_processo", "");
    }
  };

  const identificacaoFields = (
    <>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="cliente">Cliente</Label>
        <Input id="cliente" value={clienteNome} readOnly className="bg-muted" />
      </div>

      {disabled ? (
        <div className="md:col-span-2 space-y-3">
          {hasBothIdentificadores ? (
            <p className="text-sm text-amber-700 dark:text-amber-500" role="status">
              Este protocolo possui as duas identificações preenchidas. Corrija ao editar para
              manter apenas uma.
            </p>
          ) : null}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Nº do Processo</dt>
              <dd className="font-medium">{form.n_processo.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Execução Provisória</dt>
              <dd className="font-medium">{form.exec_prov.trim() || "—"}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <>
          <fieldset className="md:col-span-2 space-y-3 border-0 p-0 m-0">
            <legend className="text-sm font-medium">Forma de identificação</legend>
            <RadioGroup
              value={identificacaoModo || undefined}
              onValueChange={handleIdentificacaoModoChange}
              className="flex flex-col gap-2 sm:flex-row sm:gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="n_processo" id="id_modo_n_processo" />
                <Label htmlFor="id_modo_n_processo" className="font-normal cursor-pointer">
                  Nº do Processo
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="exec_prov" id="id_modo_exec_prov" />
                <Label htmlFor="id_modo_exec_prov" className="font-normal cursor-pointer">
                  Execução Provisória
                </Label>
              </div>
            </RadioGroup>
          </fieldset>

          {identificacaoModo === "n_processo" ? (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="n_processo">Nº do Processo</Label>
              <Input
                id="n_processo"
                value={form.n_processo}
                aria-invalid={Boolean(processoOuExecucaoError)}
                aria-describedby={
                  processoOuExecucaoError ? "processo_ou_execucao_error" : undefined
                }
                onChange={(e) => onChange("n_processo", e.target.value)}
              />
            </div>
          ) : null}

          {identificacaoModo === "exec_prov" ? (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="exec_prov">Execução Provisória</Label>
              <Input
                id="exec_prov"
                value={form.exec_prov}
                aria-invalid={Boolean(processoOuExecucaoError)}
                aria-describedby={
                  processoOuExecucaoError ? "processo_ou_execucao_error" : undefined
                }
                onChange={(e) => onChange("exec_prov", e.target.value)}
              />
            </div>
          ) : null}

          {!identificacaoModo ? (
            <p className="text-sm text-muted-foreground md:col-span-2">
              Selecione uma forma de identificação acima para informar o valor.
            </p>
          ) : null}
        </>
      )}

      {processoOuExecucaoError ? (
        <p
          id="processo_ou_execucao_error"
          className="text-sm text-destructive md:col-span-2"
          role="alert"
        >
          {processoOuExecucaoError}
        </p>
      ) : null}
    </>
  );

  const dadosPrincipaisFields = (
    <>
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
          <p className="text-sm text-destructive" role="alert">
            {dtFatalError}
          </p>
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
    </>
  );

  const identificacaoDescription =
    "Escolha uma forma de identificação — Nº do Processo ou Execução Provisória — e preencha apenas o campo correspondente.";

  if (!sectioned) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {identificacaoFields}
        {dadosPrincipaisFields}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <SectionHeading title="Identificação" description={identificacaoDescription} />
        {identificacaoFields}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 border-t border-border pt-8">
        <SectionHeading title="Dados principais" />
        {dadosPrincipaisFields}
      </div>
    </div>
  );
}
