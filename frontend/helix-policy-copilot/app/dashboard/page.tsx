import { LogoMark } from "@/components/ui";

export default function Dashboard() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <div className="flex justify-center"><LogoMark size={44} /></div>
        <h1 className="mt-5 text-2xl font-semibold">Helix Policy Copilot</h1>
        <p className="mt-2 text-sm text-muted">You're signed in. The dashboard and chat interface are built next.</p>
      </div>
    </main>
  );
}
