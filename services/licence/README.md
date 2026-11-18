# Licence service

Issues and checks Modulus licences: the 14-day trial, free and full licences, check-ins, feedback and
testimonial consent. It runs as a Cloudflare Worker with a D1 database. Every licence and check-in reply is
signed with Ed25519; the desktop app holds only the public key.

## Deploy

1. Copy `wrangler.toml.example` to `wrangler.toml` (it is not committed) and set `MAIL_FROM`.
2. Run `npm ci` in `services/licence` once; it installs the pinned wrangler used by the `npx wrangler` steps below. Then create the database, load the base schema and apply the migrations:

   ```bash
   npx wrangler d1 create modulus-licence
   ```

   Put the `database_id` it prints into `wrangler.toml`, then:

   ```bash
   npx wrangler d1 execute modulus-licence --remote --file=schema.sql
   npx wrangler d1 migrations apply modulus-licence --remote
   ```

   Migrations live in `migrations/` as `NNNN_name.sql` and are recorded by wrangler, so re-running the apply step only applies new ones. A database that already holds the base schema only needs the second command.
3. Make a signing key pair. This prints both keys once; never save the private key to a file:

   ```bash
   node -e "const k=require('crypto').generateKeyPairSync('ed25519');console.log('private:',k.privateKey.export({type:'pkcs8',format:'der'}).toString('base64url'));console.log('public:',k.publicKey.export({type:'spki',format:'der'}).toString('base64url'))"
   ```

4. Store the secrets (each command asks for the value):

   ```bash
   npx wrangler secret put SIGNING_KEY_PKCS8
   npx wrangler secret put ADMIN_TOKEN
   npx wrangler secret put MAIL_API_KEY
   ```

   `ADMIN_TOKEN` must be at least 32 characters; shorter tokens refuse every admin call.
   Optionally set `ADMIN_READ_TOKEN` (also 32 or more characters): it can list testers and feedback but cannot convert or mint licences. Every admin action is recorded in the append-only `admin_event` table. To rotate a token, run `wrangler secret put` again with a new value.
5. Deploy, then point the app at the service:

   ```bash
   npx wrangler deploy
   ```

   In the desktop repository's Actions variables, set `PM_LICENCE_PUBLIC_KEYS` to a JSON object
   holding the public key under the same `SIGNING_KID` (for example `{"k1":"MCow..."}`), and
   `PM_LICENCE_SERVICE_URL` to the `https://` address the deploy printed. The build bakes both into
   the app; with `PM_LICENSING` set to `enforce`, it stops when either is missing. `PM_LICENCE_URL` overrides it for local testing only.

## Rotating the signing key

Generate a new pair, add the new public key to the app under a new kid and ship that release. Once installs
have it, set `SIGNING_KID` and `SIGNING_KEY_PKCS8` to the new pair. Keep the old public key in the app until
every licence signed with it has been refreshed by a check-in.

## Admin page

Open `/admin` on the worker, paste the admin token, and load the testers. The page lists each tester's
licence, feedback count and current consents, shows their feedback, converts a trial to a free or full
licence, and issues redeem codes for installs that never had a trial.

## Mail

Codes go out through Resend by default. Set `MAIL_ENDPOINT` (https only) to use another provider with the
same request shape.

## Tests

`npx vitest run services/licence` runs the service tests against the in-memory store.
