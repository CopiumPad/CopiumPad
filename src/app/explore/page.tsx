import { redirect } from "next/navigation";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string | string[] }>;
}) {
  const { symbol } = await searchParams;
  const query = new URLSearchParams({ view: "explore" });
  if (typeof symbol === "string" && symbol.trim()) {
    query.set("symbol", symbol);
  }
  redirect(`/?${query.toString()}`);
}
