import type { Metadata } from "next";

import { SmartChatExperience } from "@/components/chat/smart-chat-experience";

export const metadata: Metadata = {
  title: "AI-подбор запчастей",
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SmartChatExperience conversationId={id} />;
}
