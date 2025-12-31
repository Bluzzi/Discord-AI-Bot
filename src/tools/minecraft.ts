import type { ToolSet } from "ai";
import { connectMinecraft, disconnectMinecraft, getMinecraftBot, isMinecraftConnected } from "#/services/minecraft";
import { tool } from "ai";
import { z } from "zod";

export const minecraftTools: ToolSet = {
  joinMinecraftServer: tool({
    description: "Connect to a Minecraft server. Can only be used from Discord.",
    inputSchema: z.object({
      host: z.string().describe("Server IP address"),
      port: z.number().default(25565).describe("Server port (default: 25565)"),
      username: z.string().default("JeanPascal").describe("Username to use (default: JeanPascal)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the connection was successful"),
      host: z.string().describe("Server host"),
      port: z.number().describe("Server port"),
      username: z.string().describe("Username used"),
    }),
    execute: async ({ host, port, username }) => {
      await connectMinecraft(host, port, username);
      return {
        success: true,
        host: host,
        port: port,
        username: username,
      };
    },
  }),

  leaveMinecraftServer: tool({
    description: "Disconnect from the current Minecraft server. Can only be used from Discord.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the disconnection was successful"),
    }),
    execute: async () => {
      if (!isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }
      disconnectMinecraft();
      return {
        success: true,
      };
    },
  }),

  getMinecraftStatus: tool({
    description: "Check if the bot is connected to a Minecraft server and get current status",
    inputSchema: z.object({}),
    outputSchema: z.object({
      connected: z.boolean().describe("Whether the bot is connected"),
      username: z.string().optional().describe("Bot username if connected"),
      health: z.number().optional().describe("Bot health if connected"),
      food: z.number().optional().describe("Bot food level if connected"),
      position: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      }).optional().describe("Bot position if connected"),
      gameMode: z.string().optional().describe("Current game mode"),
    }),
    execute: async () => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        return {
          connected: false,
        };
      }

      return {
        connected: true,
        username: bot.username,
        health: bot.health,
        food: bot.food,
        position: bot.entity.position,
        gameMode: bot.game.gameMode,
      };
    },
  }),

  minecraftChat: tool({
    description: "Send a message in the Minecraft chat",
    inputSchema: z.object({
      message: z.string().describe("Message to send in chat"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the message was sent"),
      message: z.string().describe("Message sent"),
    }),
    execute: async ({ message }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      bot.chat(message);
      return {
        success: true,
        message: message,
      };
    },
  }),

  minecraftWhisper: tool({
    description: "Send a private message to a player in Minecraft",
    inputSchema: z.object({
      player: z.string().describe("Player username to whisper to"),
      message: z.string().describe("Message to send"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the message was sent"),
      player: z.string().describe("Player whispered to"),
      message: z.string().describe("Message sent"),
    }),
    execute: async ({ player, message }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      bot.whisper(player, message);
      return {
        success: true,
        player: player,
        message: message,
      };
    },
  }),

  minecraftMove: tool({
    description: "Move the bot to specific coordinates",
    inputSchema: z.object({
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate"),
      z: z.number().describe("Z coordinate"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the movement started"),
      target: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      }).describe("Target coordinates"),
    }),
    execute: async ({ x, y, z }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const pathfinder = await import("mineflayer-pathfinder");
      const { pathfinder: pathfinderPlugin, goals } = pathfinder;

      if (!bot.pathfinder) {
        bot.loadPlugin(pathfinderPlugin);
      }

      const goal = new goals.GoalBlock(x, y, z);
      bot.pathfinder.setGoal(goal);

      return {
        success: true,
        target: { x, y, z },
      };
    },
  }),

  minecraftFollowPlayer: tool({
    description: "Follow a specific player",
    inputSchema: z.object({
      playerName: z.string().describe("Name of the player to follow"),
      distance: z.number().default(3).describe("Distance to maintain from player (default: 3)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the follow command started"),
      playerName: z.string().describe("Player being followed"),
      distance: z.number().describe("Follow distance"),
    }),
    execute: async ({ playerName, distance }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const player = bot.players[playerName];
      if (!player?.entity) {
        throw new Error(`Player ${playerName} not found or not visible`);
      }

      const pathfinder = await import("mineflayer-pathfinder");
      const { pathfinder: pathfinderPlugin, goals } = pathfinder;

      if (!bot.pathfinder) {
        bot.loadPlugin(pathfinderPlugin);
      }

      const goal = new goals.GoalFollow(player.entity, distance);
      bot.pathfinder.setGoal(goal, true);

      return {
        success: true,
        playerName: playerName,
        distance: distance,
      };
    },
  }),

  minecraftStopMoving: tool({
    description: "Stop all movement and pathfinding",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the stop command was executed"),
    }),
    execute: async () => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
      }

      bot.clearControlStates();

      return {
        success: true,
      };
    },
  }),

  minecraftLookAt: tool({
    description: "Make the bot look at specific coordinates or a player",
    inputSchema: z.object({
      x: z.number().optional().describe("X coordinate to look at"),
      y: z.number().optional().describe("Y coordinate to look at"),
      z: z.number().optional().describe("Z coordinate to look at"),
      playerName: z.string().optional().describe("Player name to look at (alternative to coordinates)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the look command was executed"),
    }),
    execute: async ({ x, y, z, playerName }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      if (playerName) {
        const player = bot.players[playerName];
        if (!player?.entity) {
          throw new Error(`Player ${playerName} not found or not visible`);
        }
        bot.lookAt(player.entity.position.offset(0, player.entity.height, 0));
      }
      else if (x !== undefined && y !== undefined && z !== undefined) {
        const Vec3 = (await import("vec3")).Vec3;
        bot.lookAt(new Vec3(x, y, z));
      }
      else {
        throw new Error("Must provide either coordinates or player name");
      }

      return {
        success: true,
      };
    },
  }),

  minecraftAttack: tool({
    description: "Attack the nearest entity or a specific player/mob",
    inputSchema: z.object({
      targetName: z.string().optional().describe("Specific target name (player or mob)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the attack was initiated"),
      target: z.string().optional().describe("Target attacked"),
    }),
    execute: async ({ targetName }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      let target;
      if (targetName) {
        const player = bot.players[targetName];
        if (player?.entity) {
          target = player.entity;
        }
        else {
          const entity = Object.values(bot.entities).find((e) => e.username === targetName || e.name === targetName,
          );
          if (!entity) {
            throw new Error(`Target ${targetName} not found`);
          }
          target = entity;
        }
      }
      else {
        target = bot.nearestEntity((entity) => entity.type === "mob" || entity.type === "player",
        );
        if (!target) {
          throw new Error("No target found nearby");
        }
      }

      bot.attack(target);

      return {
        success: true,
        target: target.username || target.name || "unknown",
      };
    },
  }),

  minecraftEquipItem: tool({
    description: "Equip an item from inventory",
    inputSchema: z.object({
      itemName: z.string().describe("Name of the item to equip"),
      destination: z.enum(["hand", "head", "torso", "legs", "feet", "off-hand"]).describe("Where to equip the item"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the item was equipped"),
      itemName: z.string().describe("Item equipped"),
      destination: z.string().describe("Where it was equipped"),
    }),
    execute: async ({ itemName, destination }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(itemName.toLowerCase()),
      );

      if (!item) {
        throw new Error(`Item ${itemName} not found in inventory`);
      }

      await bot.equip(item, destination);

      return {
        success: true,
        itemName: item.name,
        destination: destination,
      };
    },
  }),

  minecraftUnequipItem: tool({
    description: "Unequip an item from a slot",
    inputSchema: z.object({
      destination: z.enum(["hand", "head", "torso", "legs", "feet", "off-hand"]).describe("Slot to unequip from"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the item was unequipped"),
      destination: z.string().describe("Slot unequipped"),
    }),
    execute: async ({ destination }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      await bot.unequip(destination);

      return {
        success: true,
        destination: destination,
      };
    },
  }),

  minecraftGetInventory: tool({
    description: "Get the bot's current inventory",
    inputSchema: z.object({}),
    outputSchema: z.object({
      items: z.array(z.object({
        name: z.string().describe("Item name"),
        count: z.number().describe("Item count"),
        slot: z.number().describe("Inventory slot"),
      })).describe("List of items in inventory"),
      totalSlots: z.number().describe("Total inventory slots"),
    }),
    execute: async () => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const items = bot.inventory.items().map((item) => ({
        name: item.name,
        count: item.count,
        slot: item.slot,
      }));

      return {
        items: items,
        totalSlots: bot.inventory.slots.length,
      };
    },
  }),

  minecraftDropItem: tool({
    description: "Drop an item from inventory",
    inputSchema: z.object({
      itemName: z.string().describe("Name of the item to drop"),
      count: z.number().optional().describe("Number of items to drop (default: all)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the item was dropped"),
      itemName: z.string().describe("Item dropped"),
      count: z.number().describe("Number dropped"),
    }),
    execute: async ({ itemName, count }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(itemName.toLowerCase()),
      );

      if (!item) {
        throw new Error(`Item ${itemName} not found in inventory`);
      }

      const dropCount = count || item.count;
      await bot.toss(item.type, null, dropCount);

      return {
        success: true,
        itemName: item.name,
        count: dropCount,
      };
    },
  }),

  minecraftCollectBlock: tool({
    description: "Mine/collect a specific block type nearby",
    inputSchema: z.object({
      blockName: z.string().describe("Name of the block to collect"),
      count: z.number().default(1).describe("Number of blocks to collect (default: 1)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the collection started"),
      blockName: z.string().describe("Block being collected"),
      count: z.number().describe("Target count"),
    }),
    execute: async ({ blockName, count }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const mcData = await import("minecraft-data");
      const minecraftData = mcData.default(bot.version);
      const blockType = minecraftData.blocksByName[blockName];

      if (!blockType) {
        throw new Error(`Block type ${blockName} not found`);
      }

      const blocks = bot.findBlocks({
        matching: blockType.id,
        maxDistance: 64,
        count: count,
      });

      if (blocks.length === 0) {
        throw new Error(`No ${blockName} blocks found nearby`);
      }

      const collectBlock = async (position: any) => {
        const block = bot.blockAt(position);
        if (block) {
          await bot.dig(block);
        }
      };

      for (const blockPos of blocks) {
        await collectBlock(blockPos);
      }

      return {
        success: true,
        blockName: blockName,
        count: blocks.length,
      };
    },
  }),

  minecraftPlaceBlock: tool({
    description: "Place a block from inventory",
    inputSchema: z.object({
      blockName: z.string().describe("Name of the block to place"),
      x: z.number().describe("X coordinate where to place"),
      y: z.number().describe("Y coordinate where to place"),
      z: z.number().describe("Z coordinate where to place"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the block was placed"),
      blockName: z.string().describe("Block placed"),
      position: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      }).describe("Position where placed"),
    }),
    execute: async ({ blockName, x, y, z }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(blockName.toLowerCase()),
      );

      if (!item) {
        throw new Error(`Block ${blockName} not found in inventory`);
      }

      const Vec3 = (await import("vec3")).Vec3;
      const targetBlock = bot.blockAt(new Vec3(x, y, z));

      if (!targetBlock) {
        throw new Error("Invalid position");
      }

      await bot.equip(item, "hand");
      await bot.placeBlock(targetBlock, new Vec3(0, 1, 0));

      return {
        success: true,
        blockName: item.name,
        position: { x, y, z },
      };
    },
  }),

  minecraftEat: tool({
    description: "Eat food from inventory",
    inputSchema: z.object({
      foodName: z.string().optional().describe("Specific food item to eat (optional, will eat any food if not specified)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the bot started eating"),
      foodName: z.string().describe("Food being eaten"),
    }),
    execute: async ({ foodName }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      let food;
      if (foodName) {
        food = bot.inventory.items().find((i) => i.name.toLowerCase().includes(foodName.toLowerCase()),
        );
      }
      else {
        food = bot.inventory.items().find((i) => bot.registry.foodsByName[i.name]);
      }

      if (!food) {
        throw new Error(foodName ? `Food ${foodName} not found in inventory` : "No food found in inventory");
      }

      await bot.equip(food, "hand");
      await bot.consume();

      return {
        success: true,
        foodName: food.name,
      };
    },
  }),

  minecraftGetNearbyPlayers: tool({
    description: "Get list of nearby players",
    inputSchema: z.object({
      maxDistance: z.number().default(64).describe("Maximum distance to search (default: 64)"),
    }),
    outputSchema: z.object({
      players: z.array(z.object({
        username: z.string().describe("Player username"),
        distance: z.number().describe("Distance from bot"),
        position: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        }).describe("Player position"),
      })).describe("List of nearby players"),
    }),
    execute: async ({ maxDistance }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const players = Object.values(bot.players)
        .filter((player) => player.entity && player.username !== bot.username)
        .map((player) => {
          const distance = bot.entity.position.distanceTo(player.entity.position);
          return {
            username: player.username,
            distance: distance,
            position: player.entity.position,
          };
        })
        .filter((player) => player.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);

      return {
        players: players,
      };
    },
  }),

  minecraftGetNearbyEntities: tool({
    description: "Get list of nearby entities (mobs, animals, etc.)",
    inputSchema: z.object({
      maxDistance: z.number().default(32).describe("Maximum distance to search (default: 32)"),
      entityType: z.enum(["mob", "animal", "all"]).default("all").describe("Type of entities to search for"),
    }),
    outputSchema: z.object({
      entities: z.array(z.object({
        name: z.string().describe("Entity name/type"),
        type: z.string().describe("Entity type"),
        distance: z.number().describe("Distance from bot"),
        position: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        }).describe("Entity position"),
      })).describe("List of nearby entities"),
    }),
    execute: async ({ maxDistance, entityType }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const entities = Object.values(bot.entities)
        .filter((entity) => {
          if (entity === bot.entity) return false;
          if (entityType === "mob" && entity.type !== "mob") return false;
          if (entityType === "animal" && entity.type !== "mob") return false;
          return true;
        })
        .map((entity) => {
          const distance = bot.entity.position.distanceTo(entity.position);
          return {
            name: entity.name || entity.displayName || "unknown",
            type: entity.type,
            distance: distance,
            position: entity.position,
          };
        })
        .filter((entity) => entity.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);

      return {
        entities: entities,
      };
    },
  }),

  minecraftCraft: tool({
    description: "Craft an item using a crafting table",
    inputSchema: z.object({
      itemName: z.string().describe("Name of the item to craft"),
      count: z.number().default(1).describe("Number of items to craft (default: 1)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the crafting was successful"),
      itemName: z.string().describe("Item crafted"),
      count: z.number().describe("Number crafted"),
    }),
    execute: async ({ itemName, count }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const mcData = await import("minecraft-data");
      const minecraftData = mcData.default(bot.version);
      const item = minecraftData.itemsByName[itemName];

      if (!item) {
        throw new Error(`Item ${itemName} not found`);
      }

      const craftingTableId = minecraftData.blocksByName.crafting_table?.id;

      if (!craftingTableId) {
        throw new Error("Crafting table not found in minecraft data");
      }

      const craftingTable = bot.findBlock({
        matching: craftingTableId,
        maxDistance: 32,
      });

      if (!craftingTable) {
        throw new Error("No crafting table found nearby");
      }

      const recipe = bot.recipesFor(item.id, null, 1, craftingTable)[0];

      if (!recipe) {
        throw new Error(`No recipe found for ${itemName}`);
      }

      await bot.craft(recipe, count, craftingTable);

      return {
        success: true,
        itemName: itemName,
        count: count,
      };
    },
  }),

  minecraftSleep: tool({
    description: "Sleep in a nearby bed",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the bot started sleeping"),
    }),
    execute: async () => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const mcData = await import("minecraft-data");
      const minecraftData = mcData.default(bot.version);

      const bed = bot.findBlock({
        matching: (block) => block.name.includes("bed"),
        maxDistance: 32,
      });

      if (!bed) {
        throw new Error("No bed found nearby");
      }

      await bot.sleep(bed);

      return {
        success: true,
      };
    },
  }),

  minecraftWakeUp: tool({
    description: "Wake up from bed",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the bot woke up"),
    }),
    execute: async () => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      if (!bot.isSleeping) {
        throw new Error("Bot is not sleeping");
      }

      await bot.wake();

      return {
        success: true,
      };
    },
  }),

  minecraftFish: tool({
    description: "Start fishing (requires fishing rod in inventory)",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean().describe("Whether fishing started"),
    }),
    execute: async () => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const fishingRod = bot.inventory.items().find((item) => item.name.includes("fishing_rod"),
      );

      if (!fishingRod) {
        throw new Error("No fishing rod found in inventory");
      }

      await bot.equip(fishingRod, "hand");
      await bot.fish();

      return {
        success: true,
      };
    },
  }),

  minecraftActivateBlock: tool({
    description: "Activate/interact with a block (button, lever, door, chest, etc.)",
    inputSchema: z.object({
      x: z.number().describe("X coordinate of the block"),
      y: z.number().describe("Y coordinate of the block"),
      z: z.number().describe("Z coordinate of the block"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the block was activated"),
      blockName: z.string().describe("Name of the activated block"),
    }),
    execute: async ({ x, y, z }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      const Vec3 = (await import("vec3")).Vec3;
      const block = bot.blockAt(new Vec3(x, y, z));

      if (!block) {
        throw new Error("No block found at specified coordinates");
      }

      await bot.activateBlock(block);

      return {
        success: true,
        blockName: block.name,
      };
    },
  }),

  minecraftJump: tool({
    description: "Make the bot jump",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the jump was executed"),
    }),
    execute: async () => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      bot.setControlState("jump", true);
      setTimeout(() => {
        bot.setControlState("jump", false);
      }, 500);

      return {
        success: true,
      };
    },
  }),

  minecraftSneak: tool({
    description: "Toggle sneaking",
    inputSchema: z.object({
      enable: z.boolean().describe("Whether to enable or disable sneaking"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the sneak state was changed"),
      sneaking: z.boolean().describe("Current sneak state"),
    }),
    execute: async ({ enable }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      bot.setControlState("sneak", enable);

      return {
        success: true,
        sneaking: enable,
      };
    },
  }),

  minecraftSprint: tool({
    description: "Toggle sprinting",
    inputSchema: z.object({
      enable: z.boolean().describe("Whether to enable or disable sprinting"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the sprint state was changed"),
      sprinting: z.boolean().describe("Current sprint state"),
    }),
    execute: async ({ enable }) => {
      const bot = getMinecraftBot();
      if (!bot || !isMinecraftConnected()) {
        throw new Error("Not connected to any Minecraft server");
      }

      bot.setControlState("sprint", enable);

      return {
        success: true,
        sprinting: enable,
      };
    },
  }),
};
