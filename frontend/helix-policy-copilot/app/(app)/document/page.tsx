import { redirect } from "next/navigation";
import DocumentsManager from "@/components/app/DocumentsManager";
import { getSession } from "@/lib/session";

export default async function DocumentsPage() {
  const { isAdmin } = await getSession();
  if (!isAdmin) redirect("/dashboard"); // employees never see this page

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 md:py-12">
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Documents</h1>
      <p className="mt-2 text-[14.5px] text-muted">Upload the policies and guidelines Copilot answers from. Admins only.</p>
      <DocumentsManager />
    </div>
  );
}