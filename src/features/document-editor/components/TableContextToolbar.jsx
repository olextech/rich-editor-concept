import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  ChevronDown,
  Columns3,
  Merge,
  MousePointer2,
  PanelLeft,
  PanelTop,
  Rows3,
  Square,
  Table2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROW_ACTIONS = [
  { command: "insertTableRowAbove", label: "Insert row above", icon: ArrowUp },
  {
    command: "insertTableRowBelow",
    label: "Insert row below",
    icon: ArrowDown,
  },
  { command: "selectTableRow", label: "Select row", icon: MousePointer2 },
  { separator: true },
  {
    command: "setTableRowHeader",
    label: "Header row",
    icon: PanelTop,
    checkbox: true,
  },
  { separator: true },
  {
    command: "removeTableRow",
    label: "Delete row",
    icon: Trash2,
    destructive: true,
  },
];
const COLUMN_ACTIONS = [
  {
    command: "insertTableColumnLeft",
    label: "Insert column left",
    icon: ArrowLeft,
  },
  {
    command: "insertTableColumnRight",
    label: "Insert column right",
    icon: ArrowRight,
  },
  { command: "selectTableColumn", label: "Select column", icon: MousePointer2 },
  { separator: true },
  {
    command: "setTableColumnHeader",
    label: "Header column",
    icon: PanelLeft,
    checkbox: true,
  },
  { separator: true },
  {
    command: "removeTableColumn",
    label: "Delete column",
    icon: Trash2,
    destructive: true,
  },
];
const MERGE_ACTIONS = [
  { command: "mergeTableCells", label: "Merge selected cells", icon: Merge },
  { separator: true },
  { command: "mergeTableCellUp", label: "Merge cell up", icon: ArrowUp },
  {
    command: "mergeTableCellRight",
    label: "Merge cell right",
    icon: ArrowRight,
  },
  { command: "mergeTableCellDown", label: "Merge cell down", icon: ArrowDown },
  { command: "mergeTableCellLeft", label: "Merge cell left", icon: ArrowLeft },
  { separator: true },
  {
    command: "splitTableCellVertically",
    label: "Split cell vertically",
    icon: BetweenVerticalStart,
  },
  {
    command: "splitTableCellHorizontally",
    label: "Split cell horizontally",
    icon: BetweenHorizontalStart,
  },
];
const COMMANDS = [
  ...[...ROW_ACTIONS, ...COLUMN_ACTIONS, ...MERGE_ACTIONS]
    .filter((action) => action.command)
    .map((action) => action.command),
  "tableWidth",
  "tableCellWidth",
];

function useCommandState(editor) {
  const subscribe = useCallback(
    (update) => {
      const commands = COMMANDS.map((name) => editor.commands.get(name));
      for (const command of commands) command.on("change", update);
      return () => {
        for (const command of commands) command.off("change", update);
      };
    },
    [editor],
  );
  const getSnapshot = useCallback(
    () =>
      JSON.stringify(
        Object.fromEntries(
          COMMANDS.map((name) => {
            const command = editor.commands.get(name);
            return [
              name,
              { enabled: command.isEnabled, checked: Boolean(command.value) },
            ];
          }),
        ),
      ),
    [editor],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => JSON.parse(snapshot), [snapshot]);
}

function TableActionMenu({
  editor,
  container,
  state,
  label,
  icon: Icon,
  actions,
}) {
  const selection = useRef(null);
  const [open, setOpen] = useState(false);
  const executed = useRef(false);
  const pendingFocus = useRef(null);
  const isOpen = useRef(false);
  useEffect(() => () => cancelAnimationFrame(pendingFocus.current), []);
  const enabled = actions.some(
    (action) => action.command && state[action.command].enabled,
  );

  function execute(command) {
    executed.current = true;
    setOpen(false);
    isOpen.current = false;
    if (selection.current) {
      editor.model.change((writer) => writer.setSelection(selection.current));
    }
    editor.execute(command);
    // Pagination renders the changed table on the next frame. Focus the cell
    // after that render, unless the user has already opened another menu.
    pendingFocus.current = requestAnimationFrame(() => {
      if (!isOpen.current) editor.editing.view.focus();
    });
  }

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        isOpen.current = open;
        if (open) {
          cancelAnimationFrame(pendingFocus.current);
          selection.current = editor.model.createSelection(
            editor.model.document.selection,
          );
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-table-tool
          disabled={!enabled}
          className="gap-1.5 px-2.5 data-[state=open]:bg-accent"
        >
          <Icon className="text-muted-foreground" />
          {label}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      {open ? (
        <DropdownMenuContent
          container={container}
          align="start"
          sideOffset={8}
          className="w-56"
          onCloseAutoFocus={(event) => {
            if (executed.current) {
              event.preventDefault();
              executed.current = false;
            }
          }}
        >
          <DropdownMenuLabel>
            {label === "Merge" ? "Merge and split" : `${label} actions`}
          </DropdownMenuLabel>
          {actions.map((action, index) => {
            if (action.separator) return <DropdownMenuSeparator key={index} />;
            const Item = action.checkbox
              ? DropdownMenuCheckboxItem
              : DropdownMenuItem;
            const ActionIcon = action.icon;
            return (
              <Item
                key={action.command}
                disabled={!state[action.command].enabled}
                {...(action.checkbox
                  ? { checked: state[action.command].checked }
                  : {
                      variant: action.destructive ? "destructive" : "default",
                    })}
                onSelect={() => execute(action.command)}
              >
                <ActionIcon
                  className={
                    action.destructive ? undefined : "text-muted-foreground"
                  }
                />
                {action.label}
              </Item>
            );
          })}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}

export function TableContextToolbar({ editor, container }) {
  const state = useCommandState(editor);

  useLayoutEffect(() => {
    // React fills the CKEditor view after its first position is calculated.
    editor.ui.update();
  }, [editor]);

  function navigate(event) {
    if (event.target.closest("[role=menu]")) {
      event.stopPropagation();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll("[data-table-tool]:not(:disabled)"),
    );
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next].focus();
  }

  return (
    <div
      className="flex max-w-[calc(100vw-32px)] flex-wrap items-center gap-1 rounded-lg bg-popover p-1.5 font-sans text-sm text-popover-foreground"
      onKeyDown={navigate}
    >
      <div className="flex items-center gap-0.5">
        <TableActionMenu
          editor={editor}
          container={container}
          state={state}
          label="Row"
          icon={Rows3}
          actions={ROW_ACTIONS}
        />
        <TableActionMenu
          editor={editor}
          container={container}
          state={state}
          label="Column"
          icon={Columns3}
          actions={COLUMN_ACTIONS}
        />
        <TableActionMenu
          editor={editor}
          container={container}
          state={state}
          label="Merge"
          icon={Merge}
          actions={MERGE_ACTIONS}
        />
      </div>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-table-tool
          aria-label="Table properties"
          disabled={!state.tableWidth.enabled}
          onClick={() => editor.fire("openTablePropertiesDialog", "table")}
        >
          <Table2 className="text-muted-foreground" />
          Table
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-table-tool
          aria-label="Cell properties"
          disabled={!state.tableCellWidth.enabled}
          onClick={() => editor.fire("openTablePropertiesDialog", "cell")}
        >
          <Square className="text-muted-foreground" />
          Cell
        </Button>
      </div>
    </div>
  );
}
