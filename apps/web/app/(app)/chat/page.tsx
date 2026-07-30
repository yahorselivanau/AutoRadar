import type { Metadata } from "next";

import { SmartChatExperience } from "@/components/chat/smart-chat-experience";

export const metadata: Metadata = {
  title: "Поиск запчастей",
};

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <SmartChatExperience
      conversationId={crypto.randomUUID()}
      initialConversation
    />
  );
}
