import { useState } from "react";
import { useCliente } from "@/contexts/ClienteContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Edit, Save, Trash2, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AttachmentsDialog } from "@/components/AttachmentsDialog";

interface Processo {
  id_proc: number;
  n_processo: string;
  dt_entrada: string;
  dt_fatal: string;
  reclamante: string;
  reclamado: string;
  instrucao: string;
  status: string;
  obs: string;
  cod_cli: number;
  nome_cli: string;
}

const CadastroProcessos = () => {
  const { cliente, user } = useCliente();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [searchNumero, setSearchNumero] = useState("ALL");
  const [searchStatus, setSearchStatus] = useState("Todos");
  const [searchDataFatal, setSearchDataFatal] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [formData, setFormData] = useState<Partial<Processo>>({
    n_processo: "",
    dt_entrada: format(new Date(), "yyyy-MM-dd"),
    dt_fatal: format(new Date(), "yyyy-MM-dd"),
    reclamante: "",
    reclamado: "",
    instrucao: "",
    status: "Pendente",
    obs: "",
  });
  const [selectedProcesso, setSelectedProcesso] = useState<number | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [attachmentsDialogOpen, setAttachmentsDialogOpen] = useState(false);
  const [selectedProcessoForAttachments, setSelectedProcessoForAttachments] = useState<Processo | null>(null);

  const handleSearch = async () => {
    if (!user || !cliente) return;

    try {
      let query = supabase
        .from("t_processoweb")
        .select("*")
        .eq("user_id", user.id);

      // Lógica de filtragem inteligente
      if (searchNumero.trim() !== "" && searchNumero !== "ALL") {
        // Se número do processo está preenchido, ignora outros filtros
        query = query.ilike("n_processo", `%${searchNumero}%`);
      } else if (searchNumero === "ALL") {
        // Filtra por data fatal >= data informada
        query = query.gte("dt_fatal", searchDataFatal);
        
        // Se status não for "Todos", aplica filtro de status
        if (searchStatus !== "Todos") {
          query = query.eq("status", searchStatus);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      setProcessos(data || []);
      setInitialLoad(false);
      toast.success("Busca realizada com sucesso");
    } catch (error: any) {
      toast.error("Erro ao buscar processos: " + error.message);
    }
  };

  const handleNew = () => {
    setFormData({
      n_processo: "",
      dt_entrada: format(new Date(), "yyyy-MM-dd"),
      dt_fatal: format(new Date(), "yyyy-MM-dd"),
      reclamante: "",
      reclamado: "",
      instrucao: "",
      status: "Pendente",
      obs: "",
    });
    setSelectedProcesso(null);
    setIsEditing(true);
  };

  const handleEdit = (processo: Processo) => {
    if (processo.status !== "Pendente") {
      toast.error("Só é possível editar processos com status 'Pendente'");
      return;
    }
    
    setFormData({
      n_processo: processo.n_processo,
      dt_entrada: processo.dt_entrada?.split("T")[0] || format(new Date(), "yyyy-MM-dd"),
      dt_fatal: processo.dt_fatal?.split("T")[0] || format(new Date(), "yyyy-MM-dd"),
      reclamante: processo.reclamante,
      reclamado: processo.reclamado,
      instrucao: processo.instrucao,
      status: processo.status,
      obs: processo.obs,
    });
    setSelectedProcesso(processo.id_proc);
    setIsEditing(true);
  };

  const handleDoubleClick = (processo: Processo) => {
    handleEdit(processo);
  };

  const handleSave = async () => {
    if (!user || !cliente) return;

    try {
      const dataToSave = {
        ...formData,
        user_id: user.id,
        cod_cli: cliente.codigo_cliente,
        nome_cli: cliente.nome_cliente,
      };

      if (selectedProcesso) {
        // Update
        const { error } = await supabase
          .from("t_processoweb")
          .update(dataToSave)
          .eq("id_proc", selectedProcesso);

        if (error) throw error;
        toast.success("Processo atualizado com sucesso");
      } else {
        // Insert
        const { error } = await supabase
          .from("t_processoweb")
          .insert([dataToSave]);

        if (error) throw error;
        toast.success("Processo cadastrado com sucesso");
      }

      handleCancel();
      handleSearch();
    } catch (error: any) {
      toast.error("Erro ao salvar processo: " + error.message);
    }
  };

  const handleDelete = async () => {
    if (!selectedProcesso) {
      toast.error("Selecione um processo para excluir");
      return;
    }

    const processo = processos.find(p => p.id_proc === selectedProcesso);
    if (processo?.status !== "Pendente") {
      toast.error("Só é possível excluir processos com status 'Pendente'");
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este processo?")) return;

    try {
      const { error } = await supabase
        .from("t_processoweb")
        .delete()
        .eq("id_proc", selectedProcesso);

      if (error) throw error;

      toast.success("Processo excluído com sucesso");
      handleCancel();
      handleSearch();
    } catch (error: any) {
      toast.error("Erro ao excluir processo: " + error.message);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedProcesso(null);
    setFormData({
      n_processo: "",
      dt_entrada: format(new Date(), "yyyy-MM-dd"),
      dt_fatal: format(new Date(), "yyyy-MM-dd"),
      reclamante: "",
      reclamado: "",
      instrucao: "",
      status: "Pendente",
      obs: "",
    });
  };

  const isEditableOrDeletable = () => {
    if (!selectedProcesso) return false;
    const processo = processos.find(p => p.id_proc === selectedProcesso);
    return processo?.status === "Pendente";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-serif font-bold text-primary">
          Cadastro de Processos
        </h1>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSearch} variant="default">
          <Search className="h-4 w-4 mr-2" />
          Pesquisar
        </Button>
        <Button onClick={handleNew} variant="default" className="bg-green-600 hover:bg-green-700">
          <Plus className="h-4 w-4 mr-2" />
          Novo
        </Button>
        <Button
          onClick={() => selectedProcesso && handleEdit(processos.find(p => p.id_proc === selectedProcesso)!)}
          variant="default"
          disabled={!selectedProcesso || !isEditableOrDeletable()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          <Edit className="h-4 w-4 mr-2" />
          Alterar
        </Button>
        <Button 
          onClick={handleSave} 
          variant="default" 
          disabled={!isEditing} 
          className="bg-green-700 hover:bg-green-800 disabled:opacity-50"
        >
          <Save className="h-4 w-4 mr-2" />
          Salvar
        </Button>
        <Button 
          onClick={handleDelete} 
          variant="destructive" 
          disabled={!selectedProcesso || !isEditableOrDeletable()}
          className="disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </Button>
        <Button onClick={handleCancel} variant="outline" className="bg-yellow-500 hover:bg-yellow-600">
          <X className="h-4 w-4 mr-2" />
          Cancelar
        </Button>
      </div>

      {/* Search Filters */}
      <div className="bg-card rounded-lg p-4 border border-border shadow-card">
        <h2 className="text-lg font-semibold text-foreground mb-4">Pesquisar Processo</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="search-numero">Nº do Processo</Label>
            <Input
              id="search-numero"
              value={searchNumero}
              onChange={(e) => setSearchNumero(e.target.value)}
              placeholder="ALL"
            />
          </div>
          <div>
            <Label htmlFor="search-status">Status</Label>
            <Select value={searchStatus} onValueChange={setSearchStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Em Execução">Em Execução</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="search-data">Data Fatal</Label>
            <Input
              id="search-data"
              type="date"
              value={searchDataFatal}
              onChange={(e) => setSearchDataFatal(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-card rounded-lg border border-border shadow-card overflow-hidden">
        <div className="p-4 bg-accent/10 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Processos Localizados</h2>
        </div>
        <div className="overflow-x-auto">
          {initialLoad ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhum filtro aplicado. Utilize os campos acima para pesquisar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anexos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Nº do Processo</TableHead>
                  <TableHead>Reclamante</TableHead>
                  <TableHead>Reclamado</TableHead>
                  <TableHead>Data Fatal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processos.map((processo) => (
                  <TableRow
                    key={processo.id_proc}
                    onClick={() => setSelectedProcesso(processo.id_proc)}
                    onDoubleClick={() => handleDoubleClick(processo)}
                    className={`cursor-pointer ${
                      selectedProcesso === processo.id_proc ? "bg-accent" : ""
                    }`}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProcessoForAttachments(processo);
                          setAttachmentsDialogOpen(true);
                        }}
                      >
                        <FileText className="h-4 w-4 text-primary" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          processo.status === "Pendente"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : processo.status === "Concluído"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : processo.status === "Cancelado"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {processo.status}
                      </span>
                    </TableCell>
                    <TableCell>{processo.n_processo}</TableCell>
                    <TableCell>{processo.reclamante}</TableCell>
                    <TableCell>{processo.reclamado}</TableCell>
                    <TableCell>
                      {processo.dt_fatal
                        ? format(new Date(processo.dt_fatal), "dd/MM/yyyy")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="bg-card rounded-lg p-6 border border-border shadow-card">
        <h2 className="text-lg font-semibold text-foreground mb-4">Dados do Processo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="n_processo">Nº do Processo</Label>
              <Input
                id="n_processo"
                value={formData.n_processo || ""}
                onChange={(e) =>
                  setFormData({ ...formData, n_processo: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>
            <div>
              <Label htmlFor="reclamante">Reclamante</Label>
              <Input
                id="reclamante"
                value={formData.reclamante || ""}
                onChange={(e) =>
                  setFormData({ ...formData, reclamante: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>
            <div>
              <Label htmlFor="reclamado">Reclamado</Label>
              <Input
                id="reclamado"
                value={formData.reclamado || ""}
                onChange={(e) =>
                  setFormData({ ...formData, reclamado: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>
            <div>
              <Label htmlFor="instrucao">Instrução</Label>
              <Input
                id="instrucao"
                value={formData.instrucao || ""}
                onChange={(e) =>
                  setFormData({ ...formData, instrucao: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="dt_entrada">Data de Entrada</Label>
              <Input
                id="dt_entrada"
                type="date"
                value={formData.dt_entrada || ""}
                readOnly
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="dt_fatal">Data Fatal</Label>
              <Input
                id="dt_fatal"
                type="date"
                value={formData.dt_fatal || ""}
                onChange={(e) =>
                  setFormData({ ...formData, dt_fatal: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                value={formData.status || ""}
                readOnly
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={formData.obs || ""}
                onChange={(e) =>
                  setFormData({ ...formData, obs: e.target.value })
                }
                disabled={!isEditing}
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Attachments Dialog */}
      {selectedProcessoForAttachments && (
        <AttachmentsDialog
          open={attachmentsDialogOpen}
          onOpenChange={setAttachmentsDialogOpen}
          idProc={selectedProcessoForAttachments.id_proc}
          processNumber={selectedProcessoForAttachments.n_processo}
        />
      )}
    </div>
  );
};

export default CadastroProcessos;
