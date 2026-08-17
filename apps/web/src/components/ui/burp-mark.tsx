/**
 * Burps vinjett — märket och ordbilden.
 *
 * Definieras en gång och används i varje sidhuvud: gästens, personalens,
 * kontots och backoffice. Innan den fanns ritade fyra filer var sitt "Burp" i
 * rubriktypsnittet, och den som ändrade en av dem lämnade de andra kvar.
 *
 * Formen ligger i `globals.css` (`.burp-mark`, `.burp-wordmark`), storleken
 * här. Samma delning som resten av byggstenarna: utseendet på ett ställe,
 * måtten där de används.
 *
 * Märket är dekor och döljs för uppläsaren — ordbilden bär namnet. Utan
 * ordbild måste den som anropar sätta ett `aria-label` på länken runt om,
 * annars läser skärmläsaren upp en tom länk.
 */

export type BurpMarkSize = "sm" | "md" | "lg";

const MARK: Record<BurpMarkSize, string> = {
  sm: "h-[26px] w-[26px] rounded-[7px] text-[12px]",
  md: "h-[34px] w-[34px] rounded-[9px] text-[16px]",
  lg: "h-[44px] w-[44px] rounded-[11px] text-[21px]",
};

const WORDMARK: Record<BurpMarkSize, string> = {
  sm: "text-[16px]",
  md: "text-[21px]",
  lg: "text-[27px]",
};

export function BurpMark({
  size = "sm",
  /** Sätt false där bara märket får plats — telefonens sidhuvud, en avatarrad. */
  wordmark = true,
  className = "",
}: {
  size?: BurpMarkSize;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`burp-mark ${MARK[size]}`} aria-hidden="true">
        B
      </span>
      {wordmark ? <span className={`burp-wordmark ${WORDMARK[size]}`}>burp</span> : null}
    </span>
  );
}
