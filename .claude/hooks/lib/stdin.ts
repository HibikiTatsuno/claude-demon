import type { HookInput, HookOutput } from "./types.js";

/**
 * Read hook input from stdin
 */
export async function readStdin<T extends HookInput>(): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = "";

    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (chunk) => {
      data += chunk;
    });

    process.stdin.on("end", () => {
      try {
        const parsed = JSON.parse(data) as T;
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Failed to parse stdin: ${error}`));
      }
    });

    process.stdin.on("error", reject);
  });
}

/**
 * Output hook result (continue)
 */
export function continueHook(): void {
  const output: HookOutput = { decision: "continue" };
  console.log(JSON.stringify(output));
}

/**
 * Output hook result (block)
 */
export function blockHook(reason: string): void {
  const output: HookOutput = { decision: "block", reason };
  console.log(JSON.stringify(output));
}
