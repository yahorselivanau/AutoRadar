"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof BaseButton> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
};

export function Button({
  className = "",
  variant = "secondary",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      className={`ui-button ui-button-${variant} ui-button-${size} pressable ${className}`}
      {...props}
    />
  );
}
