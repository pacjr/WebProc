export const WEBPROC_BUSINESS_TIMEZONE = "America/Sao_Paulo";

export function getBusinessDateToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEBPROC_BUSINESS_TIMEZONE,
  }).format(new Date());
}

/** YYYY-MM-DD in the browser's local calendar (for `<input type="date">` defaults). */
export function getLocalDateInputToday(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

/** Stable local reference for displaying a calendar date before the row exists. */
export function localDateInputToReferenceIso(dateStr: string): string {
  return `${dateStr}T12:00:00`;
}

export function dtFatalInputToStorageIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00-03:00`).toISOString();
}

export function dtFatalStorageToInputValue(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEBPROC_BUSINESS_TIMEZONE,
  }).format(new Date(value));
}

export function isDtFatalBusinessDateValid(dateStr: string): boolean {
  if (!dateStr) return true;
  return dateStr >= getBusinessDateToday();
}

export function validateLinkUrl(url: string) {
  const trimmed = url.trim();

  if (!trimmed) {
    return {
      valid: false as const,
      message: "Informe a URL do link.",
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        valid: false as const,
        message: "Informe uma URL válida (http:// ou https://).",
      };
    }
  } catch {
    return {
      valid: false as const,
      message: "Informe uma URL válida (http:// ou https://).",
    };
  }

  return { valid: true as const, normalizedUrl: trimmed };
}

/** PO: exactly one of n_processo or exec_prov (XOR), including on initial save. */
export const IDENTIFICACAO_XOR_REQUIRED =
  "Informe o Nº do Processo ou a Execução Provisória.";

export const IDENTIFICACAO_XOR_EXCLUSIVE =
  "Informe somente o Nº do Processo ou a Execução Provisória, não os dois.";

export type IdentificacaoModo = "n_processo" | "exec_prov";

export interface DraftFieldErrors {
  dt_fatal?: string;
  processo_ou_execucao?: string;
}

export function validateIdentificacaoXor(form: {
  n_processo: string;
  exec_prov: string;
}): Pick<DraftFieldErrors, "processo_ou_execucao"> {
  const hasN = Boolean(form.n_processo.trim());
  const hasE = Boolean(form.exec_prov.trim());

  if (!hasN && !hasE) {
    return { processo_ou_execucao: IDENTIFICACAO_XOR_REQUIRED };
  }

  if (hasN && hasE) {
    return { processo_ou_execucao: IDENTIFICACAO_XOR_EXCLUSIVE };
  }

  return {};
}

/** @deprecated Use validateIdentificacaoXor */
export function validateProcessoOuExecucao(form: {
  n_processo: string;
  exec_prov: string;
}) {
  return validateIdentificacaoXor(form);
}

export function validateDraftFields(form: { dt_fatal: string }): DraftFieldErrors {
  const errors: DraftFieldErrors = {};

  if (form.dt_fatal && !isDtFatalBusinessDateValid(form.dt_fatal)) {
    errors.dt_fatal =
      "A data fatal informada é anterior à data de hoje. Datas passadas não são aceitas.";
  }

  return errors;
}

export function validateProtocoloDraftFields(form: {
  n_processo: string;
  exec_prov: string;
  dt_fatal: string;
}): DraftFieldErrors {
  return {
    ...validateDraftFields(form),
    ...validateIdentificacaoXor(form),
  };
}

/** @deprecated Use validateProtocoloDraftFields */
export function validateNovoProtocoloDraftFields(form: {
  n_processo: string;
  exec_prov: string;
  dt_fatal: string;
}): DraftFieldErrors {
  return validateProtocoloDraftFields(form);
}

export interface ProtocolFieldErrors {
  processo_ou_execucao?: string;
  dt_fatal?: string;
  instrucao?: string;
  documento?: string;
}

export function validateProtocolFields(
  form: {
    n_processo: string;
    exec_prov: string;
    dt_fatal: string;
    instrucao: string;
  },
  savedDocumentCount: number
): ProtocolFieldErrors {
  const errors: ProtocolFieldErrors = {};
  const identificacao = validateIdentificacaoXor(form);
  if (identificacao.processo_ou_execucao) {
    errors.processo_ou_execucao = identificacao.processo_ou_execucao;
  }

  if (!form.dt_fatal) {
    errors.dt_fatal = "Informe a data fatal.";
  } else if (!isDtFatalBusinessDateValid(form.dt_fatal)) {
    errors.dt_fatal =
      "A data fatal informada é anterior à data de hoje. Datas passadas não são aceitas na protocolização.";
  }

  if (!form.instrucao.trim()) {
    errors.instrucao = "Informe a instrução.";
  }

  if (savedDocumentCount === 0) {
    errors.documento = "Adicione ao menos um link ou arquivo ao processo.";
  }

  return errors;
}

export function getFirstValidationMessage(
  errors: DraftFieldErrors | ProtocolFieldErrors
) {
  const values = Object.values(errors as Record<string, string | undefined>);
  return values.find(Boolean) ?? null;
}
