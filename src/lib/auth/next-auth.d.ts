import type { AppToken } from "./config";

/** Module augmentation: the app payload carried inside the Auth.js JWT/session. */
declare module "next-auth" {
  interface Session {
    appToken?: AppToken;
  }
  interface User {
    appToken?: AppToken;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appToken?: AppToken;
  }
}
