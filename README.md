# DriveUp Smart Assistant

Standalone AI chatbot that answers DriveUp questions from the monorepo's
[`docs/kb`](../docs/kb) knowledge base. It is a self-contained service — no code
is integrated into `driveup-api` or any other DriveUp app.

## How it works

1. **Indexing** (`pnpm index:kb`): walks `../docs/kb`, splits the knowledge base
   into chunks (one per Gherkin scenario, markdown heading section, or manual
   step), embeds them locally with `all-MiniLM-L6-v2` (via `@xenova/transformers`,
   offline, no embeddings API), and caches the result in `data/kb-index.json`.
2. **Query** (`POST /chatbot/query`): embeds the user's question, finds the
   top-k chunks by cosine similarity in memory, and asks DeepSeek (OpenAI-compatible
   API) to answer strictly from those excerpts, citing source file paths and
   replying in the language of the question.
3. **Conversation memory**: pass a `conversationId` to keep a conversation
   context. The server remembers the recent Q&A turns, feeds them to the model,
   and also uses them to build a contextual retrieval query so follow-ups like
   "and in that role?" still find the right knowledge. A new id is returned when
   none is provided. Memory is in-process (cleared on restart).
4. **UI**: a single-page chat UI is served at `GET /chatbot` (and `/`). It keeps
   the `conversationId` in `localStorage` so the conversation survives reloads.

## Usage

```bash
cp .env.example .env   # then fill in DEEPSEEK_API_KEY
pnpm install
pnpm index:kb          # rebuild the embeddings index (run after docs/kb changes)
pnpm start             # http://localhost:3001
```

Try it:

```bash
curl -X POST http://localhost:3001/chatbot/query \
  -H "Content-Type: application/json" \
  -d '{"question":"How does company onboarding work?"}'
```

Follow-up questions on the same conversation:

```bash
curl -X POST http://localhost:3001/chatbot/query \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"<id-from-first-response>","question":"and what about German?"}'
```

The `/chatbot/query` endpoint is public and JSON-based, so it can also be reused
by `driveup-admin` or `driveup-mobile`.

## Configuration

| Variable            | Default                   | Description                         |
| ------------------- | ------------------------- | ----------------------------------- |
| `PORT`              | `3001`                    | HTTP port                           |
| `KB_PATH`           | `../docs/kb`              | Knowledge base location             |
| `KB_INDEX_PATH`     | `data/kb-index.json`      | Cached embeddings index             |
| `TOP_K`             | `8`                       | Retrieved chunks per query          |
| `MAX_TOKENS`        | `1024`                    | Base max completion tokens (English). Scaled up per language: German ×1.3, French ×1.2, Italian ×1.2 |
| `CONVERSATION_MAX_MESSAGES` | `12`              | Max Q&A turns kept per conversation |
| `CONVERSATION_TTL_MINUTES`  | `60`              | Minutes of inactivity before a conversation is dropped |
| `CONVERSATION_CONTEXT_QUERIES` | `3`            | Recent user turns used for the contextual retrieval query |
| `DEEPSEEK_API_KEY`  | —                         | DeepSeek API key (required)         |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com`| OpenAI-compatible base URL          |
| `DEEPSEEK_MODEL`    | `deepseek-chat`           | Model id                            |

## Scripts

- `pnpm dev` — run with hot reload (`tsx watch`)
- `pnpm build` / `pnpm start` — compile and run (`node dist/src/server.js`)
- `pnpm index:kb` — rebuild the embeddings index
- `pnpm typecheck` — type-check without emitting