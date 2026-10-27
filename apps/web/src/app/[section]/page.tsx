import { notFound } from "next/navigation";
import { CamerasScreen } from "@/components/screens/cameras-screen";
import { EventsScreen } from "@/components/screens/events-screen";
import { ExploreScreen } from "@/components/screens/explore-screen";
import { LayoutsScreen } from "@/components/screens/layouts-screen";
import { LiveScreen } from "@/components/screens/live-screen";
import { RecordingsScreen } from "@/components/screens/recordings-screen";
import { SettingsScreen } from "@/components/screens/settings-screen";

const screens = {
  cameras: CamerasScreen,
  events: EventsScreen,
  explore: ExploreScreen,
  layouts: LayoutsScreen,
  live: LiveScreen,
  recordings: RecordingsScreen,
  settings: SettingsScreen,
};
export async function generateStaticParams() {
  return Object.keys(screens).map((section) => ({ section }));
}
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!(section in screens)) notFound();
  const Screen = screens[section as keyof typeof screens];
  return <Screen />;
}
