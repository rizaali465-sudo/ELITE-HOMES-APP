# ELITE-HOMES-APP

## Glide API connector

This repository includes a server-side TypeScript client for Glide API v2. Glide API
tokens are team-wide secrets, so the client must only be used from a server or
serverless function. Never expose `GLIDE_API_TOKEN` in browser code or commit it to
source control.

### Setup

```bash
npm install
```

Create a `.env` file or configure the environment in your deployment platform:

```text
GLIDE_API_TOKEN=your-token-from-the-glide-data-editor
```

The API only supports Glide **Big Tables**. Example usage:

```ts
import { GlideClient } from "./src/glide-client.js";

const glide = new GlideClient({
  token: process.env.GLIDE_API_TOKEN!,
});

const tables = await glide.listTables();
const rowIds = await glide.addRows("your-table-id", [
  { propertyName: "Harbor View", status: "available" },
]);
await glide.updateRow("your-table-id", rowIds[0], { status: "reserved" });
```

`listTables`, `getRows`, `addRows`, `updateRow`, and `deleteRow` map directly to
Glide API v2 endpoints. `GlideApiError` preserves the HTTP status and Glide error
type for application-level handling.