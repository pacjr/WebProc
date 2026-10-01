export type ProcessoStatus =
  | "EM_PREENCHIMENTO"
  | "PENDENTE"
  | "IMPORTADO"
  | "CONCLUIDO"
  | "CANCELADO";

export type DocumentoStorageState = "STORED" | "PERSISTED" | "PURGED";

export type DocumentoTipo = "LINK" | "ARQUIVO";

export interface WebProcProcesso {
  id_proc: number;
  cliente_id: number;
  created_by: string;
  n_processo: string | null;
  exec_prov: string | null;
  nome_cli: string | null;
  reclamante: string | null;
  reclamado: string | null;
  instituicao: string | null;
  instrucao: string | null;
  obs: string | null;
  dt_entrada: string;
  dt_fatal: string | null;
  status: ProcessoStatus;
  pendente_at: string | null;
  importado_at: string | null;
  concluido_at: string | null;
  cancelado_at: string | null;
  cancelado_por: string | null;
  motivo_cancelamento: string | null;
  origem_cancelamento: string | null;
  status_antes_cancelamento: string | null;
  created_at: string;
  updated_at: string;
}

export type WebProcProcessoInsert = {
  id_proc?: number;
  cliente_id: number;
  created_by: string;
  n_processo?: string | null;
  exec_prov?: string | null;
  nome_cli?: string | null;
  reclamante?: string | null;
  reclamado?: string | null;
  instituicao?: string | null;
  instrucao?: string | null;
  obs?: string | null;
  dt_entrada?: string;
  dt_fatal?: string | null;
  status?: ProcessoStatus;
  pendente_at?: string | null;
  importado_at?: string | null;
  concluido_at?: string | null;
  cancelado_at?: string | null;
  cancelado_por?: string | null;
  motivo_cancelamento?: string | null;
  origem_cancelamento?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WebProcProcessoDraftUpdate = {
  n_processo?: string | null;
  exec_prov?: string | null;
  reclamante?: string | null;
  reclamado?: string | null;
  instrucao?: string | null;
  obs?: string | null;
  dt_fatal?: string | null;
};

export type WebProcDocumentoTipo = "LINK" | "ARQUIVO";

export interface WebProcProcessoDocument {
  id: string;
  id_proc: number;
  tipo: WebProcDocumentoTipo;
  nome: string | null;
  url: string | null;
  nome_arquivo?: string | null;
  storage_state?: string | null;
  created_at: string;
}

/** @deprecated Use WebProcProcessoDocument */
export type WebProcProcessoLink = WebProcProcessoDocument & { tipo: "LINK"; url: string };

export interface WebProcRemoverDocumentoResult {
  success: boolean;
  document_id: string;
  tipo: WebProcDocumentoTipo;
}

export interface WebProcAuthorIdentity {
  nome: string | null;
  email: string;
}

export interface WebProcProtocolarResult {
  success: boolean;
  id_proc: number;
  status?: ProcessoStatus;
  pendente_at?: string | null;
  already_protocolado?: boolean;
  error?: string;
}

export interface WebProcSalvarRascunhoResult {
  success: boolean;
  id_proc: number;
  error?: string;
}

export interface WebProcReabrirResult {
  success: boolean;
  id_proc: number;
  status: ProcessoStatus;
  pendente_at: string | null;
  already_open: boolean;
}

export interface WebProcCancelarResult {
  success: boolean;
  id_proc: number;
  status: ProcessoStatus;
  cancelado_at?: string | null;
  status_antes_cancelamento?: string | null;
  r2_cleanup_marked?: number;
  already_cancelado?: boolean;
}

export interface WebProcProtocolRequirement {
  id: string;
  label: string;
  met: boolean;
}

export type WebProcDatabase = {
  webproc: {
    Tables: {
      clientes: {
        Row: {
          id: number;
          codigo_cliente: number;
          nome: string;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          codigo_cliente: number;
          nome: string;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          codigo_cliente?: number;
          nome?: string;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      usuarios_clientes: {
        Row: {
          id: number;
          cliente_id: number;
          user_id: string | null;
          nome: string | null;
          email: string;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          cliente_id: number;
          user_id?: string | null;
          nome?: string | null;
          email: string;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          cliente_id?: number;
          user_id?: string | null;
          nome?: string | null;
          email?: string;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usuarios_clientes_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      processos: {
        Row: WebProcProcesso;
        Insert: WebProcProcessoInsert;
        Update: Partial<WebProcProcesso>;
        Relationships: [
          {
            foreignKeyName: "processos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      processo_documentos: {
        Row: {
          id: string;
          id_proc: number;
          tipo: DocumentoTipo;
          nome: string | null;
          url: string | null;
          object_key: string | null;
          nome_arquivo: string | null;
          content_type: string | null;
          tamanho: number | null;
          storage_state: DocumentoStorageState | null;
          persisted_at: string | null;
          purged_at: string | null;
          r2_cleanup_pending: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          id_proc: number;
          tipo: DocumentoTipo;
          nome?: string | null;
          url?: string | null;
          object_key?: string | null;
          nome_arquivo?: string | null;
          content_type?: string | null;
          tamanho?: number | null;
          storage_state?: DocumentoStorageState | null;
          persisted_at?: string | null;
          purged_at?: string | null;
          r2_cleanup_pending?: boolean;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          id_proc?: number;
          tipo?: DocumentoTipo;
          nome?: string | null;
          url?: string | null;
          object_key?: string | null;
          nome_arquivo?: string | null;
          content_type?: string | null;
          tamanho?: number | null;
          storage_state?: DocumentoStorageState | null;
          persisted_at?: string | null;
          purged_at?: string | null;
          r2_cleanup_pending?: boolean;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "processo_documentos_id_proc_fkey";
            columns: ["id_proc"];
            isOneToOne: false;
            referencedRelation: "processos";
            referencedColumns: ["id_proc"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      protocolar_processo: {
        Args: {
          p_id_proc: number;
        };
        Returns: WebProcProtocolarResult;
      };
      reabrir_processo: {
        Args: {
          p_id_proc: number;
        };
        Returns: WebProcReabrirResult;
      };
      cancelar_processo: {
        Args: {
          p_id_proc: number;
          p_motivo?: string | null;
        };
        Returns: WebProcCancelarResult;
      };
      remover_documento: {
        Args: {
          p_document_id: string;
        };
        Returns: WebProcRemoverDocumentoResult;
      };
      is_active_connect_actus_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_active_connect_actus_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      admin_list_clientes: {
        Args: Record<string, never>;
        Returns: {
          id: number;
          codigo_cliente: number;
          nome: string;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_create_cliente: {
        Args: {
          p_codigo_cliente: number;
          p_nome: string;
        };
        Returns: {
          id: number;
          codigo_cliente: number;
          nome: string;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_update_cliente: {
        Args: {
          p_cliente_id: number;
          p_nome?: string;
          p_ativo?: boolean;
        };
        Returns: {
          id: number;
          codigo_cliente: number;
          nome: string;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_list_client_memberships: {
        Args: {
          p_cliente_id: number;
        };
        Returns: {
          id: number;
          cliente_id: number;
          email: string;
          nome: string | null;
          user_id: string | null;
          ativo: boolean;
          provisioning_state: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_create_client_membership: {
        Args: {
          p_cliente_id: number;
          p_email: string;
          p_nome?: string | null;
        };
        Returns: {
          id: number;
          cliente_id: number;
          email: string;
          nome: string | null;
          user_id: string | null;
          ativo: boolean;
          provisioning_state: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_update_client_membership: {
        Args: {
          p_membership_id: number;
          p_nome: string;
        };
        Returns: {
          id: number;
          cliente_id: number;
          email: string;
          nome: string | null;
          user_id: string | null;
          ativo: boolean;
          provisioning_state: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_set_client_membership_active: {
        Args: {
          p_membership_id: number;
          p_ativo: boolean;
        };
        Returns: {
          id: number;
          cliente_id: number;
          email: string;
          nome: string | null;
          user_id: string | null;
          ativo: boolean;
          provisioning_state: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      pulse_summary: {
        Args: {
          p_period_start: string;
          p_period_end: string;
          p_created_by?: string;
          p_status?: string[];
          p_cliente_id?: number;
          p_snapshot_mode?: string;
        };
        Returns: Record<string, unknown>;
      };
      pulse_daily_series: {
        Args: {
          p_period_start: string;
          p_period_end: string;
          p_created_by?: string;
          p_status?: string[];
          p_cliente_id?: number;
        };
        Returns: Record<string, unknown>[];
      };
      pulse_by_user: {
        Args: {
          p_metric_basis: string;
          p_period_start: string;
          p_period_end: string;
          p_created_by?: string;
          p_status?: string[];
          p_cliente_id?: number;
        };
        Returns: Record<string, unknown>[];
      };
      pulse_by_client: {
        Args: {
          p_metric_basis: string;
          p_period_start: string;
          p_period_end: string;
          p_created_by?: string;
          p_status?: string[];
          p_cliente_id?: number;
        };
        Returns: Record<string, unknown>[];
      };
      pulse_drilldown: {
        Args: {
          p_period_start: string;
          p_period_end: string;
          p_created_by?: string;
          p_status?: string[];
          p_cliente_id?: number;
          p_lifecycle_basis?: string;
          p_limit?: number;
          p_cursor_created_at?: string;
          p_cursor_id_proc?: number;
        };
        Returns: Record<string, unknown>[];
      };
      salvar_rascunho: {
        Args: {
          p_id_proc: number;
          p_n_processo: string | null;
          p_exec_prov: string | null;
          p_reclamante: string | null;
          p_reclamado: string | null;
          p_instrucao: string | null;
          p_obs: string | null;
          p_dt_fatal: string | null;
        };
        Returns: WebProcSalvarRascunhoResult;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export interface WebProcMembership {
  membershipId: number;
  clienteId: number;
  nome: string | null;
  email: string;
  cliente: {
    id: number;
    codigo_cliente: number;
    nome: string;
  };
}

export interface WebProcProcessoDetail extends WebProcProcesso {
  author: WebProcAuthorIdentity | null;
  cliente: {
    nome: string;
  };
}

export type WebProcProcessoListItem = Pick<
  WebProcProcesso,
  | "id_proc"
  | "n_processo"
  | "exec_prov"
  | "reclamante"
  | "dt_entrada"
  | "dt_fatal"
  | "status"
> & {
  author: WebProcAuthorIdentity | null;
};
