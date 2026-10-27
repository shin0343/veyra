import { notFound } from "next/navigation";
import { uuidPattern } from "@/lib/navigation";
import { RecordingsScreen } from "@/components/screens/recordings-screen";
export default async function RecordingPage({
  params,
}: {
  params: Promise<{ recordingId: string }>;
}) {
  const { recordingId } = await params;
  if (!uuidPattern.test(recordingId)) notFound();
  return <RecordingsScreen key={recordingId} recordingId={recordingId} />;
}
