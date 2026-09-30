/** Row shape returned by webproc.admin_list_clientes(). */
export interface AdminCliente {
  id: number;
  codigo_cliente: number;
  nome: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}
