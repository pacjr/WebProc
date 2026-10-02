import {
  connectShellBrandBlockClassName,
  connectShellBrandContextClassName,
  connectShellBrandEyebrowClassName,
  connectShellBrandTitleClassName,
} from "@/lib/operational-visual-language";

type ConnectShellBrandBlockProps = {
  contextSubtitle: string;
  compact?: boolean;
};

export function ConnectShellBrandBlock({
  contextSubtitle,
  compact = false,
}: ConnectShellBrandBlockProps) {
  return (
    <div className={compact ? "px-1 py-1" : connectShellBrandBlockClassName}>
      <p className={connectShellBrandEyebrowClassName}>Actus</p>
      <p className={connectShellBrandTitleClassName}>Connect</p>
      <p className={connectShellBrandContextClassName} title={contextSubtitle}>
        {contextSubtitle}
      </p>
    </div>
  );
}
