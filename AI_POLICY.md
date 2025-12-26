# AI Editing Policy

Ce fichier doit impérativement être lu par les IA avant toutes modification et création de code dans le projet. Il contient des restrictions et guidelines qui devront être respecté.

## La stack du projet

NodeJS v24.11.0 (LTS) est utilisé comme runtime, les API spécifiques à NodeJS peuvent donc être utilisé. 

PNPM est utilisé comme package manager, les autres packages managers ne doivent pas être utilisé. 

TypeScript et ESLint sont utilisés pour assurer la qualité du code, après chaque modification du code, il faut donc exécuté les commandes suivantes et corriger les erreurs affichés dans le terminal s'il y en a :

- `pnpm run ts:check` - permet de voir les erreurs de TypeScript.
- `pnpm run lint:fix`- corrige les erreurs ESLint qui peuvent être corrigé, affiche les erreurs qui ne peuvent pas l'être.

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
- ...

### `src/events/**`
- ...

### `src/features/**`
- ...

### `src/tools/**`
- ...

### `src/utils/**`
- ...
