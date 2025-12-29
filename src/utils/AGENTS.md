# Utils Directory

This directory contains general-purpose utilities used across the project.

## Guidelines

- Utilities MUST remain simple and generic.
- No domain-specific or feature-specific logic is allowed here.
- Each file should export a single function or a utility object.
- When possible, group related functions in a single exported object (see `trigger.ts` for an example).

**Example:**

```ts
// Utility object
const foo = () => { /* ... */ }
const bar = async() => { /* ... */ }

export const sizer = { foo, bar };

// Single arrow function
export const doSomething = () => { /* ... */ };
```

Keep all utilities minimal, reusable, and consistent with the code style (arrow functions for all methods).