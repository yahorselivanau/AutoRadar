export interface BlockResult {
  blocked: true;
  code: "rate-limited" | "blocked";
  reason: string;
}

export interface NotBlocked {
  blocked: false;
}

export type BlockCheck = BlockResult | NotBlocked;

const BLOCK_PATTERNS: { regex: RegExp; code: "rate-limited" | "blocked"; reason: string }[] = [
  { regex: /<title>[^<]*(?:captcha|access denied|http error 429|403 forbidden|доступ ограничен)/i, code: "blocked", reason: "CAPTCHA or access denied in <title>" },
  { regex: /(?:class|id)=["'][^"']*(?:captcha|challenge|turnstile)[^"']*["']/i, code: "blocked", reason: "CAPTCHA/challenge element found" },
  { regex: /cf-challenge|challenge-platform|cdn-cgi\/challenge/i, code: "blocked", reason: "Cloudflare challenge page" },
  { regex: /challenges\.cloudflare\.com\/turnstile/i, code: "blocked", reason: "Cloudflare Turnstile" },
  { regex: /ddos-guard|Доступ ограничен|Ваш IP заблокирован/i, code: "blocked", reason: "DDoS-Guard protection" },
  { regex: /navigator\.webdriver|webdriver\b|__webdriver/i, code: "blocked", reason: "Bot detection triggered" },
  { regex: /слишком много запросов|too many requests|превышен лимит/i, code: "rate-limited", reason: "Rate limit message" },
  { regex: /<h2>\s*429\s*<\/h2>/i, code: "rate-limited", reason: "HTTP 429 page" },
  { regex: /hg-security|kaspersky.*security|bitrix.*captcha/i, code: "blocked", reason: "Security page" },
  { regex: /document\.(?:createElement|write|cookie).*challenge/i, code: "blocked", reason: "JS challenge" },
];

export function detectBlock(html: string, status: number): BlockCheck {
  if (status === 429) {
    return { blocked: true, code: "rate-limited", reason: "HTTP 429 Too Many Requests" };
  }
  if (status === 403) {
    return { blocked: true, code: "blocked", reason: "HTTP 403 Forbidden" };
  }
  if (status === 401) {
    return { blocked: true, code: "blocked", reason: "HTTP 401 Unauthorized" };
  }

  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.regex.test(html)) {
      return { blocked: true, code: pattern.code, reason: pattern.reason };
    }
  }

  return { blocked: false };
}
