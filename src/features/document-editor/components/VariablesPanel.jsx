import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function VariablesPanel({
  variableGroups,
  onInsertVariable,
  variableValues = {},
  disabled = false,
}) {
  const [openGroupId, setOpenGroupId] = useState(variableGroups[0]?.id ?? "");

  return (
    <aside
      className="variables-panel w-72 shrink-0 overflow-y-auto border-l border-border bg-background p-4"
      aria-label="Template variables"
    >
      <div className="rounded-lg border border-[#eeeeef] bg-background">
        {variableGroups.map((group, index) => {
          const isOpen = group.id === openGroupId;

          return (
            <section
              key={group.id}
              className={index > 0 ? "border-t border-[#eeeeef]" : ""}
            >
              <button
                type="button"
                className="flex h-[42px] w-full items-center gap-2 px-4 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpenGroupId(isOpen ? "" : group.id)}
              >
                <span className="min-w-0 flex-1 text-sm font-medium leading-[21px] text-[#282e33]">
                  {group.label}
                </span>
                <ChevronDown
                  className={`size-3 shrink-0 text-[#939699] transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen ? (
                <div className="px-4 pb-4 pt-1">
                  {group.description ? (
                    <p className="mb-3 text-xs leading-5 text-muted-foreground">
                      {group.description}
                    </p>
                  ) : null}
                  <div className="flex flex-col items-start gap-1 overflow-hidden text-[13px] leading-[18px]">
                    {group.variables.map((variable) => (
                      <button
                        key={variable}
                        disabled={disabled}
                        type="button"
                        className="w-full truncate text-left text-[#1973e1] hover:underline"
                        title={
                          variableValues[variable]
                            ? `Sample value: ${variableValues[variable]}`
                            : undefined
                        }
                        onClick={() => onInsertVariable(variable)}
                      >
                        {variable}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
