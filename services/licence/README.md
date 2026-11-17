# Licence service

Issues and checks Modulus licences: the 14-day trial, free and full licences, check-ins, feedback and
testimonial consent. It runs as a Cloudflare Worker with a D1 database. Every licence and check-in reply is
signed with Ed25519; the desktop app holds only the public key.

## Deploy

1. Copy `wrangler.toml.example` to `wrangler.toml` (it is not committed) and set `MAIL_FROM`.
2. Create the database and load the schema:

   ```bash
   npx wrangler d1 create modulus-licence
   npx wrangler d1 execute modulus-licence --remote --file=schema.sql
   ```

   Put the `database_id` it prints into `wrangler.toml`.
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
5. Deploy, then point the app at the service:

   ```bash
   npx wrangler deploy
   ```

   In `electron/licence/keys.ts`, add the public key to `LICENCE_PUBLIC_KEYS` under the same
   `SIGNING_KID`, and set `LICENCE_SERVICE_URL` to the `https://` address the deploy printed.
   A build with an empty `LICENCE_SERVICE_URL` cannot start a trial or check in, so an enforcing
   build must never ship without it. `PM_LICENCE_URL` overrides it for local testing only.

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
