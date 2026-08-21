import type { Metadata } from "next";
import { Star } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffShell } from "@/components/staff/staff-shell";
import { ReviewResponder } from "@/components/staff/review-responder";
import { requireStaff } from "@/lib/auth";
import { dictionary } from "@/lib/i18n";
import { LOW_RATING_THRESHOLD } from "@burp/core";
import { getReviewsForStaff } from "@/lib/reviews";

/**
 * Omdömen och svar (avsnitt 7).
 *
 * Restaurangen kan svara offentligt men inte ändra betyget eller gästens text.
 * Spärren ligger i databasen; den här sidan visar bara vad som går att göra.
 */

export const metadata: Metadata = {
  title: "Omdömen",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const reviews = await getReviewsForStaff(staff.restaurantId);

  const unanswered = reviews.filter((review) => !review.response);
  const low = reviews.filter((review) => review.ratingFood <= LOW_RATING_THRESHOLD);

  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="omdomen"
      title={t.reports.reviewsTitle}
      intro={t.reports.reviewsIntro}
      width="narrow"
    >
      {reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title={t.reports.reviewsEmptyTitle}
          body={t.reports.reviewsEmptyBody}
        />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label={t.reports.reviewsTitle} value={String(reviews.length)} />
              <Stat
                label="Obesvarade"
                value={String(unanswered.length)}
                hint={unanswered.length > 0 ? "ett svar visas publikt" : undefined}
              />
              <Stat
                label={`${LOW_RATING_THRESHOLD} eller lägre`}
                value={String(low.length)}
                hint={low.length > 0 ? t.reports.reviewsWorthLooking : undefined}
              />
            </div>

            <ul className="mt-8 space-y-4">
              {reviews.map((review) => (
                <ReviewResponder key={review.id} review={review} labels={t.reports} />
              ))}
            </ul>
          </>
        )}
    </StaffShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs opacity-50">{hint}</p> : null}
    </div>
  );
}
