import { cookies } from "next/headers";
import { Home } from "@/components/home";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [jar, query] = await Promise.all([cookies(), searchParams]);
  const layout = jar.get("igor-layout")?.value;

  return (
    <Home
      initialPage={
        query.view === "saved"
          ? "saved"
          : query.view === "conversations"
            ? "history"
            : "work"
      }
      initialConversation={!!query.task || layout?.startsWith("conversation:")}
      initialPane={query.view === "editor" ? "work" : "thread"}
      initialHasResult={layout === "conversation:result"}
    />
  );
}
