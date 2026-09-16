/**
 * SecLists top-10k password denylist — 12+-character subset (issue #27).
 *
 * Source: https://github.com/danielmiessler/SecLists
 *   Passwords/Common-Credentials/xato-net-10-million-passwords-10000.txt
 *   (the renamed successor of 10-million-password-list-top-10000.txt)
 * Source sha256: c63d5e4ccc31344d662583cc39ca4bd5bd20517ff1d24501f0c4e0c22d9b722a
 * Fetched: 2026-09-16 by CI job 16525204453 (denylist:generate, pipeline
 *   2852740796) — 10000 source lines verified, then lowercased, trimmed,
 *   filtered to length >= 12, deduped and sorted. Entry count: 24.
 *
 * Licence: SecLists is MIT licensed (Copyright Daniel Miessler and Jason
 * Haddix; full text at https://github.com/danielmiessler/SecLists/blob/master/LICENSE).
 * Attribution is also recorded in docs/SECURITY.md.
 *
 * Regenerate with a "[denylist]" commit (see denylist:generate in
 * .gitlab-ci.yml) and update the sha256/date/count above.
 */
export const SECLISTS_DENYLIST_RAW = `123456654321
123456789qwe
123456qwerty
123qweasdzxc
1q2w3e4r5t6y
1qaz2wsx3edc
1qazxsw23edc
gfhjkmgfhjkm
ghhh47hj7649
ghjcnjgfhjkm
leavemealone
mailcreated5240
masterbating
motherfucker
polniypizdec0211
q1w2e3r4t5y6
qazwsxedc123
qazwsxedcrfv
qwerasdfzxcv
qwerty123456
qwertyqwerty
sojdlg123aljg
sonyericsson
zxcasdqwe123`;
