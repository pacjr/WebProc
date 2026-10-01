import { useId } from "react";
import { Download, ExternalLink, Paperclip, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WebProcProcessoDocument } from "@/integrations/supabase/webproc-types";
import { formatBytes } from "@/lib/webproc-file-policy";
import {
  getDocumentoDisplayName,
  getDocumentoFileMeta,
  getLinkHostname,
} from "@/lib/webproc-documents";

type ProcessoDocumentosSectionProps = {
  documents: WebProcProcessoDocument[];
  canEdit: boolean;
  linkNome: string;
  linkUrl: string;
  linkUrlError: string | null;
  linkSaving: boolean;
  pendingUploadFile: File | null;
  fileError: string | null;
  fileBusy: boolean;
  downloadBusyId: string | null;
  pendingRemoveDocument: WebProcProcessoDocument | null;
  onLinkNomeChange: (value: string) => void;
  onLinkUrlChange: (value: string) => void;
  onAddLink: () => void;
  onPickUploadFile: (file: File | null) => void;
  onAttachFile: () => void;
  onDownloadFile: (document: WebProcProcessoDocument) => void;
  onRequestRemove: (document: WebProcProcessoDocument) => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
};

export default function ProcessoDocumentosSection({
  documents,
  canEdit,
  linkNome,
  linkUrl,
  linkUrlError,
  linkSaving,
  pendingUploadFile,
  fileError,
  fileBusy,
  downloadBusyId,
  pendingRemoveDocument,
  onLinkNomeChange,
  onLinkUrlChange,
  onAddLink,
  onPickUploadFile,
  onAttachFile,
  onDownloadFile,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: ProcessoDocumentosSectionProps) {
  const fileInputId = useId();
  const actionBusy = linkSaving || fileBusy;

  return (
    <section className="space-y-4 border-t border-border pt-8" aria-labelledby="documentos-heading">
      <div>
        <h2 id="documentos-heading" className="font-serif text-lg font-semibold text-primary">
          Documentos
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Adicione links ou arquivos necessários para protocolização.
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => {
            const isLink = doc.tipo === "LINK" && doc.url;
            const url = doc.url ?? "";
            const hostname = isLink ? getLinkHostname(url) : null;
            const fileMeta = getDocumentoFileMeta(doc);
            const downloading = downloadBusyId === doc.id;

            return (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{getDocumentoDisplayName(doc)}</p>
                  {isLink && hostname ? (
                    <p className="text-sm text-muted-foreground break-all">{hostname}</p>
                  ) : null}
                  {!isLink && fileMeta ? (
                    <p className="text-sm text-muted-foreground">{fileMeta}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-3">
                    {isLink ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-all"
                      >
                        Abrir
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm"
                        disabled={actionBusy || downloading}
                        onClick={() => onDownloadFile(doc)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden />
                        {downloading ? "Preparando..." : "Baixar"}
                      </Button>
                    )}
                  </div>
                </div>
                {canEdit && isLink ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={actionBusy}
                    onClick={() => onRequestRemove(doc)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" aria-hidden />
                    Remover
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="space-y-6 rounded-md border border-dashed border-border p-4">
          <div className="space-y-4">
            <p className="text-sm font-medium">Adicionar link</p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="link_nome">Nome do documento</Label>
                <Input
                  id="link_nome"
                  value={linkNome}
                  onChange={(e) => onLinkNomeChange(e.target.value)}
                  placeholder="Ex.: Sentença"
                  disabled={actionBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="link_url">Endereço do documento</Label>
                <Input
                  id="link_url"
                  value={linkUrl}
                  onChange={(e) => onLinkUrlChange(e.target.value)}
                  placeholder="https://..."
                  disabled={actionBusy}
                  aria-invalid={linkUrlError ? true : undefined}
                  aria-describedby={linkUrlError ? "link_url_error" : undefined}
                />
                {linkUrlError ? (
                  <p id="link_url_error" className="text-sm text-destructive" role="alert">
                    {linkUrlError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={actionBusy}
                onClick={() => onAddLink()}
              >
                {linkSaving ? "Adicionando..." : "Adicionar"}
              </Button>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Anexar arquivo</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id={fileInputId}
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                disabled={actionBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  onPickUploadFile(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={actionBusy}
                onClick={() => document.getElementById(fileInputId)?.click()}
              >
                <Paperclip className="h-4 w-4 mr-2" aria-hidden />
                Selecionar arquivo
              </Button>
              <Button
                type="button"
                variant="legal"
                disabled={actionBusy || !pendingUploadFile}
                onClick={() => onAttachFile()}
              >
                {fileBusy ? "Enviando..." : "Anexar arquivo"}
              </Button>
            </div>
            {pendingUploadFile ? (
              <p className="text-sm text-muted-foreground">
                Selecionado:{" "}
                <span className="font-medium text-foreground break-all">
                  {pendingUploadFile.name}
                </span>{" "}
                ({formatBytes(pendingUploadFile.size)})
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                PDF, Word, Excel ou CSV — até {formatBytes(104_857_600)}.
              </p>
            )}
            {fileError ? (
              <p className="text-sm text-destructive" role="alert">
                {fileError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Links podem ser abertos acima. Arquivos anexados podem ser baixados quando disponíveis.
        </p>
      )}

      <AlertDialog
        open={pendingRemoveDocument !== null}
        onOpenChange={(open) => {
          if (!open) {
            onCancelRemove();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover documento?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoveDocument
                ? `O documento “${getDocumentoDisplayName(pendingRemoveDocument)}” será removido deste protocolo. Esta ação não pode ser desfeita.`
                : "O documento será removido deste protocolo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linkSaving}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={linkSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                onConfirmRemove();
              }}
            >
              {linkSaving ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
