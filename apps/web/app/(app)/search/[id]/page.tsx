import type { Metadata } from "next";

import { SearchResults } from "@/components/search/search-results";

export const metadata: Metadata = {
  title: "Результаты поиска",
};

export default async function SearchPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <SearchResults searchId={id} />;
}
