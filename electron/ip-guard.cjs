const https = require('https');

/**
 * Get the current public IP via ipify
 */
function getCurrentIp() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).ip);
        } catch (e) {
          reject(new Error('Erro ao parsear resposta do ipify'));
        }
      });
    }).on('error', (e) => reject(new Error(`Erro ao obter IP: ${e.message}`)));
  });
}

/**
 * Check if the current IP is in the whitelist via Supabase edge function.
 */
async function checkIpWhitelist(supabaseUrl, supabaseKey) {
  const ip = await getCurrentIp();

  return new Promise((resolve, reject) => {
    const url = new URL(`${supabaseUrl}/functions/v1/check-ip`);
    const body = JSON.stringify({ ip });

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              allowed: parsed.allowed === true,
              ip,
              checked_at: new Date().toISOString(),
            });
          } catch (e) {
            reject(new Error('Parse error na resposta do check-ip'));
          }
        });
      }
    );

    req.on('error', (e) => reject(new Error(`Erro na verificação: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { getCurrentIp, checkIpWhitelist };
