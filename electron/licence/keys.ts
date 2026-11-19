import type { PublicKeys } from "./policy";

declare const __LICENCE_PUBLIC_KEYS__: PublicKeys | undefined;
declare const __LICENCE_SERVICE_URL__: string | undefined;

export const LICENCE_PUBLIC_KEYS: PublicKeys = Object.freeze(
  typeof __LICENCE_PUBLIC_KEYS__ === "undefined" ? {} : { ...__LICENCE_PUBLIC_KEYS__ },
);

export const LICENCE_SERVICE_URL =
  typeof __LICENCE_SERVICE_URL__ === "undefined" ? "" : __LICENCE_SERVICE_URL__;
