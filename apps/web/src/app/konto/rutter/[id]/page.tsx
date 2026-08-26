import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestHeader } from "@/components/guest/guest-header";
import { RouteEditor } from "@/components/guest/route-editor";
import { requireGuest } from "@/lib/guest";
import { dictionary, requestLocale } from "@/lib/i18n";
import { getRoute } from "@/lib/routes";

/**
 * En matrunda i detalj.
 *
 * `getRoute()` frågar som den inloggade, så `routes_own` (migration 0056) är
 * det som avgör om rutten finns för just den här gästen. En rutt som hör till
 * någon annan svarar därför 404 utan att koden här behöver jämföra id:n — och
 * en jämförelse i koden hade varit ett andra svar på samma fråga.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.account.routes,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RoutePage({ params }: PageProps) {
  const { id } = await params;
  const guest = await requireGuest(`/konto/rutter/${id}`);

  const route = await getRoute(id);
  if (!route) notFound();

  const locale = await requestLocale();
  const t = dictionary(locale);

  return (
    <>
      <GuestHeader
        guest={guest}
        current="rutter"
        texts={t.account}
        homeLabel={t.site.home}
      />

      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <p className="label-caps">
          <Link href="/konto/rutter" className="link">
            {t.account.routes}
          </Link>
        </p>

        <RouteEditor route={route} locale={locale} labels={t.routes} />
      </main>
    </>
  );
}
