import type { HTMLAttributes } from "react";

type BubbleProps = HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "end";
  variant?: "secondary" | "ghost" | "outline" | "destructive";
};

export function Bubble({
  align = "start",
  className = "",
  variant = "secondary",
  ...props
}: BubbleProps) {
  return (
    <div
      className={`ui-bubble ui-bubble-${variant} ui-bubble-${align} ${className}`}
      {...props}
    />
  );
}

export function BubbleContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-bubble-content ${className}`} {...props} />;
}
