import type { CSSProperties, ReactElement, ReactNode } from "react";

export type PageSize = "A4" | "A5";
export type PageOrientation = "portrait" | "landscape";

/** Margins in whole, non-negative millimetres. */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSettings {
  pageSize: PageSize;
  orientation: PageOrientation;
  margins: PageMargins;
}

/** Placeholder strings are inserted as text, for example "{Customer Name}". */
export interface VariableGroup {
  id: string;
  label: string;
  description?: string;
  variables: readonly string[];
}

export interface EditorState {
  /** True after initialization and layout finish. Inspect error before saving. */
  isReady: boolean;
  /** Empty when no editor or layout error is present. */
  error: string;
  /** Number of sheets in the current editing layout. */
  pageCount: number;
}

export interface DocumentEditorProps {
  /** Supply a key appropriate for the embedding application's CKEditor license. */
  licenseKey: string;
  /** Change this key to load another document or a new external revision. */
  documentKey?: string | number;
  /** Initial session content; changes are applied only when documentKey changes. */
  initialHtml?: string;
  /** Reactive page geometry. Defaults to A4 portrait with 20 mm margins. */
  pageSettings?: PageSettings;
  /** Receives canonical HTML, including any normalization during initialization. */
  onChange?: (html: string) => void;
  /** Receives initialization, layout, and error state. */
  onStateChange?: (state: EditorState) => void;
  /** An omitted or empty list hides the variables panel. */
  variableGroups?: readonly VariableGroup[];
  /** Optional tooltips only; these values do not replace document placeholders. */
  variableValues?: Readonly<Record<string, string>>;
  /** Reactive edit lock. The host owns application permissions. */
  readOnly?: boolean;
  /** Optional host controls displayed above the workspace. */
  renderHeader?: (state: EditorState) => ReactNode;
  /** Optional host status or error content displayed below the header. */
  message?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Accessible name for this editor instance. */
  ariaLabel?: string;
}

export declare function DocumentEditor(
  props: DocumentEditorProps,
): ReactElement;

export declare const DEFAULT_PAGE_SETTINGS: PageSettings;

/** Returns settings or throws when paper, orientation, or margins are invalid. */
export declare function validatePageSettings(
  settings: PageSettings,
): PageSettings;
