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

export type ProcessoFormLayout = "flat" | "sectioned";

interface ProcessoFormFieldsProps {
  form: ProcessoFormState;
  clienteNome: string;
  dtEntrada: string;
  disabled?: boolean;
  dtFatalError?: string | null;
  processoOuExecucaoError?: string | null;
  layout?: ProcessoFormLayout;
  /** On Novo, cliente is contextual identity — lighter than a full read-only input. */
  clientePresentation?: "field" | "context";
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

export default function ProcessoFormFields({
  form,
  clienteNome,
  dtEntrada,
  disabled = false,
  dtFatalError = null,
  processoOuExecucaoError = null,
  layout = "flat",
  clientePresentation = "field",
  onChange,
}: ProcessoFormFieldsProps) {
  const minDtFatal = getBusinessDateToday();
  const sectioned = layout === "sectioned";
  const nFilled = Boolean(form.n_processo.trim());
  const eFilled = Boolean(form.exec_prov.trim());
  const hasBothIdentificadores = nFilled && eFilled;
  const nProcessoInputDisabled = disabled || (eFilled && !nFilled);
  const execProvInputDisabled = disabled || (nFilled && !eFilled);

  const identificacaoFields = (
    <>
      {clientePresentation === "context" ? (
        <p className="text-sm text-muted-foreground md:col-span-2">
          Cliente:{" "}
          <span className="font-medium text-foreground">{clienteNome}</span>
        </p>
      ) : (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="cliente">Cliente</Label>
          <Input id="cliente" value={clienteNome} readOnly className="bg-muted" />
        </div>
      )}

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
          {hasBothIdentificadores ? (
            <p className="text-sm text-amber-700 dark:text-amber-500 md:col-span-2" role="status">
              Informe apenas uma identificação — deixe um dos campos vazio.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">
              Informe o Nº do Processo ou a Execução Provisória (apenas um).
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="n_processo">Nº do Processo</Label>
            <Input
              id="n_processo"
              value={form.n_processo}
              disabled={nProcessoInputDisabled}
              aria-invalid={Boolean(processoOuExecucaoError)}
              aria-describedby={
                processoOuExecucaoError ? "processo_ou_execucao_error" : undefined
              }
              onChange={(e) => onChange("n_processo", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exec_prov">Execução Provisória</Label>
            <Input
              id="exec_prov"
              value={form.exec_prov}
              disabled={execProvInputDisabled}
              aria-invalid={Boolean(processoOuExecucaoError)}
              aria-describedby={
                processoOuExecucaoError ? "processo_ou_execucao_error" : undefined
              }
              onChange={(e) => onChange("exec_prov", e.target.value)}
            />
          </div>
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
          disabled
          className="bg-muted"
          aria-describedby="dt_entrada_hint"
        />
        <p id="dt_entrada_hint" className="text-xs text-muted-foreground">
          Definida automaticamente na criação e não pode ser alterada.
        </p>
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
    "Informe o Nº do Processo ou a Execução Provisória — apenas um dos campos.";

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
