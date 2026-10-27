import { notFound } from "next/navigation";
import { uuidPattern } from "@/lib/navigation";
import { LiveScreen } from "@/components/screens/live-screen";
export default async function LayoutPage({
  params,
}: {
  params: Promise<{ layoutId: string }>;
}) {
  const { layoutId } = await params;
  if (!uuidPattern.test(layoutId)) notFound();
  return <LiveScreen key={layoutId} layoutId={layoutId} />;
}
