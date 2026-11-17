import { connect, sql, type DbTarget } from "../db";
import type { LicenceMirror, MirroredState } from "./manager";

function parse(state: string | undefined): MirroredState | null {
  if (!state) return null;
  try {
    const value = JSON.parse(state) as Partial<MirroredState> | null;
    if (typeof value !== "object" || value === null) return null;
    return {
      licence: value.licence ?? null,
      checkIn: value.checkIn ?? null,
      mark: value.mark ?? null,
    };
  } catch {
    return null;
  }
}

export class SqlLicenceMirror implements LicenceMirror {
  constructor(
    private readonly target: DbTarget,
    private readonly machineHash: string,
  ) {}

  async read(): Promise<MirroredState | null> {
    const pool = await connect(this.target, this.target.database, 1);
    try {
      const result = await pool
        .request()
        .input("MachineHash", sql.Char(64), this.machineHash)
        .execute<{ State: string }>("dbo.usp_Licence_Get");
      return parse(result.recordset[0]?.State);
    } finally {
      await pool.close();
    }
  }

  async write(state: MirroredState): Promise<void> {
    const pool = await connect(this.target, this.target.database, 1);
    try {
      await pool
        .request()
        .input("MachineHash", sql.Char(64), this.machineHash)
        .input("State", sql.NVarChar(sql.MAX), JSON.stringify(state))
        .execute("dbo.usp_Licence_Save");
    } finally {
      await pool.close();
    }
  }
}
