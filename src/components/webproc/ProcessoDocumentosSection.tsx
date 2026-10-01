import { ExternalLink, Paperclip, Trash2 } from "lucide-react";
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
import {
  getDocumentoDisplayName,
  getLinkHostname,
} from "@/lib/webproc-documents";

type ProcessoDocumentosSectionProps = {
  documents: WebProcProcessoDocument[];
  canEdit: boolean;
  linkNome: string;
  linkUrl: string;
  linkUrlError: string | null;
  linkSaving: boolean;
  pendingRemoveDocument: WebProcProcessoDocument | null;
  onLinkNomeChange: (value: string) => void;
  onLinkUrlChange: (value: string) => void;
  onAddLink: () => void;
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
  pendingRemoveDocument,
  onLinkNomeChange,
  onLinkUrlChange,
  onAddLink,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: ProcessoDocumentosSectionProps) {
  const linkDocuments = documents.filter((doc) => doc.tipo === "LINK" && doc.url);
  const fileDocuments = documents.filter((doc) => doc.tipo === "ARQUIVO");

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
          {linkDocuments.map((doc) => {
            const url = doc.url!;
            const hostname = getLinkHostname(url);
            return (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{getDocumentoDisplayName(doc)}</p>
                  {hostname ? (
                    <p className="text-sm text-muted-foreground break-all">{hostname}</p>
                  ) : null}
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1 break-all"
                  >
                    Abrir
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </a>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={linkSaving}
                    onClick={() => onRequestRemove(doc)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" aria-hidden />
                    Remover
                  </Button>
                ) : null}
              </li>
            );
          })}
          {fileDocuments.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{getDocumentoDisplayName(doc)}</p>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={linkSaving}
                  onClick={() => onRequestRemove(doc)}
                >
                  <Trash2 className="h-4 w-4 mr-2" aria-hidden />
                  Remover
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="space-y-4 rounded-md border border-dashed border-border p-4">
          <p className="text-sm font-medium">Adicionar link</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="link_nome">Nome do documento</Label>
              <Input
                id="link_nome"
                value={linkNome}
                onChange={(e) => onLinkNomeChange(e.target.value)}
                placeholder="Ex.: Sentença"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link_url">Endereço do documento</Label>
              <Input
                id="link_url"
                value={linkUrl}
                onChange={(e) => onLinkUrlChange(e.target.value)}
                placeholder="https://..."
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
              disabled={linkSaving}
              onClick={() => onAddLink()}
            >
              {linkSaving ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Anexar arquivo estará disponível em breve nesta mesma seção.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Anexar arquivo estará disponível em breve.
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
