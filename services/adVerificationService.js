async function verifyAdCompletion({
  adProvider,
  externalEventId,
  eventType,
}) {
  if (adProvider !== "TEST_PROVIDER") {
    return {
      verified: false,
      reason: "UNSUPPORTED_AD_PROVIDER",
    };
  }

  if (eventType !== "AD_COMPLETED") {
    return {
      verified: false,
      reason: "INVALID_EVENT_TYPE",
    };
  }

  if (!externalEventId) {
    return {
      verified: false,
      reason: "MISSING_EXTERNAL_EVENT_ID",
    };
  }

  // Development-only verification.
  // Replace this with server-to-server ad-provider verification
  // before production rewards are enabled.
  return {
    verified: true,
    reason: "TEST_PROVIDER_VERIFIED",
  };
}

module.exports = {
  verifyAdCompletion,
};