export const WEBPROC_BUSINESS_TIMEZONE = "America/Sao_Paulo";

export function getBusinessDateToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEBPROC_BUSINESS_TIMEZONE,
  }).format(new Date());
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

export interface DraftFieldErrors {
  dt_fatal?: string;
}

export function validateDraftFields(form: { dt_fatal: string }): DraftFieldErrors {
  const errors: DraftFieldErrors = {};

  if (form.dt_fatal && !isDtFatalBusinessDateValid(form.dt_fatal)) {
    errors.dt_fatal =
      "A data fatal informada é anterior à data de hoje. Datas passadas não são aceitas.";
  }

  return errors;
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
  const hasProcessoOuExecucao = Boolean(
    form.n_processo.trim() || form.exec_prov.trim()
  );

  if (!hasProcessoOuExecucao) {
    errors.processo_ou_execucao =
      "Informe o número do processo ou a execução provisória.";
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
