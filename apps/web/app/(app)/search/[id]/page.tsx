import type { Metadata } from "next";

import { SearchResults } from "@/components/search/search-results";
import { resolveRequestIdentity } from "@/lib/auth/identity";
import { getPersistedSearchResult } from "@/lib/search/run-persisted-search";

export const metadata: Metadata = {
  title: "Результаты поиска",
};

export default async function SearchPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conversation?: string }>;
}>) {
  const { id } = await params;
  const { conversation } = await searchParams;
  let result = null;
  if (conversation) {
    try {
      result = await getPersistedSearchResult({
        identity: await resolveRequestIdentity(),
        conversationId: conversation,
        searchJobId: id,
      });
    } catch {
      result = null;
    }
  }
  return (
    <SearchResults
      searchId={id}
      result={result}
      backHref={conversation ? `/chat/${conversation}` : "/chat"}
    />
  );
}
