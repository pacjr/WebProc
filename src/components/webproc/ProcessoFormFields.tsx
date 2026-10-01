import { format } from "date-fns";
import ProtocoloSectionCard from "@/components/webproc/ProtocoloSectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  dtFatalStorageToInputValue,
  getBusinessDateToday,
} from "@/integrations/supabase/webproc-validation";
import type { WebProcProcesso } from "@/integrations/supabase/webproc-types";
import { webprocEditableFieldClassName } from "@/lib/webproc-field-styles";
import { cn } from "@/lib/utils";

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

export type ProcessoFormLayout = "flat" | "sectioned" | "cards";

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
  /** When set (detail), shown in Prazos card as read-only status. */
  statusLabel?: string | null;
  onChange: (field: keyof ProcessoFormState, value: string) => void;
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  const display = value.trim() ? value : "—";
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground whitespace-pre-wrap break-words">
        {display}
      </p>
    </div>
  );
}

function formatDtFatalDisplay(dtFatalInput: string) {
  if (!dtFatalInput.trim()) {
    return "—";
  }
  try {
    return format(new Date(`${dtFatalInput}T12:00:00`), "dd/MM/yyyy");
  } catch {
    return dtFatalInput;
  }
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
  statusLabel = null,
  onChange,
}: ProcessoFormFieldsProps) {
  const minDtFatal = getBusinessDateToday();
  const readMode = disabled;
  const nFilled = Boolean(form.n_processo.trim());
  const eFilled = Boolean(form.exec_prov.trim());
  const hasBothIdentificadores = nFilled && eFilled;
  const nProcessoInputDisabled = disabled || (eFilled && !nFilled);
  const execProvInputDisabled = disabled || (nFilled && !eFilled);
  const fieldClass = webprocEditableFieldClassName;
  const dtEntradaFormatted = format(new Date(dtEntrada), "dd/MM/yyyy");

  const identificacaoDescription =
    "Informe o Nº do Processo ou a Execução Provisória — apenas um dos campos.";

  const clienteInCard =
    clientePresentation === "field" ? (
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="cliente">Cliente</Label>
        <Input id="cliente" value={clienteNome} readOnly tabIndex={-1} className="bg-muted" />
      </div>
    ) : null;

  const identificacaoBody = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {clienteInCard}

      {readMode ? (
        <div className="md:col-span-2 space-y-3">
          {hasBothIdentificadores ? (
            <p className="text-sm text-amber-700 dark:text-amber-500" role="status">
              Este protocolo possui as duas identificações preenchidas. Corrija ao editar para
              manter apenas uma.
            </p>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadonlyField label="Nº do Processo" value={form.n_processo} />
            <ReadonlyField label="Execução Provisória" value={form.exec_prov} />
            <ReadonlyField label="Reclamante" value={form.reclamante} />
            <ReadonlyField label="Reclamado" value={form.reclamado} />
          </div>
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
              className={cn(!nProcessoInputDisabled && fieldClass)}
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
              className={cn(!execProvInputDisabled && fieldClass)}
              aria-invalid={Boolean(processoOuExecucaoError)}
              aria-describedby={
                processoOuExecucaoError ? "processo_ou_execucao_error" : undefined
              }
              onChange={(e) => onChange("exec_prov", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reclamante">Reclamante</Label>
            <Input
              id="reclamante"
              value={form.reclamante}
              className={fieldClass}
              onChange={(e) => onChange("reclamante", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reclamado">Reclamado</Label>
            <Input
              id="reclamado"
              value={form.reclamado}
              className={fieldClass}
              onChange={(e) => onChange("reclamado", e.target.value)}
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
    </div>
  );

  const prazosBody = readMode ? (
    <div className="space-y-4">
      <div>
        <ReadonlyField label="Data de Entrada" value={dtEntradaFormatted} />
        <p className="mt-1 text-xs text-muted-foreground">Registrada na criação do protocolo.</p>
      </div>
      <ReadonlyField label="Data Fatal" value={formatDtFatalDisplay(form.dt_fatal)} />
      {statusLabel ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <p className="mt-1">
            <span className="inline-flex rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium">
              {statusLabel}
            </span>
          </p>
        </div>
      ) : null}
      <ReadonlyField label="Instrução" value={form.instrucao} />
    </div>
  ) : (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="dt_entrada">Data de Entrada</Label>
        <Input
          id="dt_entrada"
          value={dtEntradaFormatted}
          readOnly
          tabIndex={-1}
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
          className={fieldClass}
          onChange={(e) => onChange("dt_fatal", e.target.value)}
        />
        {dtFatalError ? (
          <p className="text-sm text-destructive" role="alert">
            {dtFatalError}
          </p>
        ) : null}
      </div>

      {statusLabel ? (
        <div className="space-y-2">
          <Label>Status</Label>
          <Input value={statusLabel} readOnly tabIndex={-1} className="bg-muted" />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="instrucao">Instrução</Label>
        <Textarea
          id="instrucao"
          value={form.instrucao}
          className={fieldClass}
          onChange={(e) => onChange("instrucao", e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );

  const informacoesBody = readMode ? (
    <ReadonlyField label="Observações" value={form.obs} />
  ) : (
    <div className="space-y-2">
      <Label htmlFor="obs">Observações</Label>
      <Textarea
        id="obs"
        value={form.obs}
        className={fieldClass}
        onChange={(e) => onChange("obs", e.target.value)}
        rows={4}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)] lg:items-start">
      <ProtocoloSectionCard
        headingId="identificacao-heading"
        title="Identificação"
        accentRole="identificacao"
        description={readMode ? undefined : identificacaoDescription}
        className="order-1 lg:col-start-1 lg:row-start-1"
      >
        {identificacaoBody}
      </ProtocoloSectionCard>

      <ProtocoloSectionCard
        headingId="prazos-heading"
        title="Prazos e andamento"
        accentRole="prazos"
        description="Datas, status e instruções operacionais."
        panelStretch
        className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[5.5rem]"
      >
        {prazosBody}
      </ProtocoloSectionCard>

      <ProtocoloSectionCard
        headingId="informacoes-heading"
        title="Informações"
        accentRole="informacoes"
        description="Observações complementares ao protocolo."
        className="order-3 lg:col-start-1 lg:row-start-2"
      >
        {informacoesBody}
      </ProtocoloSectionCard>
    </div>
  );
}
