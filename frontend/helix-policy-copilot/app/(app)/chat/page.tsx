import { Suspense } from "react";
import ChatPanel from "@/components/app/Chatpanel";

export default function ChatPage() {
  return <Suspense><ChatPanel /></Suspense>;
}