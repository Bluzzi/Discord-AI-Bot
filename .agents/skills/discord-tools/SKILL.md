---
name: discord-tools
description: MUST be loaded before adding, changing, or reviewing a Discord tool, its permission checks, or its approval flow. Covers tool schemas, requester permissions, message exceptions, and approval-time rechecks.
---

# Discord tools

Discord tools use shared permission rules to determine tool availability and authorize actions on the requester's behalf. Changes to Discord resources other than messages require the requester's approval before execution.

## Tool permissions

Keep each tool's input schema in [src/tools/discord.ts](../../../src/tools/discord.ts) aligned with its rule in [src/integrations/discord.helper-permissions.ts](../../../src/integrations/discord.helper-permissions.ts). Use the shared rules both to filter tools offered to the model and to check the original requester's effective permissions on the actual targets. Check the relevant server, channel or thread, and role or member hierarchy where applicable.

## Message operations

Only `sendReply` and `sendMessage` may bypass requester permission checks when responding in the channel that triggered the current run, including when attaching files. `sendReply` must target the triggering message. `sendMessage` to another channel requires the requester's effective permissions there. Run-scoped attachment references may only be used in the originating channel.

Message operations are exempt from mandatory approval and still follow the applicable Discord permission and conversation checks.

## Approval flow

1. Route operations that create, modify, or delete resources other than messages through [`proposeDiscordActions`](../../../src/tools/discord-approval.ts). Validate the exact inputs and the requester's permissions before presenting the plan.
2. Wait for the original requester to click **Approve** on the pending request.
3. In the [interaction handler](../../../src/triggers/interaction-create.djs-event.ts), fetch the requester's current membership and recheck permissions for each action before executing it. Reject any action that fails the check.

## Constraints

- MUST enforce the original requester's effective permissions except for the message exceptions above. NEVER use the bot's permissions to authorize an action on the requester's behalf.
- MUST obtain the original requester's approval and recheck permissions before executing each action that requires approval.
