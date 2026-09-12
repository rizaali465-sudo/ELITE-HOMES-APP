export type GlideRow = Record<string, unknown>;

export interface GlideTable {
  id: string;
  name: string;
}

export interface GlideClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class GlideApiError extends Error {
  readonly status: number;
  readonly type?: string;

  constructor(status: number, message: string, type?: string) {
    super(`Glide API request failed (${status}): ${message}`);
    this.name = "GlideApiError";
    this.status = status;
    this.type = type;
  }
}

interface GlideErrorResponse {
  error?: {
    type?: string;
    message?: string;
  };
}

interface GlideListResponse<T> {
  data: T;
}

interface GlideAddRowsResponse {
  data: {
    rowIDs: string[];
  };
}

export class GlideClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly request: typeof globalThis.fetch;

  constructor(options: GlideClientOptions) {
    if (!options.token.trim()) {
      throw new Error("A Glide API token is required.");
    }

    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://api.glideapps.com").replace(/\/+$/, "");
    this.request = options.fetch ?? globalThis.fetch;
  }

  listTables(): Promise<GlideTable[]> {
    return this.call<GlideListResponse<GlideTable[]>>("/tables");
  }

  getRows<T extends GlideRow = GlideRow>(tableId: string): Promise<T[]> {
    return this.call<GlideListResponse<T[]>>(`/tables/${encodeURIComponent(tableId)}/rows`);
  }

  addRows(tableId: string, rows: GlideRow[], onSchemaError: "abort" | "dropColumns" | "updateSchema" = "abort"): Promise<string[]> {
    if (rows.length === 0) {
      throw new Error("At least one row is required.");
    }

    return this.call<GlideAddRowsResponse>(
      `/tables/${encodeURIComponent(tableId)}/rows?onSchemaError=${onSchemaError}`,
      { method: "POST", body: JSON.stringify(rows) },
    ).then((response) => response.data.rowIDs);
  }

  updateRow(
    tableId: string,
    rowId: string,
    row: GlideRow,
    options: { ifMatch?: string; onSchemaError?: "abort" | "dropColumns" | "updateSchema" } = {},
  ): Promise<void> {
    const query = options.onSchemaError ? `?onSchemaError=${options.onSchemaError}` : "";
    const headers = options.ifMatch ? { "if-match": options.ifMatch } : undefined;

    return this.call<void>(
      `/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}${query}`,
      { method: "PATCH", body: JSON.stringify(row), headers },
    ).then(() => undefined);
  }

  deleteRow(tableId: string, rowId: string): Promise<void> {
    return this.call<void>(
      `/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`,
      { method: "DELETE" },
    ).then(() => undefined);
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      let error: GlideErrorResponse = {};
      try {
        error = (await response.json()) as GlideErrorResponse;
      } catch {
        // Preserve the HTTP status when Glide does not return JSON.
      }
      throw new GlideApiError(
        response.status,
        error.error?.message ?? (response.statusText || "Unknown error"),
        error.error?.type,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
