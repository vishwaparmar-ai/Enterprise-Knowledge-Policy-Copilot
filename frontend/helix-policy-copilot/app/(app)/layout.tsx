import Sidebar from "@/components/app/Sidebar";
import { getSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, isAdmin } = await getSession();
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar isAdmin={isAdmin} role={role} />
      <main className="min-h-screen pt-14 md:pl-64 md:pt-0">{children}</main>
    </div>
  );
}