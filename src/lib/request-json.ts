import { NextResponse, type NextRequest } from 'next/server';

/** Read small JSON requests without buffering arbitrarily large bodies. */
export async function readJsonRequest(request: NextRequest, headers: HeadersInit = {}) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return { error: NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415, headers }) };
  }
  const limit = 16 * 1024;
  const length = request.headers.get('content-length');
  if (length && Number(length) > limit) {
    return { error: NextResponse.json({ error: 'Request body is too large.' }, { status: 413, headers }) };
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { error: NextResponse.json({ error: 'Request body is too large.' }, { status: 413, headers }) };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { error: NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers }) };
  }
}
