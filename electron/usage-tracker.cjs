const os = require('os');
const crypto = require('crypto');

/**
 * Get a unique machine ID derived from hostname + cpus + platform.
 * Deterministic — same machine always returns the same ID.
 * @returns {string} SHA-256 hex hash
 */
function getMachineId() {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
    os.totalmem().toString(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = { getMachineId };
