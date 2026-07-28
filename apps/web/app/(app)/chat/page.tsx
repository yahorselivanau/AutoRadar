import type { Metadata } from "next";

import { ChatExperience } from "@/components/chat/chat-experience";

export const metadata: Metadata = {
  title: "Поиск запчастей",
};

export default function ChatPage() {
  return <ChatExperience />;
}
