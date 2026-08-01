const HG_SECURITY_PATTERN = /hg-security=([^;]+);/;

export interface Auto1ChallengeSolver {
  solve(html: string): Promise<Record<string, string> | undefined>;
  cookieHeader(): Record<string, string> | undefined;
}

export function createAuto1ChallengeSolver(ttlMs = 100_000): Auto1ChallengeSolver {
  let cookie: string | undefined;
  let expiresAt = 0;

  return {
    async solve(html) {
      const match = HG_SECURITY_PATTERN.exec(html);
      if (!match) {
        return undefined;
      }
      cookie = match[1];
      expiresAt = Date.now() + ttlMs;
      return { Cookie: `hg-security=${cookie}` };
    },
    cookieHeader() {
      if (cookie && Date.now() < expiresAt) {
        return { Cookie: `hg-security=${cookie}` };
      }
      return undefined;
    },
  };
}
