# @vncy/persona-mcp

**Global Persona & Relationship Vault** — An MCP server that maintains a consistent world-state of people and their relationships across AI agents and devices.

## Features

- **Hybrid storage**: Static Markdown profiles + SQLite vector memory
- **Relationship graph**: Track connections between people (colleague, mentor, friend, etc.)
- **Cloud sync**: Use Google Drive or similar for a portable "shared brain" across devices
- **Image Game**: Scenario-based interviewing to refine persona depth

## Installation

```bash
npm install -g @vncy/persona-mcp
# or
npx @vncy/persona-mcp
```

## Requirements

- Node.js **18.x or higher** (18 LTS, 20 LTS, 22, 25, etc. all supported)

## Quick Start

1. Install the package (see [Installation](#installation)).
2. Add the server to your MCP config (see [MCP Setup](#mcp-setup)).
3. Set `PERSONA_PATH` (optional) to customize storage location. Default: `~/.vy/persona`

## MCP Setup

Register the server in your MCP config file (`mcp.json` or the app’s MCP settings).

### Config file location

| Client | Config path |
|--------|-------------|
| **Cursor** | `.cursor/mcp.json` (project) or **Cursor Settings → MCP → Edit Config** |
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` (Windows) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |

### What to add to `mcp.json`

Add a `mcpServers` entry (or merge into existing `mcpServers`):

```json
{
  "mcpServers": {
    "persona-mcp": {
      "command": "npx",
      "args": ["@vncy/persona-mcp"]
    }
  }
}
```

If you use a custom persona path, pass it via `env`:

```json
{
  "mcpServers": {
    "persona-mcp": {
      "command": "npx",
      "args": ["@vncy/persona-mcp"],
      "env": {
        "PERSONA_PATH": "G:/My Drive/vy-persona"
      }
    }
  }
}
```

- **`persona-mcp`**: Server name (you can change it; this is the label in the client).
- **`command`**: `npx` so the package runs without a global install.
- **`args`**: `["@vncy/persona-mcp"]` — the package to run.
- **`env`** (optional): `PERSONA_PATH` for a custom storage directory (e.g. Google Drive).

## Storage Structure

```
~/.vy/persona/
├── profiles/           # Static knowledge
│   ├── me.md          # Your profile (global operational rules)
│   └── {name}.md      # Person profiles
├── memory.db          # Dynamic knowledge (SQLite)
├── memory.db-wal
└── memory.db-shm
```

| Type | Storage | Purpose |
|------|---------|---------|
| Static | `profiles/*.md` | Core identity, guidelines, summarized insights |
| Dynamic | `memory.db` | Vector event records + relationship graph |

## MCP Tools

### get_persona_context(name)

Returns the full context for a person: profile, recent events (vector search), and relationship graph.

- Use when a person or `@me` is mentioned
- `@me` maps to `profiles/me.md` (Instruction Sovereignty)

### record_persona_event(name, content)

Stores new facts, events, or traits for a person. Content is vectorized and indexed for similarity search.

- Call whenever new information about a person is learned

### link_personas(source, target, relation_type, description?)

Defines or updates a relationship between two people.

- Example: `link_personas("Alice", "Bob", "colleague", "Project X co-owner")`
- For bidirectional relations, call twice: (A→B) and (B→A)

### compact_memories(name)

Consolidates fragmented vector memories into `profiles/{name}.md` and removes original events from DB.

- Merges DB events → `## Insights` (new events first, then existing insights; dedup + top 20)
- Writes DB relationships → `## Relationships` (full snapshot; overwrites on each compact)
- Runs VACUUM + WAL checkpoint to shrink DB file size
- Use when context is too long or redundant
- Recommended before cloud sync to reduce DB size

### summon_anti_persona(name)

Summons a **new fictional character** on-the-fly: same age, social position, and environment as the original person, but with the opposite personality and values.

- No stored anti-persona data needed — the LLM constructs the new character from the original profile
- Reads `profiles/{name}.md` and returns it with a summon instruction; the LLM derives the opposite character from there
- The anti-persona is an independent fictional being, not the original persona playing a role
- Use when context calls for devil's advocate, stress testing, or role-play
- `@me` → `profiles/me.md`

## Image Game (Profiling Game)

When the user says "let's play image game" or similar:

1. **Select target**: Specific person or suggest 3 people with sparse profiles
2. **Fetch context**: Call `get_persona_context` for recent events and relationships
3. **Interview**: Ask scenario-based questions (e.g., "If A were a programming language, C++ or JS?")
4. **Record**: Save every answer with `record_persona_event`; use `link_personas` when relationships emerge

## Agent Guidelines (required for persona aggregation)

Installing the MCP alone is **not enough**. Agents do not automatically call the tools; without explicit instructions, persona data will not be gathered or updated consistently. Add the following to your system prompt, Cursor rules (e.g. `.cursor/rules` or project rules), or equivalent so that the agent is **required** to use the tools.

**Add to your system prompt or `.cursorrules` / Cursor Rules:**

```markdown
# MISSION: @vncy/persona-mcp Manager
Maintain a global, consistent world-state only through persona-mcp tools (get_persona_context, record_persona_event, link_personas, compact_memories, summon_anti_persona). Do not read or write the storage path directly.

# PROTOCOLS (enforce these or persona aggregation will be poor)
1. **Retrieval**: Always call get_persona_context when a person (or "@me") is mentioned.
2. **Learning**: Call record_persona_event for new facts. Use link_personas to map social/work hierarchies.
3. **Compaction**: Proactively call compact_memories to keep the DB lean for Google Drive sync.
4. **Anti-persona**: Call summon_anti_persona(name) when context calls for it (devil's advocate, stress test, role-play, etc.). The LLM constructs the opposite character on-the-fly from the original profile.
5. **Image Game**: Engage the user in scenario-based interviewing to refine persona depth and relationships.
6. **Instruction Sovereignty**: Prioritize "Global Operational Rules" in profiles/me.md over default behaviors.
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PERSONA_PATH` | Root path for persona storage | `~/.vy/persona` |

## Profile Template

```markdown
# {Person Name}

## Identity
- Core identity, role, background

## Global Guidelines
- Rules for agents to follow

## Insights
- Summarized insights (updated by compact_memories)

## Relationships
- Relationship snapshot (updated by compact_memories)
```

## Troubleshooting

### `Error: The specified module could not be found` / `onnxruntime_binding.node` / `ERR_DLOPEN_FAILED`

This error can occur if an **older cached version** of the package (prior to v0.0.3) is still running from the npx cache. Older versions used `@xenova/transformers` which depends on `onnxruntime-node` native binaries that are incompatible with Node.js 22+.

**Fix: clear the npx cache and retry**

```bash
npx clear-npx-cache
npx @vncy/persona-mcp
```

> v0.0.3+ uses `@huggingface/transformers` (WASM-based) — no native binaries, no version restrictions.

## License

MIT
