import type { HTMLAttributes } from "react";

type MarkerProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "border" | "separator";
};

export function Marker({
  className = "",
  variant = "default",
  ...props
}: MarkerProps) {
  return (
    <div className={`ui-marker ui-marker-${variant} ${className}`} {...props} />
  );
}

export function MarkerIcon({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={`ui-marker-icon ${className}`}
      {...props}
    />
  );
}

export function MarkerContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`ui-marker-content ${className}`} {...props} />;
}
