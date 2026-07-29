"use client";

import { MessageScroller as Primitive } from "@shadcn/react/message-scroller";
import { ArrowDown } from "lucide-react";
import type { ComponentProps } from "react";

export const MessageScrollerProvider = Primitive.Provider;

export function MessageScroller({
  className = "",
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root className={`ui-message-scroller ${className}`} {...props} />
  );
}

export function MessageScrollerViewport({
  className = "",
  ...props
}: ComponentProps<typeof Primitive.Viewport>) {
  return (
    <Primitive.Viewport
      className={`ui-message-scroller-viewport ${className}`}
      {...props}
    />
  );
}

export function MessageScrollerContent({
  className = "",
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={`ui-message-scroller-content ${className}`}
      {...props}
    />
  );
}

export function MessageScrollerItem({
  className = "",
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={`ui-message-scroller-item ${className}`}
      {...props}
    />
  );
}

export function MessageScrollerButton() {
  return (
    <Primitive.Button
      aria-label="Перейти к последнему сообщению"
      className="ui-message-scroller-button pressable"
      direction="end"
    >
      <ArrowDown size={18} />
    </Primitive.Button>
  );
}
