import { execFileSync } from "node:child_process";

export function isPhotoshopRunning(): boolean {
  const output = execFileSync("tasklist", ["/FI", "IMAGENAME eq Photoshop.exe", "/NH"], {
    encoding: "utf8",
  });
  return output.toLowerCase().includes("photoshop.exe");
}

export function ensurePhotoshopRunning(): void {
  if (!isPhotoshopRunning()) {
    throw new Error(
      "Photoshop is not running. Please open Photoshop first, then rerun this command."
    );
  }
}

export function ensurePhotoshopNotRunning(): void {
  if (isPhotoshopRunning()) {
    throw new Error(
      "Photoshop is running. Close Photoshop completely before running setup-photoshop."
    );
  }
}
