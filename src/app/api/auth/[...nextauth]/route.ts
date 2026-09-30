import { handlers } from "@/lib/auth/config";

/**
 * Auth.js route handler — the sanctioned Route Handler exception (STANDARDS
 * §3 server-action-only rule; recorded in the module #4 MR). CSRF for these
 * endpoints is Auth.js built-in (double-submit cookie).
 */
export const { GET, POST } = handlers;
