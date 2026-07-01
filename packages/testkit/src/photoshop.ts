import { execFileSync } from "node:child_process";

export function ensurePhotoshopRunning(): void {
  const output = execFileSync("tasklist", ["/FI", "IMAGENAME eq Photoshop.exe", "/NH"], {
    encoding: "utf8",
  });
  if (!output.toLowerCase().includes("photoshop.exe")) {
    throw new Error(
      "Photoshop is not running. Please open Photoshop first, then rerun this command."
    );
  }
}
