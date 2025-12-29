import { trigger } from "#/utils/trigger";

trigger.webhook("counter-strike-game-end", "/counter-strike/game-end", (ctx) => {
  console.log(ctx);
});
