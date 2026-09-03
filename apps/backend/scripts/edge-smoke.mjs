import { io } from 'socket.io-client';

const edgeUrl = (process.env.EDGE_URL ?? 'http://localhost:8080').replace(
  /\/$/,
  '',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk(response, description) {
  assert(response.ok, `${description} failed with HTTP ${response.status}`);
  return response;
}

async function connectThroughSocket(
  transports,
  cookie,
  { waitForUpgrade = false } = {},
) {
  const transportLabel = transports.join(' → ');

  await new Promise((resolve, reject) => {
    const socket = io(edgeUrl, {
      path: '/socket.io/',
      transports,
      withCredentials: true,
      extraHeaders: {
        Cookie: cookie,
        Origin: edgeUrl,
      },
      reconnection: false,
      timeout: 5_000,
    });
    let settled = false;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${transportLabel} Socket.IO connection timed out`));
    }, 10_000);

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      callback(value);
    };

    socket.once('connect', () => {
      if (!waitForUpgrade) {
        settle(resolve);
        return;
      }

      const engine = socket.io.engine;
      if (engine?.transport.name === 'websocket') {
        settle(resolve);
        return;
      }

      if (engine === undefined) {
        settle(reject, new Error('Socket.IO engine was not initialized'));
        return;
      }

      engine.once('upgrade', () => {
        if (engine.transport.name !== 'websocket') {
          settle(
            reject,
            new Error(
              `Socket.IO upgraded to unexpected transport ${engine.transport.name}`,
            ),
          );
          return;
        }
        settle(resolve);
      });
    });
    socket.once('connect_error', (error) => settle(reject, error));
  });
}

async function main() {
  await assertOk(await fetch(edgeUrl), 'frontend load');

  const healthResponse = await assertOk(
    await fetch(`${edgeUrl}/api/v1/health/ready`),
    'API readiness',
  );
  const health = await healthResponse.json();
  assert(health.success === true, 'API readiness did not return success');

  const email = `edge-smoke-${Date.now()}@example.com`;
  const registrationResponse = await assertOk(
    await fetch(`${edgeUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'edge-smoke-password' }),
    }),
    'session registration',
  );
  const setCookie =
    registrationResponse.headers.getSetCookie?.()[0] ??
    registrationResponse.headers.get('set-cookie');
  assert(setCookie, 'session registration did not return a cookie');
  const cookie = setCookie.split(';', 1)[0];

  const currentUserResponse = await assertOk(
    await fetch(`${edgeUrl}/api/v1/auth/me`, {
      headers: { Cookie: cookie },
    }),
    'authenticated session request',
  );
  const currentUser = await currentUserResponse.json();
  assert(
    currentUser.data?.email === email,
    'authenticated session did not resolve the registered user',
  );

  await connectThroughSocket(['polling', 'websocket'], cookie, {
    waitForUpgrade: true,
  });
  await connectThroughSocket(['polling'], cookie);

  process.stdout.write(
    `Edge smoke passed at ${edgeUrl}: frontend, readiness, session cookie, websocket, and polling.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Edge smoke failed: ${error.message}\n`);
  process.exitCode = 1;
});
