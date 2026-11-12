// Audit rows written since the test started, read through the admin audit procs as the app reads
// them: the test login may only run procedures. Call before the test writes anything.
async function openAuditTrail(exec, adminId = 1) {
  const [[newest]] = await exec("usp_Audit_List", { ActorUserId: adminId, PageSize: 1 });
  const since = Number(newest?.AuditLogId ?? 0);

  async function rows(search, keep) {
    const found = [];
    for (let page = 1; page <= 1000; page++) {
      const [batch] = await exec("usp_Audit_List", { ActorUserId: adminId, Search: search, PageSize: 100, Page: page });
      found.push(...batch.filter((r) => Number(r.AuditLogId) > since && keep(r)));
      if (batch.length < 100 || Number(batch[batch.length - 1].AuditLogId) <= since) break;
    }
    return found.sort((a, b) => Number(a.AuditLogId) - Number(b.AuditLogId));
  }

  return {
    /** One entity's rows, oldest first; withJson adds BeforeJson and AfterJson. */
    async of(entityName, entityId, { withJson = false } = {}) {
      const list = await rows(entityName, (r) => r.EntityName === entityName && String(r.EntityId) === String(entityId));
      if (!withJson) return list;
      return Promise.all(
        list.map(async (r) => (await exec("usp_Audit_GetById", { AuditLogId: r.AuditLogId, ActorUserId: adminId }))[0][0]),
      );
    },
    /** How many rows name an entity that starts with the prefix. */
    async count(prefix) {
      return (await rows(prefix, (r) => String(r.EntityName).startsWith(prefix))).length;
    },
  };
}

module.exports = { openAuditTrail };
