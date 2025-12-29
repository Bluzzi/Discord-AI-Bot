This directory contains all entry points used to trigger the bot.

Il est important de différencier deux choses :
- `TRIGGER`: Discord events, webhooks, and scheduled jobs. Ainsi que le code conditionnel permettant optionnellement de choisir si l'IA doit être appelé ou non.
- `AI GENERATION`: L'appel direct de l'IA, c'est ici que la prompt ce situe, que les outils sont mis à disposition et que le contenu généré par l'IA est ensuite utilisé, ceci ce fait généralement en utilisant la function `generateText` du package `ai`.

Le code doit être le plus proche possible d'un simple `TRIGGER` qui lance `AI GENERATION`, de manière à laisser libre arbitre à l'IA. Toute contrainte alogorythmique doit être limité au maximum.

Si le code génératif de la réponse l'IA doit être réutiliser dans plusieurs `TRIGGER` ou qu'il devient long (plusieurs centaines de lignes), il est possible de déplacer ce code du `AI GENERATION` dans `/src/features`, en gardant la logique du `TRIGGER` dans `/src/triggers`. L'event `message-create.djs-event.ts` est un bonne exemple pour ce principe.

Chaque `TRIGGER` possède une function spécifique pour être utilisé, d'écrit ci-dessous. Il est important de noter que ces functions permettent toutes de gérer les erreur de manière global, conformément au code présent dans `/src/utils/trigger.ts`.

L'intégralité des fichiers triggers doivent être lancé au démarrage du projet dans `/src/main.ts` sous le commentaire approprié.

## Discord Events

Création d'un listener sur un event Discord en particulier.

Nomminiation du fichier : `<event-name>.djs-event.ts`.

Example de code (`message-create.djs-event.ts`):
```ts
import { trigger } from "#/utils/trigger";

trigger.discordEvent("messageCreate", async (message) => {
  // TRIGGER and AI GENERATION
});
```

## Webhooks

Les webhooks permettent de s'abonner à des évènements de sources externes.

Nomminiation du fichier : `<webhook-source>.webhook.ts`.

Example de code (`counter-strike-game-end.webhook.ts`):
```ts
import { trigger } from "#/utils/trigger";

trigger.webhook("counter-strike-game-send", "/counter-strike/game-end", async () => {
  // TRIGGER and AI GENERATION
});
```

## CRON Jobs

CRON jobs are used for scheduled or recurring triggers. 

Nomminiation du fichier : `<job-name>.cron.ts`.

Example de code (`daily-summary.cron.ts`):
```ts
// daily-summary.cron.ts
trigger.cron(
  "daily-summary",
  "0 8 * * *",
  async () => {
    // Trigger AI logic here
  },
  { 
    triggerAtStartup: false
  },
);
```
