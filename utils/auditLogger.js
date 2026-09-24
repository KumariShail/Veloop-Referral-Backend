async function createAuditLog(
  database,
  {
    userId = null,
    referralId = null,
    action,
    status,
    details = null,
  }
) {
  try {
    await database.orm.public.AuditLog.create({
      userId,
      referralId,
      action,
      status,
      details:
        details !== null
          ? JSON.stringify(details)
          : null,
    });
  } catch (error) {
    // Audit logging should never break the main business operation.
    console.error("Audit log error:", error);
  }
}

module.exports = {
  createAuditLog,
};