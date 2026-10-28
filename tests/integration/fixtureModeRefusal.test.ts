import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// M3: the server refuses to start in fixture mode on Vercel production. Needs a
// production build (`npm run build`); skipped without one.
const built = existsSync(path.join(process.cwd(), ".next", "BUILD_ID"));

describe.skipIf(!built)("fixture mode in production", () => {
  it("next start exits with code 1 and names the reason", async () => {
    const child = spawn(
      process.execPath,
      [
        path.join("node_modules", "next", "dist", "bin", "next"),
        "start",
        "-p",
        "3199",
      ],
      {
        env: {
          ...process.env,
          PEERSET_SEC_FIXTURES: "1",
          VERCEL_ENV: "production",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const code = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 20_000);
      child.on("exit", (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    expect(code).toBe(1);
    expect(output).toContain(
      "PEERSET_SEC_FIXTURES=1 is not allowed in production",
    );
  }, 30_000);
});
