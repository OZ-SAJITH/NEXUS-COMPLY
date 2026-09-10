export const LOGO_URL = "/nexus-comply-logo.png";
export const LOGO_RATIO = 408 / 336;

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src={LOGO_URL}
      alt=""
      role="presentation"
      width={Math.round(size * LOGO_RATIO)}
      height={size}
      draggable={false}
      className={`select-none object-contain ${className ?? ""}`}
    />
  );
}

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 select-none ${className ?? ""}`}>
      <img
        src={LOGO_URL}
        alt="NEXUS-COMPLY"
        width={Math.round(size * LOGO_RATIO)}
        height={size}
        draggable={false}
        className="select-none object-contain"
        loading="eager"
      />
    </span>
  );
}