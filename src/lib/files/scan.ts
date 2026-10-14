/**
 * Anti-virus hook (STANDARDS §4, ADR-0026 §4). Every upload passes through
 * here after its type is accepted and before it is stored. No scanner is wired
 * in yet, so every file is clean. A real scanner (a ClamAV daemon on the server
 * edition, Microsoft Defender's MpCmdRun on the desktop) plugs in here and
 * answers `{ clean: false }` to refuse the file. Server only.
 */
export type ScanResult = { clean: true } | { clean: false; reason: string };

export async function scanFile(filePath: string): Promise<ScanResult> {
  void filePath;
  return { clean: true };
}
