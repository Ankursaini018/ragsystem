

## Problem

The RAG chat edge function times out because it uses `stream: true` with a `TransformStream` relay pattern that hangs in the edge runtime, causing "signal is aborted without reason" errors.

## Plan

### 1. Rewrite edge function to non-streaming JSON response
**File: `supabase/functions/rag-chat/index.ts`**

- Change LLM call to `stream: false` -- this is the core fix
- Remove all `TransformStream`, `ReadableStream`, writer/reader logic
- Use `AbortController` with 20s timeout for the LLM fetch
- Return a single JSON response: `{ content, citations, confidenceScore, chunksRetrieved }`
- Keep ILIKE keyword search limited to 3 chunks, truncate to 500 chars
- Reduce `max_tokens` to 200 for faster responses
- Use `google/gemini-2.5-flash-lite` (already set -- fastest model)
- Wrap everything in try/catch so the function never crashes

### 2. Simplify client API to simple fetch
**File: `src/lib/rag-api.ts`**

- Replace `streamChat` with `sendChat(message, sessionId)` that returns `Promise<{ content, citations, confidenceScore, chunksRetrieved }>`
- Remove all SSE parsing, `ReadableStream` reader, buffer logic
- Simple `fetch` → `response.json()` with 30s timeout
- Keep error handling for 429/402

### 3. Update RAGChat component for non-streaming
**File: `src/components/RAGChat.tsx`**

- Replace `streamChat` callback pattern with `await sendChat(message, sessionId)`
- Show loading state, then display full response at once
- Remove `isStreaming` from message interface
- Keep saving messages to database after response

### Technical Details

The root cause is that edge functions cannot reliably relay SSE streams via `TransformStream`. The function boots, finds chunks, calls the LLM with streaming, but the `TransformStream` pipe hangs until the edge function times out. Switching to `stream: false` means the LLM returns a single JSON response which the edge function can immediately return to the client -- no piping needed.

Expected response time: ~2-4 seconds (DB query ~200ms + LLM non-streaming with 200 max_tokens ~2-3s).

