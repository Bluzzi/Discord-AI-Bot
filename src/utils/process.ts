import { logger } from "#/utils/logger";

export const uncaughtExceptionHandler = (): void => {
  process.on("uncaughtException", (error, origin) => {
    logger.error(`Process Exception: ${origin}`, error.stack);

    process.exit(1);
  });
};
