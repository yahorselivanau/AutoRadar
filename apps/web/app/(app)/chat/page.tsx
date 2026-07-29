import type { Metadata } from "next";

import { ChatBootstrap } from "@/components/chat/chat-bootstrap";

export const metadata: Metadata = {
  title: "Поиск запчастей",
};

export default function ChatPage() {
  return <ChatBootstrap />;
}
