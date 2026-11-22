export const attempt = async <T>(run: () => PromiseLike<T>) => {
  try {
    return { ok: true, value: await run() } as const;
  }
  catch (error) {
    return { ok: false, error } as const;
  }
};
