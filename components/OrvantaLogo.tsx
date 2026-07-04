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
        <svg viewBox="0 0 64 64" role="img" focusable="false">
          <defs>
            <linearGradient id="orvantaGradient" x1="10" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#3B82F6" />
              <stop offset="0.52" stopColor="#06B6D4" />
              <stop offset="1" stopColor="#14B8A6" />
            </linearGradient>
            <radialGradient id="orvantaGlow" cx="24" cy="18" r="42" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="3" y="3" width="58" height="58" rx="17" fill="url(#orvantaGradient)" />
          <rect x="3" y="3" width="58" height="58" rx="17" fill="url(#orvantaGlow)" />
          <path
            d="M17.5 19.5C21.2 14.9 26.1 12.6 32 12.6C37.9 12.6 42.8 14.9 46.5 19.5C49.7 23.4 51.3 27.6 51.3 32C51.3 36.4 49.7 40.6 46.5 44.5C42.8 49.1 37.9 51.4 32 51.4C26.1 51.4 21.2 49.1 17.5 44.5C14.3 40.6 12.7 36.4 12.7 32C12.7 27.6 14.3 23.4 17.5 19.5Z"
            fill="none"
            stroke="rgba(255,255,255,0.88)"
            strokeWidth="5.6"
          />
          <path
            d="M21 23L32 43L43 23"
            fill="none"
            stroke="#07111F"
            strokeWidth="7.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.72"
          />
          <path
            d="M21 22.5L32 42.5L43 22.5"
            fill="none"
            stroke="white"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
