import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface AttachmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProc: number;
  processNumber: string;
}

interface Attachment {
  name: string;
  size: number;
  created_at: string;
  url: string | null;
  caminho_arquivo: string; // novo campo vindo da tabela
}

export const AttachmentsDialog = ({
  open,
  onOpenChange,
  idProc,
  processNumber,
}: AttachmentsDialogProps) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      loadAttachments();
    }
  }, [open, idProc]);

  const loadAttachments = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Você precisa estar autenticado");
        return;
      }

      const { data, error } = await supabase.functions.invoke('list-attachments', {
        body: { id_proc: idProc },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      setAttachments(data.files || []);
    } catch (error: any) {
      console.error("Erro ao carregar anexos:", error);
      toast.error("Erro ao carregar anexos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Você precisa estar autenticado");
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('id_proc', idProc.toString());

      const { error } = await supabase.functions.invoke('upload-attachment', {
        body: formData,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success("Arquivo enviado com sucesso");
      loadAttachments();
    } catch (error: any) {
      console.error("Erro ao enviar arquivo:", error);
      toast.error("Erro ao enviar arquivo: " + error.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDelete = async (fileName: string, caminhoArquivo: string) => {
    if (!confirm(`Tem certeza que deseja excluir o arquivo "${fileName}"?`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Você precisa estar autenticado");
        return;
      }

      const { error } = await supabase.functions.invoke('delete-attachment', {
        body: { id_proc: idProc, fileName, caminho_arquivo: caminhoArquivo },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success("Arquivo excluído com sucesso");
      loadAttachments();
    } catch (error: any) {
      console.error("Erro ao excluir arquivo:", error);
      toast.error("Erro ao excluir arquivo: " + error.message);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerenciador de Anexos</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Processo: {processNumber}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Upload Button */}
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt"
            />
            <label htmlFor="file-upload">
              <Button
                type="button"
                disabled={uploading}
                className="cursor-pointer"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Adicionar Arquivo
                  </>
                )}
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              Formatos aceitos: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX, TXT
            </p>
          </div>

          {/* Files List */}
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground mt-2">Carregando anexos...</p>
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum arquivo anexado até o momento.
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.name}
                  className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{attachment.name}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{formatFileSize(attachment.size)}</span>
                      <span>
                        {attachment.created_at
                          ? format(new Date(attachment.created_at), "dd/MM/yyyy HH:mm")
                          : "-"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(attachment.name, attachment.caminho_arquivo)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};