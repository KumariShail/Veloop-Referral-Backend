async function createAuditLog(
  database,
  { userId = null, referralId = null, action, status, details = null }
) {
  try {
    await database.orm.public.AuditLog.create({
      userId,
      referralId,
      action,
      status,
      details:
        details === null
          ? null
          : typeof details === "string"
            ? details
            : JSON.stringify(details),
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

module.exports = {
  createAuditLog,
};