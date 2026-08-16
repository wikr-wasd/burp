import type { PublicReview } from "@/lib/reviews";

/**
 * Omdömen på den publika restaurangsidan (avsnitt 7).
 *
 * Serverkomponent utan klientstate. Recensioner är det som övertygar en tveksam
 * gäst, och de behöver därför finnas i HTML:en som Google läser — inte hämtas
 * in efteråt.
 */
export function ReviewList({ reviews }: { reviews: readonly PublicReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="mt-3 text-sm opacity-60">
        Inga omdömen än. Betyg kan bara lämnas av gäster som faktiskt beställt.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-4">
      {reviews.map((review) => (
        <li key={review.id} className="card p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Stars rating={review.ratingFood} label="Betyg på maten" />
            <span className="text-sm opacity-60">
              {review.authorName ?? "Gäst"} ·{" "}
              <time dateTime={review.createdAt}>
                {new Date(review.createdAt).toLocaleDateString("sv-SE")}
              </time>
            </span>
          </div>

          {review.ratingService !== null ? (
            <p className="mt-1 text-sm opacity-60">Service: {review.ratingService} av 5</p>
          ) : null}

          {review.comment ? <p className="mt-2">{review.comment}</p> : null}

          {/* Restaurangens svar. Indraget och märkt, så att det inte går att
              förväxla med gästens egna ord. */}
          {review.response ? (
            <div className="mt-3 bg-black/5 p-3 dark:bg-white/10">
              <p className="text-sm font-medium">Svar från restaurangen</p>
              <p className="mt-1 text-sm">{review.response}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="font-medium" aria-label={`${label}: ${rating} av 5`}>
      <span aria-hidden="true" className="text-burp-600">
        {"★".repeat(rating)}
      </span>
      <span aria-hidden="true" className="opacity-25">
        {"★".repeat(5 - rating)}
      </span>
    </span>
  );
}
