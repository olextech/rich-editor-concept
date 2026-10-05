import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuContent = React.forwardRef(function DropdownMenuContent(
  { className, sideOffset = 4, container, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "papercraft-editor-portal z-50 min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

const DropdownMenuItem = React.forwardRef(function DropdownMenuItem(
  { className, inset, variant = "default", ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      data-variant={variant}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg:not([class*='size-'])]:size-4",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
});

const DropdownMenuLabel = React.forwardRef(function DropdownMenuLabel(
  { className, inset, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
});

const DropdownMenuCheckboxItem = React.forwardRef(
  function DropdownMenuCheckboxItem(
    { className, children, checked, ...props },
    ref,
  ) {
    return (
      <DropdownMenuPrimitive.CheckboxItem
        ref={ref}
        checked={checked}
        className={cn(
          "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none transition-colors",
          "focus:bg-accent focus:text-accent-foreground",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          "[&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      >
        {children}
        <span className="absolute right-2 flex size-4 items-center justify-center">
          <DropdownMenuPrimitive.ItemIndicator>
            <CheckIcon />
          </DropdownMenuPrimitive.ItemIndicator>
        </span>
      </DropdownMenuPrimitive.CheckboxItem>
    );
  },
);

const DropdownMenuSeparator = React.forwardRef(function DropdownMenuSeparator(
  { className, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
});

const DropdownMenuShortcut = ({ className, ...props }) => (
  <span
    className={cn(
      "ml-auto text-xs tracking-widest text-muted-foreground",
      className,
    )}
    {...props}
  />
);

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
};
