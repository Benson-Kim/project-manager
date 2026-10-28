import { toIssues } from "./proofing";

/**
 * The grammar checker's own process (ADR-0049). The main process sends the WebAssembly first,
 * because only it reads files packed in the app archive, then one paragraph per message.
 */
let linter: ReturnType<typeof load> | null = null;

async function load(wasm: Uint8Array, dialect: string) {
  const { createBinaryModuleFromUrl, Dialect, LocalLinter } = await import("harper.js");
  const url = `data:application/wasm;base64,${Buffer.from(wasm).toString("base64")}`;
  const binary = createBinaryModuleFromUrl(url, "slim");
  const loaded = new LocalLinter({
    binary,
    dialect: Dialect[dialect as keyof typeof Dialect] ?? Dialect.British,
  });
  await loaded.setup();
  return loaded;
}

process.parentPort.on("message", ({ data }) => {
  if (data.wasm) {
    linter = load(data.wasm, data.dialect);
    linter.then(
      () => process.parentPort.postMessage({ ready: true }),
      (err: unknown) => {
        process.parentPort.postMessage({ failed: String(err) });
        process.exit(1);
      },
    );
    return;
  }
  const { id, text } = data as { id: number; text: string };
  void (async () => {
    try {
      const lints = await (await linter!).lint(text, { language: "plaintext" });
      process.parentPort.postMessage({ id, issues: toIssues(text, lints) });
      for (const lint of lints) lint.free();
    } catch (err) {
      process.parentPort.postMessage({ id, issues: [], failed: String(err) });
    }
  })();
});
