type OrvantaLogoProps = {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
};

export default function OrvantaLogo({
  size = 42,
  showWordmark = true,
  subtitle,
  className = "",
}: OrvantaLogoProps) {
  return (
    <span className={`orvanta-lockup ${className}`} aria-label="Orvanta">
      <span className="orvanta-mark" style={{ width: size, height: size }} aria-hidden="true">
        <svg viewBox="0 0 108 74" role="img" focusable="false">
          <path
            d="M47 12C27 12 12 27 12 46C12 65 27 72 47 72"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle cx="34" cy="44" r="7.8" fill="currentColor" />
          <path
            d="M44 43C54 56 72 56 83 42C89 34 96 31 102 33"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M80 55C83 67 96 73 106 66"
            fill="none"
            stroke="var(--orvanta-accent, #0797B7)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle cx="98" cy="33" r="7.8" fill="var(--orvanta-accent, #0797B7)" />
        </svg>
      </span>

      {showWordmark && (
        <span className="orvanta-wordmark">
          <b>Orvanta</b>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
      )}
    </span>
  );
}
