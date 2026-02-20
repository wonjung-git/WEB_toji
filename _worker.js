const SEARCH_BASE = 'https://api.vworld.kr/req/search';
const LADFRL_BASE = 'https://api.vworld.kr/ned/data/ladfrlList';

// 🔒 고정(등록한 도메인)
const FIXED_ORIGIN = 'https://web-toji.pages.dev';
const FIXED_DOMAIN_HOST = 'web-toji.pages.dev';

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      if (url.pathname.startsWith('/api/search')) {
        return proxyRequest(SEARCH_BASE, url);
      }

      if (url.pathname.startsWith('/api/ladfrlList')) {
        return proxyRequest(LADFRL_BASE, url);
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      return jsonError(500, 'Worker runtime error', err?.message);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(status, error, detail) {
  return new Response(JSON.stringify({ error, detail }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...corsHeaders() },
  });
}

function normalizeDomainToHost(value) {
  if (!value) return FIXED_DOMAIN_HOST;
  const v = String(value).trim();
  if (!v) return FIXED_DOMAIN_HOST;

  try {
    // https://web-toji.pages.dev/ -> web-toji.pages.dev
    return new URL(v).hostname;
  } catch {
    // web-toji.pages.dev/ -> web-toji.pages.dev
    return v.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
}

async function proxyRequest(targetBase, incomingUrl) {
  const targetUrl = new URL(targetBase);

  // 쿼리 파라미터 전달 (단, domain은 hostname으로 강제)
  incomingUrl.searchParams.forEach((value, key) => {
    if (key === 'domain') {
      targetUrl.searchParams.set('domain', normalizeDomainToHost(value));
    } else {
      targetUrl.searchParams.set(key, value);
    }
  });

  // 혹시 domain이 아예 없으면 고정값 세팅
  if (!targetUrl.searchParams.get('domain')) {
    targetUrl.searchParams.set('domain', FIXED_DOMAIN_HOST);
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Referer: `${FIXED_ORIGIN}/`,
      },
    });

    const text = await upstream.text();

    // 업스트림이 HTML(에러 페이지) 주면 그대로 내려주되,
    // 프론트에서 JSON 파싱 에러가 나니 status/본문을 함께 볼 수 있게 error JSON으로 바꿔줌
    const contentType = upstream.headers.get('content-type') || '';
    const looksLikeHtml = text.trim().startsWith('<') || contentType.includes('text/html');

    if (!upstream.ok || looksLikeHtml) {
      return jsonError(
        upstream.status || 502,
        'Upstream error',
        looksLikeHtml ? 'Upstream returned HTML (likely blocked/invalid domain/key)' : text.slice(0, 300)
      );
    }

    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', ...corsHeaders() },
    });
  } catch (error) {
    return jsonError(500, 'Upstream request failed', error?.message);
  }
}