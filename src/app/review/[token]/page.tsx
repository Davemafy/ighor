import { ReviewWorkspace } from "@/components/review-workspace";

export const metadata = {
  title: "Review an Igor outcome",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <ReviewWorkspace token={token} />;
}
