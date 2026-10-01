import { webprocDb } from "@/integrations/supabase/webproc-client";
import {
  getBusinessDateToday,
  validateProtocolFields,
} from "@/integrations/supabase/webproc-validation";
import type {
  WebProcAuthorIdentity,
  WebProcMembership,
  WebProcProcesso,
  WebProcProcessoDetail,
  WebProcProcessoInsert,
  WebProcProcessoLink,
  WebProcProcessoListItem,
  WebProcProtocolRequirement,
  WebProcProtocolarResult,
  WebProcReabrirResult,
  WebProcCancelarResult,
  WebProcSalvarRascunhoResult,
} from "@/integrations/supabase/webproc-types";

interface MembershipRow {
  id: number;
  cliente_id: number;
  nome: string | null;
  email: string;
  clientes: {
    id: number;
    codigo_cliente: number;
    nome: string;
    ativo: boolean;
  };
}

interface MembershipIdentityRow {
  user_id: string | null;
  nome: string | null;
  email: string;
}

const LIFECYCLE_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Sessão expirada. Faça login novamente.",
  processo_not_found: "Processo não encontrado.",
  membership_required: "Vínculo ativo com o cliente é necessário.",
  not_process_creator: "Somente o autor original pode executar esta ação.",
  invalid_status_for_protocolar:
    "Este processo não está em preenchimento e não pode ser protocolado.",
  invalid_status_for_save:
    "Este processo não está em preenchimento e não pode ser salvo.",
  invalid_status_for_reabrir:
    "Este processo não está pendente e não pode ser reaberto.",
  invalid_status_for_cancelar:
    "Este protocolo não pode mais ser cancelado neste fluxo.",
  missing_processo_ou_execucao:
    "Informe o Nº do Processo ou a Execução Provisória.",
  identificacao_xor_violation:
    "Informe exatamente uma forma de identificação: Nº do Processo ou Execução Provisória, não ambos e não deixe os dois vazios.",
  missing_dt_fatal: "Informe a data fatal.",
  invalid_dt_fatal_past:
    "A data fatal informada é anterior à data de hoje. Datas passadas não são aceitas na protocolização.",
  missing_instrucao: "Informe a instrução.",
  missing_documento: "Adicione ao menos um link ou arquivo ao processo.",
  created_by_immutable: "A autoria do processo não pode ser alterada.",
  cliente_id_immutable: "O cliente do processo não pode ser alterado.",
  status_transition_not_allowed:
    "A transição de status deve ser feita pelas ações de protocolar ou reabrir.",
};

function mapMembershipRow(row: MembershipRow): WebProcMembership | null {
  const cliente = Array.isArray(row.clientes) ? row.clientes[0] : row.clientes;
  if (!cliente) {
    return null;
  }

  return {
    membershipId: row.id,
    clienteId: row.cliente_id,
    nome: row.nome,
    email: row.email,
    cliente: {
      id: cliente.id,
      codigo_cliente: cliente.codigo_cliente,
      nome: cliente.nome,
    },
  };
}

/** @deprecated Prefer fetchActiveClientMemberships + connect access resolution. */
export async function fetchActiveMembership(userId: string) {
  const { memberships, error } = await fetchActiveClientMemberships(userId);
  return {
    membership: memberships[0] ?? null,
    error,
  };
}

export async function fetchActiveClientMemberships(userId: string) {
  const { data, error } = await webprocDb()
    .from("usuarios_clientes")
    .select(
      "id, cliente_id, nome, email, clientes!inner(id, codigo_cliente, nome, ativo)"
    )
    .eq("user_id", userId)
    .eq("ativo", true)
    .eq("clientes.ativo", true)
    .order("cliente_id", { ascending: true });

  if (error) {
    return { memberships: [] as WebProcMembership[], error };
  }

  const memberships = (data as unknown as MembershipRow[])
    .map(mapMembershipRow)
    .filter((m): m is WebProcMembership => m !== null);

  return { memberships, error: null };
}

export async function fetchActusConnectAuthorization() {
  const { data, error } = await webprocDb().rpc("is_active_connect_actus_user");

  if (error) {
    return { isActus: false, error };
  }

  return { isActus: data === true, error: null };
}

async function fetchAuthorIdentities(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return {
      identities: new Map<string, WebProcAuthorIdentity>(),
      error: null,
    };
  }

  const { data, error } = await webprocDb()
    .from("usuarios_clientes")
    .select("user_id, nome, email")
    .in("user_id", uniqueUserIds)
    .eq("ativo", true);

  if (error) {
    return { identities: new Map<string, WebProcAuthorIdentity>(), error };
  }

  const identities = new Map<string, WebProcAuthorIdentity>();
  for (const row of (data ?? []) as MembershipIdentityRow[]) {
    if (row.user_id) {
      identities.set(row.user_id, {
        nome: row.nome,
        email: row.email,
      });
    }
  }

  return { identities, error: null };
}

export async function listProcessos() {
  const { data: processos, error } = await webprocDb()
    .from("processos")
    .select(
      "id_proc, n_processo, exec_prov, reclamante, dt_entrada, dt_fatal, status, created_by"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [] as WebProcProcessoListItem[], error };
  }

  const rows = processos ?? [];
  const { identities, error: identityError } = await fetchAuthorIdentities(
    rows.map((processo) => processo.created_by)
  );

  if (identityError) {
    return { data: [] as WebProcProcessoListItem[], error: identityError };
  }

  const data = rows.map((processo) => ({
    id_proc: processo.id_proc,
    n_processo: processo.n_processo,
    exec_prov: processo.exec_prov,
    reclamante: processo.reclamante,
    dt_entrada: processo.dt_entrada,
    dt_fatal: processo.dt_fatal,
    status: processo.status,
    author: identities.get(processo.created_by) ?? null,
  })) satisfies WebProcProcessoListItem[];

  return { data, error: null };
}

interface ProcessoDetailRow extends WebProcProcesso {
  clientes: {
    nome: string;
  } | {
    nome: string;
  }[];
}

export async function getProcessoDetail(idProc: number) {
  const { data, error } = await webprocDb()
    .from("processos")
    .select("*, clientes!inner(nome)")
    .eq("id_proc", idProc)
    .maybeSingle();

  if (error || !data) {
    return { processo: null as WebProcProcessoDetail | null, error };
  }

  const row = data as unknown as ProcessoDetailRow;
  const cliente = Array.isArray(row.clientes) ? row.clientes[0] : row.clientes;
  const { clientes: _clientes, ...processoBase } = row;
  const processo = processoBase as WebProcProcesso;

  const { identities, error: identityError } = await fetchAuthorIdentities([
    processo.created_by,
  ]);

  if (identityError || !cliente) {
    return { processo: null, error: identityError };
  }

  return {
    processo: {
      ...processo,
      author: identities.get(processo.created_by) ?? null,
      cliente: {
        nome: cliente.nome,
      },
    } satisfies WebProcProcessoDetail,
    error: null,
  };
}

export async function saveProcessoDraft(
  idProc: number,
  payload: {
    n_processo: string | null;
    exec_prov: string | null;
    reclamante: string | null;
    reclamado: string | null;
    instrucao: string | null;
    obs: string | null;
    dt_fatal: string | null;
  }
) {
  const { data, error } = await webprocDb().rpc("salvar_rascunho", {
    p_id_proc: idProc,
    p_n_processo: payload.n_processo,
    p_exec_prov: payload.exec_prov,
    p_reclamante: payload.reclamante,
    p_reclamado: payload.reclamado,
    p_instrucao: payload.instrucao,
    p_obs: payload.obs,
    p_dt_fatal: payload.dt_fatal,
  });

  if (error) {
    return {
      result: null as WebProcSalvarRascunhoResult | null,
      error,
      message: mapLifecycleError(error.message),
    };
  }

  const result = data as WebProcSalvarRascunhoResult;

  if (!result.success) {
    return {
      result,
      error: null,
      message: mapLifecycleError(result.error ?? "unknown_error"),
    };
  }

  return {
    result,
    error: null,
    message: null as string | null,
  };
}

export async function listProcessoLinks(idProc: number) {
  const { data, error } = await webprocDb()
    .from("processo_documentos")
    .select("id, id_proc, tipo, nome, url, created_at")
    .eq("id_proc", idProc)
    .eq("tipo", "LINK")
    .order("created_at", { ascending: true });

  return {
    data: (data ?? []) as WebProcProcessoLink[],
    error,
  };
}

export async function addProcessoLink(
  idProc: number,
  userId: string,
  payload: { nome: string; url: string }
) {
  return webprocDb()
    .from("processo_documentos")
    .insert({
      id_proc: idProc,
      tipo: "LINK",
      nome: payload.nome.trim() || null,
      url: payload.url.trim(),
      created_by: userId,
    })
    .select("id, id_proc, tipo, nome, url, created_at")
    .single();
}

export async function deleteProcessoLink(linkId: string) {
  return webprocDb().from("processo_documentos").delete().eq("id", linkId);
}

export async function protocolarProcesso(idProc: number) {
  const { data, error } = await webprocDb().rpc("protocolar_processo", {
    p_id_proc: idProc,
  });

  if (error) {
    return {
      result: null as WebProcProtocolarResult | null,
      error,
      message: mapLifecycleError(error.message),
    };
  }

  const result = data as WebProcProtocolarResult;

  if (!result.success) {
    return {
      result,
      error: null,
      message: mapLifecycleError(result.error ?? "unknown_error"),
    };
  }

  return {
    result,
    error: null,
    message: null as string | null,
  };
}

export async function reabrirProcesso(idProc: number) {
  const { data, error } = await webprocDb().rpc("reabrir_processo", {
    p_id_proc: idProc,
  });

  if (error) {
    return {
      result: null as WebProcReabrirResult | null,
      error,
      message: mapLifecycleError(error.message),
    };
  }

  return {
    result: data as WebProcReabrirResult,
    error: null,
    message: null as string | null,
  };
}

export async function cancelarProcesso(idProc: number, motivo?: string | null) {
  const { data, error } = await webprocDb().rpc("cancelar_processo", {
    p_id_proc: idProc,
    p_motivo: motivo?.trim() ? motivo.trim() : null,
  });

  if (error) {
    return {
      result: null as WebProcCancelarResult | null,
      error,
      message: mapLifecycleError(error.message),
    };
  }

  const result = data as WebProcCancelarResult;

  if (!result.success) {
    return {
      result,
      error: null,
      message: mapLifecycleError("unknown_error"),
    };
  }

  return {
    result,
    error: null,
    message: null as string | null,
  };
}

export async function insertProcesso(payload: WebProcProcessoInsert) {
  return webprocDb().from("processos").insert(payload).select("id_proc").single();
}

export function formatAuthorDisplay(author: WebProcAuthorIdentity | null) {
  if (!author) {
    return { primary: "—", secondary: null as string | null };
  }

  if (author.nome) {
    return { primary: author.nome, secondary: author.email };
  }

  return { primary: author.email, secondary: null };
}

export function getProtocolRequirements(
  form: {
    n_processo: string;
    exec_prov: string;
    dt_fatal: string;
    instrucao: string;
  },
  savedDocumentCount: number
): WebProcProtocolRequirement[] {
  const validation = validateProtocolFields(form, savedDocumentCount);

  return [
    {
      id: "processo_ou_execucao",
      label: "Exatamente um: Nº do Processo ou Execução Provisória",
      met: !validation.processo_ou_execucao,
    },
    {
      id: "dt_fatal",
      label: "Data fatal (hoje ou futura, sem datas passadas)",
      met: !validation.dt_fatal,
    },
    {
      id: "instrucao",
      label: "Instrução",
      met: !validation.instrucao,
    },
    {
      id: "documento",
      label: "Ao menos um documento (link ou arquivo)",
      met: !validation.documento,
    },
  ];
}

export function getBusinessDateTodayLabel() {
  return getBusinessDateToday();
}

function mapLifecycleError(message: string) {
  for (const [code, label] of Object.entries(LIFECYCLE_ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return label;
    }
  }

  return message;
}
