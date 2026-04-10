import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;

/** Legacy demo hasher — kept only to verify old rows and upgrade them on successful login. */
export function legacyHashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return "hashed_" + Math.abs(hash).toString(36);
}

export function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

export async function hashPasswordPlain(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verifies password. If stored value is legacy format and matches, returns needsUpgrade so caller can re-hash.
 */
export async function verifyPasswordWithUpgrade(
  password: string,
  stored: string
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (isBcryptHash(stored)) {
    const ok = await bcrypt.compare(password, stored);
    return { ok, needsUpgrade: false };
  }
  const legacy = legacyHashPassword(password);
  const ok = legacy === stored;
  return { ok, needsUpgrade: ok };
}
