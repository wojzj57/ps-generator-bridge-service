export const DEFAULT_REMOTE_PASSWORD = "password";
export const REMOTE_PASSWORD_ENV = "PS_GENERATOR_REMOTE_PASSWORD";

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
const INVISIBLE_CHARACTER = /[\s\p{C}]/u;

export function resolveRemotePassword(
  explicitPassword: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  const password = explicitPassword ?? env[REMOTE_PASSWORD_ENV] ?? DEFAULT_REMOTE_PASSWORD;
  return validateRemotePassword(password);
}

export function validateRemotePassword(password: string): string {
  const length = Array.from(password).length;
  if (
    length < MIN_PASSWORD_LENGTH ||
    length > MAX_PASSWORD_LENGTH ||
    password.startsWith("--") ||
    INVISIBLE_CHARACTER.test(password)
  ) {
    throw new Error(
      "Photoshop Remote Connections password must contain 6-128 visible, non-whitespace Unicode characters and must not start with '--'."
    );
  }
  return password;
}
