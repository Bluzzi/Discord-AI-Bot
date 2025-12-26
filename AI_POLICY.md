# AI Editing Policy

Ce fichier doit impérativement être lu par les IA avant toutes modification et création de code dans le projet. Il contient des restrictions et guidelines qui devront être respecté.

## La stack du projet

NodeJS v24.11.0 (LTS) est utilisé comme runtime, les API spécifiques à NodeJS peuvent donc être utilisé. 

PNPM est utilisé comme package manager, les autres packages managers ne doivent pas être utilisé. 

TypeScript et ESLint sont utilisés pour assurer la qualité du code, après chaque modification du code, il faut donc exécuté les commandes suivantes et corriger les erreurs affichés dans le terminal s'il y en a :

- `pnpm run ts:check` - permet de voir les erreurs de TypeScript.
- `pnpm run lint:fix`- corrige les erreurs ESLint qui peuvent être corrigé, affiche les erreurs qui ne peuvent pas l'être.

## Guidelines globales

- Aucun `try`/`catch` ne doit être utilisé au niveau des functions haut-niveau, seuls quelques `try`/`catch` mis en place par des développeurs humains sur des functions bas-niveau permettant une gestion d'erreur global sont utilisés. Il est donc impératif de simplement `throw new Error("Details")` dans les functions haut-niveau.

- Les noms des dossiers et fichiers sont écrites en `kebab-case`. Les noms des variables sont écrits en `camelCase`.

## Zones protégées

Les fichiers suivants sont STRICTEMENT en lecture seule :

- `.github/**`
- `.gitignore`
- `AI_POLICY.md`
- `eslint.config.js`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`

## Règles d’action par zone

### `src/discord/**`

Probablement pas de modification autorisé pour les IA ici, ou alors, il faudra documenter les règles d'actions pour cette zone.

### `src/events/**`

Probablement pas de modification autorisé pour les IA ici, ou alors, il faudra documenter les règles d'actions pour cette zone.

### `src/features/**`

Probablement pas de modification autorisé pour les IA ici, ou alors, il faudra documenter les règles d'actions pour cette zone.

### `src/tools/**`

Contient des outils pour différents services/systèmes qui seront utilisé par des IA, chaque fichier contient un objet qui export la liste complète des outils pour le service concerné, aucun autre code ou function ne doit être présent en dehors de l'objet.

Voici à quoi doit ressembler l'objet :

```ts
export const discordTools: ToolSet = {
  renameMember: tool({
    description: "Rename a guild member",
    inputSchema: z.object({
      guildID: z.string().describe("The Discord guild/server ID"),
      memberID: z.string().describe("The Discord member ID to rename"),
      nickname: z.string().describe("The new nickname for the member"),
    }),
    outputSchema: z.object({ 
      oldNickname: z.string().describe("Previous nickname"),
      newNickname: z.string().describe("New nickname"),
      memberID: z.string().describe("Member ID"),
    }),
    execute: async ({ guildID, userID, nickname }) => {
      const guild = discord.client.guilds.get(guildID);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberID);
      if (!member) throw new Error("Member not found");

      const oldNickname = member.nickname || member.user.username;
      await member.setNickname(nickname);

      return {
        oldNickname: oldNickname,
        newNickname: nickname,
        memberId: member.id,
      };
    },
  }),
  // ... others tools for this service
}
```

Dans le cas ou `outputSchema` n'a aucune information pertinente à renvoyer, il doit être un objet vide `z.object({})`, par soucis d'harmonie dans les valeurs de retours.

### `src/utils/**`

Contient les utilitaires généraux et non liés aux autres dossiers principaux. Chaque utilitaire doit rester simple et générique.
