const SEARCH_BASE = 'https://api.vworld.kr/req/search';
const LADFRL_BASE = 'https://api.vworld.kr/ned/data/ladfrlList';

// 🔒 고정 도메인 (API 등록 도메인과 동일)
const FIXED_ORIGIN = 'https://web-toji.pages.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/search')) {
      return proxyRequest(SEARCH_BASE, url);
    }

    if (url.pathname.startsWith('/api/ladfrlList')) {
      return proxyRequest(LADFRL_BASE, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function proxyRequest(targetBase, incomingUrl) {
  const targetUrl = new URL(targetBase);

  // 쿼리 파라미터 그대로 전달
  incomingUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Referer: `${FIXED_ORIGIN}/`,
        Origin: FIXED_ORIGIN,
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Upstream request failed',
        detail: error.message,
      }),
      { status: 500 }
    );
  }
}
