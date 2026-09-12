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

export interface GlideGetRowsOptions {
  limit?: number;
  offset?: number;
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
    return this.call<GlideListResponse<GlideTable[]>>("/tables").then(
      (response) => response.data,
    );
  }

  getRows<T extends GlideRow = GlideRow>(
    tableId: string,
    options: GlideGetRowsOptions = {},
  ): Promise<T[]> {
    const query = this.rowsQuery(options);
    return this.call<GlideListResponse<T[]>>(
      `/tables/${encodeURIComponent(tableId)}/rows${query}`,
    ).then((response) => response.data);
  }

  addRows(
    tableId: string,
    rows: GlideRow[],
    onSchemaError: "abort" | "dropColumns" | "updateSchema" = "abort",
  ): Promise<string[]> {
    if (rows.length === 0) {
      throw new Error("At least one row is required.");
    }

    const query = new URLSearchParams({ onSchemaError });
    return this.call<GlideAddRowsResponse>(
      `/tables/${encodeURIComponent(tableId)}/rows?${query}`,
      { method: "POST", body: JSON.stringify(rows) },
    ).then((response) => response.data.rowIDs);
  }

  updateRow(
    tableId: string,
    rowId: string,
    row: GlideRow,
    options: { ifMatch?: string; onSchemaError?: "abort" | "dropColumns" | "updateSchema" } = {},
  ): Promise<void> {
    const query = options.onSchemaError
      ? `?${new URLSearchParams({ onSchemaError: options.onSchemaError })}`
      : "";
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
    const authorization = ["Bearer", this.token].join(" ");
    const response = await this.request(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: authorization,
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

  private rowsQuery(options: GlideGetRowsOptions): string {
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
      throw new Error("The row limit must be a positive integer.");
    }
    if (options.offset !== undefined && (!Number.isInteger(options.offset) || options.offset < 0)) {
      throw new Error("The row offset must be a non-negative integer.");
    }

    const query = new URLSearchParams();
    if (options.limit !== undefined) {
      query.set("limit", String(options.limit));
    }
    if (options.offset !== undefined) {
      query.set("offset", String(options.offset));
    }

    const serialized = query.toString();
    return serialized ? `?${serialized}` : "";
  }
}
