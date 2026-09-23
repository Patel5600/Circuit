/**
 * Common Vercel Serverless Function Types
 * Decoupled from @vercel/node to guarantee 100% build compatibility across all environments.
 */

export interface VercelRequest {
  method?: string;
  body?: any;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export interface VercelResponse {
  setHeader: (name: string, value: string) => any;
  status: (code: number) => any;
  json: (data: any) => any;
  send: (body: any) => any;
  write: (chunk: any) => any;
  end: () => any;
}
