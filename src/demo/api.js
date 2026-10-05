import { createTemplateClient, downloadPdf } from "../editor/client.js";
export { downloadPdf };
export const templateApi = createTemplateClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "/api",
});
