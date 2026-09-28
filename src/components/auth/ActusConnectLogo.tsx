import markDark from "@/assets/auth/actus-connect-mark-dark.png";
import markLight from "@/assets/auth/actus-connect-mark-light.png";

/**
 * Actus Connect product mark for the auth card (theme-aware via document .dark class).
 */
export function ActusConnectLogo() {
  return (
    <span
      className="inline-flex h-14 w-14 shrink-0 items-center justify-center"
      role="img"
      aria-label="Actus Connect"
    >
      <img
        src={markLight}
        alt=""
        aria-hidden
        className="block h-14 w-auto max-h-14 max-w-full object-contain dark:hidden"
        decoding="async"
      />
      <img
        src={markDark}
        alt=""
        aria-hidden
        className="hidden h-14 w-auto max-h-14 max-w-full object-contain dark:block"
        decoding="async"
      />
    </span>
  );
}
