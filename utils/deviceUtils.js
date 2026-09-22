const crypto = require("crypto");

function hashDeviceToken(deviceToken) {
  return crypto
    .createHash("sha256")
    .update(deviceToken)
    .digest("hex");
}

function generateDeviceToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  hashDeviceToken,
  generateDeviceToken,
};