import { MessageSquareQuote, Star } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { fill, LOCALE_DATE_TAGS, type Dictionary, type Locale } from "@/lib/i18n";
import type { PublicReview } from "@/lib/reviews";

/**
 * Omdömen på den publika restaurangsidan (avsnitt 7).
 *
 * Serverkomponent utan klientstate. Recensioner är det som övertygar en tveksam
 * gäst, och de behöver därför finnas i HTML:en som Google läser — inte hämtas
 * in efteråt.
 *
 * Texterna kommer ur ordboken. Sidan ligger under `/sv/` respektive `/en/` och
 * indexeras på båda språken; komponenten skrev tidigare svenska rakt i koden,
 * vilket gav "Svar från restaurangen" mitt på den engelska sidan.
 */

/**
 * Datumformatet ligger i i18n-konfigurationen, inte här.
 *
 * Listan stod tidigare i den här filen med två språk i sig. Nästa språk som
 * lades till hade fått komponenten att sluta kompilera — vilket den gjorde —
 * och nästa komponent som behövde ett datum hade fått en egen kopia.
 */
const DATE_LOCALE = LOCALE_DATE_TAGS;

export function ReviewList({
  reviews,
  labels,
  locale,
}: {
  reviews: readonly PublicReview[];
  labels: Dictionary["restaurant"];
  locale: Locale;
}) {
  if (reviews.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={MessageSquareQuote}
          title={labels.reviewsEmptyTitle}
          body={labels.reviewsEmptyBody}
        />
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-4">
      {reviews.map((review) => (
        <li key={review.id} className="card p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Stars rating={review.ratingFood} label={labels.foodRating} outOf={labels.ratingOutOf} />
            <span className="text-sm text-[var(--muted)]">
              {review.authorName ?? labels.reviewAuthorFallback} ·{" "}
              <time dateTime={review.createdAt}>
                {new Date(review.createdAt).toLocaleDateString(DATE_LOCALE[locale])}
              </time>
            </span>
          </div>

          {review.ratingService !== null ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {labels.serviceRating}: {fill(labels.ratingOutOf, { n: review.ratingService })}
            </p>
          ) : null}

          {review.comment ? <p className="mt-2">{review.comment}</p> : null}

          {/* Restaurangens svar. Indraget och märkt, så att det inte går att
              förväxla med gästens egna ord. */}
          {review.response ? (
            <div className="mt-3 bg-black/5 p-3 dark:bg-white/10">
              <p className="text-sm font-medium">{labels.restaurantReply}</p>
              <p className="mt-1 text-sm">{review.response}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Betyget som fyllda stjärnor.
 *
 * Tecknet ★ dög inte: formen skiljer sig mellan typsnitt och saknar fyllnad i
 * vissa, och i Geist såg den ut som en kontur — alltså som ett OSATT betyg.
 * Samma skäl som på stadssidan, och samma guldton: betyget ska glimma, inte
 * konkurrera med handlingsfärgen.
 */
function Stars({ rating, label, outOf }: { rating: number; label: string; outOf: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${label}: ${fill(outOf, { n: rating })}`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <Star
          key={step}
          size={14}
          aria-hidden="true"
          className={
            step <= rating
              ? "fill-[var(--star)] text-[var(--star)]"
              : "fill-transparent text-[var(--rule-control)]"
          }
        />
      ))}
    </span>
  );
}
