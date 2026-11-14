// Set in vite.config.ts.
declare const __SF_AI__: {
  route: "browser" | "server";
  endpoint: string;
  model: string;
  toolsEndpoint: string;
  // Game Master tables (src/table/table.ts)
  tableEndpoint: string;
};
