import type { ToolSet } from "ai";
import { postgres } from "#/postgres/client";
import { tableFeatureRequest, tableFeatureRequestUpvote } from "#/postgres/schema";
import { tool } from "ai";
import dedent from "dedent";
import { asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

export const featureRequestTools: ToolSet = {
  createFeatureRequest: tool({
    description: dedent`
      Create a new feature request: a suggestion from a user to improve the bot (new capability, behavior change, idea).

      Policy:
      - Only create a feature request when a user explicitly asks for one (a new feature or improvement), never for questions, bugs or small talk
      - Before creating, call listFeatureRequests and check that no similar OPEN request already exists: if one exists, refuse to duplicate it and instead invite the user to upvote it with its ID
      - Write the title in the user's language, concise and self-contained (e.g. "Mode nuit du bot")

      Returns the created request with its ID: share this ID with the user so they can refer to it later.

      The author is automatically the first upvoter of their own request: never call upvoteFeatureRequest for them right after creation.
    `,
    inputSchema: z.object({
      userId: z.string().describe("Discord user ID of the feature request author"),
      title: z.string().min(1).max(100).describe("Short, clear summary of the requested feature"),
      description: z.string().min(1).max(2000).optional().describe("Optional details: motivation, expected behavior, examples"),
    }),
    outputSchema: z.object({
      id: z.number().describe("Feature request ID"),
      title: z.string().describe("Feature request title"),
      description: z.string().nullable().describe("Optional details, null if none"),
      status: z.enum(["open", "closed"]).describe("Current status"),
      upvoteCount: z.number().describe("Upvote count right after creation (the author is automatically the first upvoter)"),
      createdAt: z.string().describe("Creation date (ISO)"),
    }),
    execute: async ({ userId, title, description }) => {
      const row = await postgres.transaction(async (tx) => {
        const rows = await tx
          .insert(tableFeatureRequest)
          .values({
            title,
            description,
            authorUserID: userId,
          })
          .returning();

        const request = rows[0];
        if (!request) {
          throw new Error("Feature request creation failed");
        }

        // The author automatically upvotes their own request:
        await tx
          .insert(tableFeatureRequestUpvote)
          .values({
            featureRequestID: request.id,
            userID: userId,
          });

        return request;
      });

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        upvoteCount: 1,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  listFeatureRequests: tool({
    description: dedent`
      List the OPEN feature requests, sorted by number of upvotes (most popular first).

      When a user asks to see the feature requests, display the COMPLETE list in one message: every request with its ID, its title and its upvote count (e.g. "#3 - Mode nuit du bot - 5 upvotes"). Do not include descriptions in the list: show them only afterwards, if the user asks for details about a specific request.

      Also use it to check for duplicates before creating a new request, or to find valid IDs for upvotes.

      Closed requests are never included.
    `,
    inputSchema: z.object({}),
    outputSchema: z.object({
      featureRequests: z.array(z.object({
        id: z.number().describe("Feature request ID"),
        title: z.string().describe("Feature request title"),
        description: z.string().nullable().describe("Optional details, null if none"),
        upvoteCount: z.number().describe("Number of users who upvoted this request"),
        createdAt: z.string().describe("Creation date (ISO)"),
      })).describe("Open feature requests, most upvoted first (empty if none)"),
    }),
    execute: async () => {
      const rows = await postgres
        .select({
          id: tableFeatureRequest.id,
          title: tableFeatureRequest.title,
          description: tableFeatureRequest.description,
          upvoteCount: count(tableFeatureRequestUpvote.userID),
          createdAt: tableFeatureRequest.createdAt,
        })
        .from(tableFeatureRequest)
        .leftJoin(tableFeatureRequestUpvote, eq(tableFeatureRequestUpvote.featureRequestID, tableFeatureRequest.id))
        .where(eq(tableFeatureRequest.status, "open"))
        .groupBy(
          tableFeatureRequest.id,
          tableFeatureRequest.title,
          tableFeatureRequest.description,
          tableFeatureRequest.createdAt,
        )
        .orderBy(desc(count(tableFeatureRequestUpvote.userID)), asc(tableFeatureRequest.id));

      return {
        featureRequests: rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          upvoteCount: row.upvoteCount,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    },
  }),

  upvoteFeatureRequest: tool({
    description: dedent`
      Upvote an open feature request on behalf of a user, identified by its ID (get valid IDs with listFeatureRequests).

      Each user can upvote a given request at most once: attempting again fails, no way to cancel an upvote.

      Fails if the request does not exist, is closed, or was already upvoted by this user.
    `,
    inputSchema: z.object({
      featureRequestId: z.number().describe("ID of the feature request to upvote"),
      userId: z.string().describe("Discord user ID of the upvoting user"),
    }),
    outputSchema: z.object({
      featureRequestId: z.number().describe("Feature request ID"),
      upvoteCount: z.number().describe("Total number of upvotes on this request after the upvote"),
    }),
    execute: async ({ featureRequestId, userId }) => {
      const requestRows = await postgres
        .select()
        .from(tableFeatureRequest)
        .where(eq(tableFeatureRequest.id, featureRequestId))
        .limit(1);

      const request = requestRows[0];
      if (!request) {
        throw new Error(`Feature request not found: ${String(featureRequestId)}`);
      }

      if (request.status === "closed") {
        throw new Error(`Feature request ${String(featureRequestId)} is closed and can no longer be upvoted`);
      }

      const upvoteRows = await postgres
        .insert(tableFeatureRequestUpvote)
        .values({
          featureRequestID: featureRequestId,
          userID: userId,
        })
        .onConflictDoNothing({
          target: [tableFeatureRequestUpvote.featureRequestID, tableFeatureRequestUpvote.userID],
        })
        .returning();

      if (upvoteRows.length === 0) {
        throw new Error(`User ${userId} has already upvoted feature request ${String(featureRequestId)}`);
      }

      const totalRows = await postgres
        .select({ value: count() })
        .from(tableFeatureRequestUpvote)
        .where(eq(tableFeatureRequestUpvote.featureRequestID, featureRequestId));

      return {
        featureRequestId,
        upvoteCount: totalRows[0]?.value ?? 0,
      };
    },
  }),

  getFeatureRequestUpvoters: tool({
    description: dedent`
      Get the Discord user IDs of everyone who upvoted a feature request, in chronological order (first upvoter first).

      Use it when a user wants to know who upvoted a specific request, or to show the supporters of one. To display them, reference each ID with its Discord mention <@ID>: bare IDs are unreadable for humans.

      Fails if the feature request does not exist.
    `,
    inputSchema: z.object({
      featureRequestId: z.number().describe("ID of the feature request"),
    }),
    outputSchema: z.object({
      featureRequestId: z.number().describe("Feature request ID"),
      upvoterUserIds: z.array(z.string()).describe("Discord user IDs of the upvoters, oldest upvote first (empty if no upvote yet)"),
    }),
    execute: async ({ featureRequestId }) => {
      const requestRows = await postgres
        .select()
        .from(tableFeatureRequest)
        .where(eq(tableFeatureRequest.id, featureRequestId))
        .limit(1);

      if (!requestRows[0]) {
        throw new Error(`Feature request not found: ${String(featureRequestId)}`);
      }

      const rows = await postgres
        .select({ userID: tableFeatureRequestUpvote.userID })
        .from(tableFeatureRequestUpvote)
        .where(eq(tableFeatureRequestUpvote.featureRequestID, featureRequestId))
        .orderBy(asc(tableFeatureRequestUpvote.createdAt));

      return {
        featureRequestId,
        upvoterUserIds: rows.map((row) => row.userID),
      };
    },
  }),

  closeFeatureRequest: tool({
    description: dedent`
      Close a feature request by ID: use it when the requested feature has been implemented, or when it has been declined for a good reason.

      Once closed, a request no longer appears in listFeatureRequests and can no longer be upvoted.
    `,
    inputSchema: z.object({
      featureRequestId: z.number().describe("ID of the feature request to close"),
    }),
    outputSchema: z.object({
      featureRequestId: z.number().describe("Feature request ID"),
      status: z.enum(["open", "closed"]).describe("New status"),
    }),
    execute: async ({ featureRequestId }) => {
      const rows = await postgres
        .update(tableFeatureRequest)
        .set({ status: "closed" })
        .where(eq(tableFeatureRequest.id, featureRequestId))
        .returning();

      const row = rows[0];
      if (!row) {
        throw new Error(`Feature request not found: ${String(featureRequestId)}`);
      }

      return {
        featureRequestId: row.id,
        status: row.status,
      };
    },
  }),
};
