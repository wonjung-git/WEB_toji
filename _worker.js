export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (url.pathname === '/api/search') {
      return proxyRequest('https://api.vworld.kr/req/search', url, origin);
    }

    if (url.pathname === '/api/ladfrlList') {
      return proxyRequest('https://api.vworld.kr/ned/data/ladfrlList', url, origin);
    }

    // Serve static assets from Pages for all other routes
    return env.ASSETS.fetch(request);
  },
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

async function proxyRequest(targetBase, incomingUrl, origin) {
  const targetUrl = new URL(targetBase);
  incomingUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  const upstream = await fetch(targetUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const text = await upstream.text();
  const headers = new Headers(corsHeaders(origin));
  headers.set('Content-Type', 'application/json; charset=UTF-8');

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({
        error: 'Upstream request failed',
        status: upstream.status,
        body: text.slice(0, 200),
      }),
      { status: upstream.status, headers }
    );
  }

  if (text.trim().startsWith('<')) {
    return new Response(
      JSON.stringify({
        error: 'Non-JSON response from upstream',
        status: upstream.status,
      }),
      { status: 502, headers }
    );
  }

  return new Response(text, {
    status: upstream.status,
    headers,
  });
}
