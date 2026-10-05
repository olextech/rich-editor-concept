import type { PageSettings } from "./index.js";

export interface TemplateDraft {
  name: string;
  html: string;
  pageSettings: PageSettings;
}

export interface TemplateSummary {
  id: number;
  name: string;
  pageSettings: PageSettings;
  updatedAt: string;
}

export interface SavedTemplate extends TemplateSummary {
  html: string;
  createdAt: string;
}

export interface PdfRequest {
  templateId: number;
  documentId: string;
}

export interface TemplateClientOptions {
  /** Backend URL without a trailing slash. Defaults to "/api". */
  baseUrl?: string;
  /** Uses globalThis.fetch at request time when omitted. */
  fetch?: typeof globalThis.fetch;
  /** A function can obtain current authentication headers for each request. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /** Defaults to "same-origin". */
  credentials?: RequestCredentials;
}

export interface TemplateClient {
  list(signal?: AbortSignal): Promise<TemplateSummary[]>;
  get(id: number, signal?: AbortSignal): Promise<SavedTemplate>;
  save(
    id: number | null | undefined,
    body: TemplateDraft,
    signal?: AbortSignal,
  ): Promise<SavedTemplate>;
  delete(id: number, signal?: AbortSignal): Promise<null>;
  /** Sends only IDs; the backend loads saved template and document data. */
  render(input: PdfRequest, signal?: AbortSignal): Promise<Blob>;
}

export declare function createTemplateClient(
  options?: TemplateClientOptions,
): TemplateClient;

/** Browser-only output helper. */
export declare function downloadPdf(blob: Blob, name?: string): void;

/** Requests the native browser print dialog. Resolves after requesting it. */
export declare function printPdf(blob: Blob): Promise<void>;
