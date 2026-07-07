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
        <svg viewBox="0 0 96 72" role="img" focusable="false">
          <path
            d="M42 18C25.5 18 14 29.7 14 45C14 60.3 25.5 70 42 70"
            fill="none"
            stroke="currentColor"
            strokeWidth="7.4"
            strokeLinecap="round"
          />
          <path
            d="M36 44C45.5 57.5 62.5 56.7 72 43.4C78 35 84.5 32.6 91 34.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="6.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M70 54C73.3 66.8 87.7 72.4 98 64.2"
            fill="none"
            stroke="var(--orvanta-accent, #0797B7)"
            strokeWidth="7.4"
            strokeLinecap="round"
          />
          <circle cx="33" cy="43" r="6.8" fill="currentColor" />
          <circle cx="88" cy="34" r="6.8" fill="var(--orvanta-accent, #0797B7)" />
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
