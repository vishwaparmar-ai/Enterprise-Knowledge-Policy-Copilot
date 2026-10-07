import { redirect } from "next/navigation";
import DocumentsManager from "@/components/app/DocumentsManager";
import { getSession } from "@/lib/session";

export default async function DocumentsPage() {
  const { isAdmin } = await getSession();
  if (!isAdmin) redirect("/dashboard"); // employees never see this page

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 md:py-12">
      <DocumentsManager />
    </div>
  );
}