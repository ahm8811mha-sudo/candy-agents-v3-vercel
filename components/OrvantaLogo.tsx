import Image from "next/image";

type OrvantaLogoProps = {
  /** Full-logo width, or square mark size when showWordmark=false. */
  size?: number;
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
  priority?: boolean;
};

export default function OrvantaLogo({
  size = 148,
  showWordmark = true,
  subtitle,
  className = "",
  priority = false,
}: OrvantaLogoProps) {
  if (!showWordmark) {
    return (
      <span
        className={`orvanta-lockup orvanta-lockup--mark ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Orvanta"
      >
        <svg className="orvanta-mark-svg" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
          <path d="M236 160C188 160 152 196 152 244C152 292 188 328 236 328" stroke="currentColor" strokeWidth="28" strokeLinecap="round" fill="none" />
          <path d="M226 246C254 284 302 284 330 246C348 222 372 211 402 218" stroke="currentColor" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M336 282C343 318 376 343 413 336C450 329 475 296 468 259" stroke="var(--orvanta-accent, #0797B7)" strokeWidth="28" strokeLinecap="round" fill="none" />
          <circle cx="216" cy="246" r="22" fill="currentColor" />
          <circle cx="402" cy="218" r="22" fill="var(--orvanta-accent, #0797B7)" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`orvanta-lockup orvanta-lockup--full ${className}`}
      style={{ width: size }}
      role="img"
      aria-label={subtitle ? `Orvanta — ${subtitle}` : "Orvanta"}
    >
      <Image
        className="orvanta-logo-image"
        src="/orvanta-logo.svg"
        alt=""
        width={740}
        height={453}
        priority={priority}
      />
      {subtitle ? <small className="orvanta-logo-subtitle">{subtitle}</small> : null}
    </span>
  );
}
