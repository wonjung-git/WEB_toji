const DEBUG = true;
const dlog = (...args) => DEBUG && console.log('[DBG]', ...args);

// 🔒 고정값: 도메인은 고정 (UI 비노출)
const FIXED_DOMAIN_HOST = 'web-toji.pages.dev'; // hostname만
const API_KEY_STORAGE_KEY = 'vworld_api_key';

// VWorld 엔드포인트 (직접 호출)
const VWORLD_SEARCH_URL = 'https://api.vworld.kr/req/search';
const VWORLD_LADFRL_URL = 'https://api.vworld.kr/ned/data/ladfrlList';
const VWORLD_INDVD_PRICE_URL = 'https://api.vworld.kr/ned/data/getIndvdLandPrice';

// === UI 요소들 (네 HTML에 맞춰 ID를 조정해야 할 수도 있음) ===
const form = document.getElementById('land-form') || document.getElementById('searchForm');
const apiKeyInput = document.getElementById('apiKey');
const roadInput = document.getElementById('roadAddress');

const resultSection = document.querySelector('.result');
const pnuBadge = document.getElementById('pnuBadge');
const ldCodeNmEl = document.getElementById('ldCodeNm');
const prposAreaDisplayEl = document.getElementById('prposAreaDisplay');
const lndpclArEl = document.getElementById('lndpclAr');
const ladPblntfPclndEl = document.getElementById('ladPblntfPclnd');
const posesnSeCodeNmEl = document.getElementById('posesnSeCodeNm');
const cnrsPsnCoEl = document.getElementById('cnrsPsnCo');
const mnnmSlnoEl = document.getElementById('mnnmSlno');
const detailHint = document.getElementById('detailHint');
const statusEl = document.getElementById('status');

const loader = document.getElementById('loader');

const showLoader = () => loader && loader.classList.remove('hidden');
const hideLoader = () => loader && loader.classList.add('hidden');

const showError = (message) => {
  if (statusEl) statusEl.textContent = message;
  if (detailHint) detailHint.textContent = '조회 중 오류가 발생했습니다.';
};

const showResult = (data) => {
  const { pnu, info, priceInfo } = data;
  const areaName = priceInfo?.prposAreaNm || '-';
  const dstrcName = priceInfo?.prposDstrcNm || '';
  const areaDisplay =
    areaName !== '-' ? `${areaName}${dstrcName ? ` (${dstrcName})` : ''}` : '-';

  let priceDisplay = '-';
  if (priceInfo?.ladPblntfPclnd != null && priceInfo?.ladPblntfPclnd !== '') {
    const priceNum = Number(priceInfo.ladPblntfPclnd);
    priceDisplay = Number.isFinite(priceNum)
      ? priceNum.toLocaleString('ko-KR')
      : `${priceInfo.ladPblntfPclnd}`;
  }

  if (pnuBadge) pnuBadge.textContent = `PNU: ${pnu || '-'}`;
  if (ldCodeNmEl) ldCodeNmEl.textContent = info.ldCodeNm || '-';
  if (prposAreaDisplayEl) prposAreaDisplayEl.textContent = areaDisplay;
  if (lndpclArEl) lndpclArEl.textContent = info.lndpclAr ? `${info.lndpclAr}` : '-';
  if (ladPblntfPclndEl) ladPblntfPclndEl.textContent = priceDisplay;
  if (posesnSeCodeNmEl) posesnSeCodeNmEl.textContent = info.posesnSeCodeNm || '-';
  if (cnrsPsnCoEl) cnrsPsnCoEl.textContent = info.cnrsPsnCo ?? '-';
  if (mnnmSlnoEl) mnnmSlnoEl.textContent = info.mnnmSlno || '-';
  if (detailHint) detailHint.textContent = '조회 결과가 표시되었습니다.';
  if (statusEl) statusEl.textContent = '';

  dlog('showResult targets:', {
    resultSection: !!resultSection,
    pnuBadge: !!pnuBadge,
  });
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
async function fetchPnuFromRoadAddress(roadAddress, apiKey) {
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
    key: apiKey,
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
async function fetchLandInfo(pnu, apiKey) {
  const data = await jsonp(VWORLD_LADFRL_URL, {
    key: apiKey,
    domain: FIXED_DOMAIN_HOST,
    pnu,
    format: 'json',
    numOfRows: 1,
    pageNo: 1,
  });

  // ✅ VWorld ladfrlList 실제 응답 구조 대응
  const item =
    data?.ladfrlVOList?.ladfrlVOList?.[0] || // <- 너가 받은 실제 구조
    data?.ladfrlList?.[0] ||
    data?.response?.body?.items?.item ||
    data?.items?.[0];

  if (!item) throw new Error('토지/임야 정보를 찾지 못했습니다.');

  return item;
}

// 3) PNU → 공시지가/용도지역
async function fetchLandPriceInfo(pnu, apiKey) {
  const ldCode = (pnu || '').slice(0, 10);
  if (ldCode.length < 2) throw new Error('법정동코드를 만들 수 없습니다.');

  const currentYear = new Date().getFullYear();
  const yearCandidates = [
    currentYear,
    currentYear - 1,
    currentYear - 2,
    currentYear - 3,
    currentYear - 4,
  ];

  for (const stdrYear of yearCandidates) {
    const data = await jsonp(VWORLD_INDVD_PRICE_URL, {
      key: apiKey,
      domain: FIXED_DOMAIN_HOST,
      stdrYear,
      reqLvl: 3,
      ldCode,
      format: 'json',
      numOfRows: 1,
      pageNo: 1,
    });

    const item =
      data?.statelndvdLandPrices?.field?.[0] ||
      data?.indvdLandPriceList?.indvdLandPriceList?.[0] ||
      data?.indvdLandPriceList?.[0] ||
      data?.response?.body?.items?.item?.[0] ||
      data?.response?.body?.items?.item ||
      data?.items?.[0];

    if (item) return item;
  }

  throw new Error('공시지가 정보를 찾지 못했습니다.');
}

// === submit ===
if (!form) {
  console.error('폼 ID를 찾지 못했습니다. land-form 또는 searchForm 확인 필요');
} else {
  // 저장된 키를 자동 채움
  if (apiKeyInput) {
    const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (savedKey) apiKeyInput.value = savedKey;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    dlog('submit fired');
    dlog('roadInput exists?', !!roadInput, 'value=', roadInput?.value);

    const apiKey = (apiKeyInput?.value || '').trim();
    const roadAddress = (roadInput?.value || '').trim();

    if (!apiKey) {
      showError('VWorld API Key를 입력하세요.');
      return;
    }
    if (!roadAddress) {
      showError('도로명 주소를 입력하세요.');
      return;
    }

    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

    showLoader();
    if (statusEl) statusEl.textContent = '';

    try {
      dlog('fetchPnuFromRoadAddress start');
      const pnu = await fetchPnuFromRoadAddress(roadAddress, apiKey);
      dlog('pnu=', pnu);

      dlog('fetchLandInfo start');
      const info = await fetchLandInfo(pnu, apiKey);
      dlog('info=', info);

      let priceInfo = null;
      try {
        dlog('fetchLandPriceInfo start');
        priceInfo = await fetchLandPriceInfo(pnu, apiKey);
        dlog('priceInfo=', priceInfo);
      } catch (err) {
        console.error(err);
      }

      showResult({ pnu, info, priceInfo });
    } catch (err) {
      console.error(err);
      showError(err?.message || '알 수 없는 오류가 발생했습니다.');
    } finally {
      hideLoader();
    }
  });
}
