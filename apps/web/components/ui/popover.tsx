"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentProps, ReactNode } from "react";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;
export const PopoverTitle = BasePopover.Title;
export const PopoverDescription = BasePopover.Description;

type PopoverContentProps = ComponentProps<typeof BasePopover.Popup> & {
  children: ReactNode;
  side?: ComponentProps<typeof BasePopover.Positioner>["side"];
  align?: ComponentProps<typeof BasePopover.Positioner>["align"];
  sideOffset?: number;
};

export function PopoverContent({
  align = "start",
  children,
  className = "",
  side = "top",
  sideOffset = 10,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        align={align}
        className="ui-popover-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <BasePopover.Popup
          className={`ui-popover-content ${className}`}
          {...props}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
