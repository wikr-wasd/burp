import type { Metadata } from "next";
import { StaffHeader } from "@/components/staff/staff-header";
import { ReviewResponder } from "@/components/staff/review-responder";
import { requireStaff } from "@/lib/auth";
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

  return (
    <>
      <StaffHeader staff={staff} current="dashboard" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Omdömen</h1>
        <p className="mt-1 text-sm opacity-70">
          Betyg kan bara lämnas av gäster som genomfört en beställning. Du kan svara offentligt,
          men inte ändra betyget eller texten.
        </p>

        {reviews.length === 0 ? (
          <p className="mt-8 rounded-xl border border-black/10 p-6 opacity-70 dark:border-white/15">
            Inga omdömen än. De kommer när gäster börjat beställa och deras order slutförts.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Stat label="Omdömen" value={String(reviews.length)} />
              <Stat
                label="Obesvarade"
                value={String(unanswered.length)}
                hint={unanswered.length > 0 ? "ett svar visas publikt" : undefined}
              />
              <Stat
                label={`${LOW_RATING_THRESHOLD} eller lägre`}
                value={String(low.length)}
                hint={low.length > 0 ? "värt att titta på" : undefined}
              />
            </div>

            <ul className="mt-8 space-y-4">
              {reviews.map((review) => (
                <ReviewResponder key={review.id} review={review} />
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-sm opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs opacity-50">{hint}</p> : null}
    </div>
  );
}
