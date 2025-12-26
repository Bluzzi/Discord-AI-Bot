import "./utils/discord";
import { logger } from "#/utils/logger";
import "./events/message-create";
import { setupInteractionHandler } from "./events/interaction-create";
import { setupVoicePresenceHandler } from "./events/voice-presence";
import { setupMotd } from "./events/motd";

setupInteractionHandler();
setupVoicePresenceHandler();
setupMotd();

logger.info("Bot started!");
