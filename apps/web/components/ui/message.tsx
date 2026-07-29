import type { HTMLAttributes } from "react";

type MessageProps = HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "end";
};

export function Message({
  align = "start",
  className = "",
  ...props
}: MessageProps) {
  return (
    <div className={`ui-message ui-message-${align} ${className}`} {...props} />
  );
}

export function MessageContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-message-content ${className}`} {...props} />;
}

export function MessageFooter({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-message-footer ${className}`} {...props} />;
}
