import { createServer } from 'node:https';

export const UPPER = '/v1/modules/acme/RDS/aws/versions';
export const LOWER = '/v1/modules/acme/rds/aws/versions';
export const VERSIONS = { modules: [{ versions: [{ version: '1.0.0' }, { version: '1.1.0' }] }] };
export const MISSING = { modules: [{}] };

export async function startRegistry({ cert, key, requests, port = 443 }) {
  const routes = {
    '/.well-known/terraform.json': { 'modules.v1': '/v1/modules/' },
    [UPPER]: VERSIONS,
    [LOWER]: MISSING,
  };
  const server = createServer({ cert, key }, (request, response) => {
    let status = Object.hasOwn(routes, request.url) ? 200 : 404;
    let body = routes[request.url] ?? {};
    if (request.headers.authorization !== 'Bearer fixture-only') {
      status = 401;
      body = {};
    }
    requests.push({ path: request.url, phase: request.headers['x-repro-phase'] ?? 'dependabot', status, body });
    const data = JSON.stringify(body);
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'Connection': 'close',
    });
    response.end(data);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
