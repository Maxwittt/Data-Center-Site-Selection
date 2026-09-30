import AppHeader from "@/components/AppHeader";
import SiteMap from "@/components/map/SiteMap";

export default function Home() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-950">
      <AppHeader />
      <SiteMap />
    </div>
  );
}
