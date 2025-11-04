export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      arquivos_enviados: {
        Row: {
          created_at: string
          data_envio: string
          data_expiracao: string
          id: string
          id_proc: number
          nome_arquivo: string
          status: string
          tamanho: number
          user_id: string
        }
        Insert: {
          created_at?: string
          data_envio?: string
          data_expiracao?: string
          id?: string
          id_proc: number
          nome_arquivo: string
          status?: string
          tamanho: number
          user_id: string
        }
        Update: {
          created_at?: string
          data_envio?: string
          data_expiracao?: string
          id?: string
          id_proc?: number
          nome_arquivo?: string
          status?: string
          tamanho?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_enviados_id_proc_fkey"
            columns: ["id_proc"]
            isOneToOne: false
            referencedRelation: "t_processoweb"
            referencedColumns: ["id_proc"]
          },
        ]
      }
      clientes: {
        Row: {
          codigo_cliente: number
          id: number
          nome_cliente: string
          user_id: string | null
        }
        Insert: {
          codigo_cliente: number
          id?: number
          nome_cliente: string
          user_id?: string | null
        }
        Update: {
          codigo_cliente?: number
          id?: number
          nome_cliente?: string
          user_id?: string | null
        }
        Relationships: []
      }
      t_docsprocessos: {
        Row: {
          id: number
          id_proc: number | null
          link_doc: string | null
          nome_doc: string | null
        }
        Insert: {
          id?: number
          id_proc?: number | null
          link_doc?: string | null
          nome_doc?: string | null
        }
        Update: {
          id?: number
          id_proc?: number | null
          link_doc?: string | null
          nome_doc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "t_docsprocessos_id_proc_fkey"
            columns: ["id_proc"]
            isOneToOne: false
            referencedRelation: "t_processoweb"
            referencedColumns: ["id_proc"]
          },
        ]
      }
      t_processoweb: {
        Row: {
          cod_cli: number | null
          dt_entrada: string | null
          dt_fatal: string | null
          id_proc: number
          instrucao: string | null
          n_processo: string | null
          nome_cli: string | null
          obs: string | null
          reclamado: string | null
          reclamante: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          cod_cli?: number | null
          dt_entrada?: string | null
          dt_fatal?: string | null
          id_proc?: number
          instrucao?: string | null
          n_processo?: string | null
          nome_cli?: string | null
          obs?: string | null
          reclamado?: string | null
          reclamante?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          cod_cli?: number | null
          dt_entrada?: string | null
          dt_fatal?: string | null
          id_proc?: number
          instrucao?: string | null
          n_processo?: string | null
          nome_cli?: string | null
          obs?: string | null
          reclamado?: string | null
          reclamante?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
