import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ProtocolizationBlockerDialogProps = {
  open: boolean;
  blockers: string[];
  onClose: () => void;
};

export default function ProtocolizationBlockerDialog({
  open,
  blockers,
  onClose,
}: ProtocolizationBlockerDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Protocolo ainda não pode ser protocolado</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Complete os itens abaixo antes de continuar.</p>
              <ul className="list-disc pl-5 space-y-2 text-foreground" role="list">
                {blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction type="button" onClick={onClose}>
            Voltar ao protocolo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
