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

    return new Response('Not Found', { status: 404 });
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
  });

  const headers = new Headers(upstream.headers);
  const cors = corsHeaders(origin);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
