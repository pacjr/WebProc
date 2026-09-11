import { corsHeaders } from './cors.ts';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(
      { success: false, error: error.message, code: error.code ?? null },
      error.status,
    );
  }

  const message = error instanceof Error ? error.message : 'Internal error';
  console.error('Unhandled edge error:', message);
  return jsonResponse({ success: false, error: message }, 500);
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError('Invalid JSON body', 400, 'invalid_body');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError('Invalid JSON body', 400, 'invalid_body');
  }
}

export function rejectForbiddenClientFields(
  body: Record<string, unknown>,
  forbidden: string[],
): void {
  for (const field of forbidden) {
    if (field in body) {
      throw new HttpError(
        `Client-supplied field not allowed: ${field}`,
        400,
        'forbidden_field',
      );
    }
  }
}
