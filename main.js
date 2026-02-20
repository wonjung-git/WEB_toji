// 🔒 고정값 (네가 준 값 그대로)
const FIXED_API_KEY = '588C7DD7-726F-3C0E-96D3-D04FF29060FB';
const FIXED_DOMAIN_HOST = 'web-toji.pages.dev'; // hostname만

// VWorld 엔드포인트 (직접 호출)
const VWORLD_SEARCH_URL = 'https://api.vworld.kr/req/search';
const VWORLD_LADFRL_URL = 'https://api.vworld.kr/ned/data/ladfrlList';

// === UI 요소들 (네 HTML에 맞춰 ID를 조정해야 할 수도 있음) ===
const form = document.getElementById('land-form') || document.getElementById('searchForm');
const roadInput = document.getElementById('roadAddress');

const resultSection = document.getElementById('result-section');
const resultContent = document.getElementById('result-content');

const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');

const loader = document.getElementById('loader');

const showLoader = () => loader && loader.classList.remove('hidden');
const hideLoader = () => loader && loader.classList.add('hidden');

const showError = (message) => {
  if (errorMessage) errorMessage.textContent = message;
  if (errorSection) errorSection.classList.remove('hidden');
  if (resultSection) resultSection.classList.add('hidden');
};

const showResult = (html) => {
  if (resultContent) resultContent.innerHTML = html;
  if (resultSection) resultSection.classList.remove('hidden');
  if (errorSection) errorSection.classList.add('hidden');
};

// === JSONP 유틸 (CORS 없이 GET 가능) ===
function jsonp(url, params = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const callbackName = `__jsonp_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const qs = new URLSearchParams(params);
    qs.set('callback', callbackName); // jQuery jsonp가 기본으로 쓰는 callback 파라미터와 동일 패턴

    const script = document.createElement('script');
    script.src = `${url}?${qs.toString()}`;
    script.async = true;

    let timer = setTimeout(() => {
      cleanup();
      reject(new Error('VWorld JSONP 요청이 시간 초과되었습니다.'));
    }, timeoutMs);

    function cleanup() {
      if (timer) clearTimeout(timer);
      timer = null;
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('VWorld JSONP 스크립트 로드에 실패했습니다.'));
    };

    document.body.appendChild(script);
  });
}

// 1) 도로명 주소 → PNU
async function fetchPnuFromRoadAddress(roadAddress) {
  const data = await jsonp(VWORLD_SEARCH_URL, {
    service: 'search',
    request: 'search',
    version: '2.0',
    format: 'json',
    errorFormat: 'json',
    size: 10,
    page: 1,
    query: roadAddress,
    type: 'address',
    category: 'road',
    key: FIXED_API_KEY,
    domain: FIXED_DOMAIN_HOST,
  });

  if (data?.response?.status !== 'OK') {
    const msg = data?.response?.error?.text || data?.error || '주소 검색이 실패했습니다.';
    throw new Error(msg);
  }

  const items = data?.response?.result?.items || [];
  if (!items.length) throw new Error('검색 결과가 없습니다.');

  const pnu = items[0]?.id;
  if (!pnu) throw new Error('PNU를 찾지 못했습니다.');

  return pnu;
}

// 2) PNU → 토지/임야 정보(예: 지목/면적 등)
// ※ ladfrlList 응답 필드 구조는 케이스별로 다를 수 있어 널널하게 파싱
async function fetchLandInfo(pnu) {
  const data = await jsonp(VWORLD_LADFRL_URL, {
    key: FIXED_API_KEY,
    domain: FIXED_DOMAIN_HOST,
    pnu,
    format: 'json',
    numOfRows: 1,
    pageNo: 1,
  });

  // 케이스별 파싱
  const item =
    data?.ladfrlList?.[0] ||
    data?.response?.body?.items?.item ||
    data?.items?.[0];

  if (!item) throw new Error('토지/임야 정보를 찾지 못했습니다.');

  return item;
}

// === submit ===
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const roadAddress = (roadInput?.value || '').trim();
  if (!roadAddress) {
    showError('도로명 주소를 입력하세요.');
    return;
  }

  showLoader();
  if (errorSection) errorSection.classList.add('hidden');
  if (resultSection) resultSection.classList.add('hidden');

  try {
    const pnu = await fetchPnuFromRoadAddress(roadAddress);
    const info = await fetchLandInfo(pnu);

    const html = `
      <p><strong>PNU:</strong> ${pnu}</p>
      <p><strong>지번:</strong> ${info.jibun || '-'}</p>
      <p><strong>지목:</strong> ${info.ldCodeNm || info.lndcgrCodeNm || '-'}</p>
      <p><strong>면적:</strong> ${info.lndpclAr ? `${info.lndpclAr}㎡` : '-'}</p>
      <p><strong>공시지가:</strong> ${info.pblntfPc ? `${info.pblntfPc}원` : '-'}</p>
    `;

    showResult(html);
  } catch (err) {
    console.error(err);
    showError(err?.message || '알 수 없는 오류가 발생했습니다.');
  } finally {
    hideLoader();
  }
});