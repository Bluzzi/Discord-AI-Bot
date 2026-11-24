import { Sandbox } from "railway";

export const createRailwaySession = (token: string) => {
  let sandbox: Sandbox | undefined;
  let pending: Promise<void> = Promise.resolve();

  // Tool calls from the same model step can run concurrently.
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = pending;
    let release!: () => void;
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    }
    finally {
      release();
    }
  };

  return {
    create: async () => run(async () => {
      if (sandbox !== undefined) {
        await sandbox.refresh();
        if (sandbox.status !== "DESTROYED") return;
        sandbox = undefined;
      }
      sandbox = await Sandbox.create({
        token,
        authType: "project-token",
        idleTimeoutMinutes: 5,
        networkIsolation: "ISOLATED",
      });
    }),
    use: async <T>(operation: (sandbox: Sandbox) => Promise<T>) => run(async () => {
      if (sandbox === undefined) throw new Error("Create a sandbox first");
      return operation(sandbox);
    }),
    destroy: async () => run(async () => {
      if (sandbox === undefined) return;
      await sandbox.destroy();
      sandbox = undefined;
    }),
  };
};
