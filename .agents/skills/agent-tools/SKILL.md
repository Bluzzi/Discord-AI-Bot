---
name: agent-tools
description: MUST be loaded before adding or changing AI SDK tools in src/tools or wiring them into streamText. Covers static exports, explicit inputs and outputs, and conversation attachments in messages.
---

# Agent tools

Tools perform a single operation with explicit arguments and return a result. The model already sees the conversation and previous tool calls and results in `streamText.messages`, so it can reuse an ID, path, or other value as an argument to the next tool.

## Patterns

- Export a static object of `tool({ inputSchema, execute })` definitions from each module in `src/tools`.
- Return values that the model needs for follow-up calls. For example, return `{ sandboxId }` when creating a sandbox and accept `sandboxId` in tools that use it.
- In `getReplyContext`, put each attachment's metadata and supported inline content alongside its Discord message. The model can use that history to choose a tool and supply the arguments it needs.
- Use the existing message history if a server-side check must verify that a tool result came from this run. Apply [Discord tool permission rules](../discord-tools/SKILL.md) independently of the model's choices.

## Constraints

- NEVER export a builder, factory, or binder that constructs a tool set per request.
- NEVER add `toolsContext`, `contextSchema`, or a parallel registry to pass conversation data or previous results between tools.
- MUST keep each tool's input and output explicit. Chain operations through tool results and subsequent model calls.
