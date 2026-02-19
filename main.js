const form = document.getElementById('searchForm');
const apiKeyInput = document.getElementById('apiKey');
const domainInput = document.getElementById('domain');
const roadInput = document.getElementById('roadAddress');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');

const pnuBadge = document.getElementById('pnuBadge');
const ldCodeNmEl = document.getElementById('ldCodeNm');
const lndpclArEl = document.getElementById('lndpclAr');
const posesnSeCodeNmEl = document.getElementById('posesnSeCodeNm');
const cnrsPsnCoEl = document.getElementById('cnrsPsnCo');
const detailHint = document.getElementById('detailHint');

const SEARCH_ENDPOINT = '/api/search';
const LADFRL_ENDPOINT = '/api/ladfrlList';

const formatNumber = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? '-';
  return num.toLocaleString('ko-KR');
};

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c0392b' : '#51657a';
};

const setResult = ({ pnu, ldCodeNm, lndpclAr, posesnSeCodeNm, cnrsPsnCo }) => {
  pnuBadge.textContent = `PNU: ${pnu ?? '-'}`;
  ldCodeNmEl.textContent = ldCodeNm ?? '-';
  lndpclArEl.textContent = lndpclAr ? `${formatNumber(lndpclAr)} ㎡` : '-';
  posesnSeCodeNmEl.textContent = posesnSeCodeNm ?? '-';
  cnrsPsnCoEl.textContent = cnrsPsnCo ? `${formatNumber(cnrsPsnCo)} 명` : '-';
  detailHint.textContent = pnu ? 'PNU 변환 성공. 토지·임야 정보를 표시했습니다.' : '도로명 주소를 입력하면 PNU를 변환해 표시합니다.';
};

const buildSearchParams = (params) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      searchParams.append(key, value);
    }
  });
  return searchParams.toString();
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('JSON이 아닌 응답을 받았습니다. 배포된 Worker가 적용되었는지 확인해 주세요.');
  }
};

const fetchPnuFromRoadAddress = async ({ query, key }) => {
  const params = buildSearchParams({
    service: 'search',
    request: 'search',
    version: '2.0',
    format: 'json',
    errorFormat: 'json',
    size: 10,
    page: 1,
    query,
    type: 'address',
    category: 'road',
    key,
  });

  const response = await fetch(`${SEARCH_ENDPOINT}?${params}`);
  const data = await parseJsonResponse(response);

  if (!response.ok || data?.response?.status !== 'OK') {
    const message = data?.error ?? '주소 검색 API 응답이 올바르지 않습니다.';
    throw new Error(message);
  }

  const items = data.response?.result?.items ?? [];
  if (!items.length) {
    throw new Error('검색 결과가 없습니다. 다른 주소로 시도해 주세요.');
  }

  const pnu = items[0]?.id;
  if (!pnu) {
    throw new Error('PNU 값을 찾지 못했습니다.');
  }

  return pnu;
};

const fetchLandInfo = async ({ pnu, key, domain }) => {
  const params = buildSearchParams({
    key,
    pnu,
    format: 'json',
    numOfRows: 1,
    pageNo: 1,
    domain,
  });

  const response = await fetch(`${LADFRL_ENDPOINT}?${params}`);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const message = data?.error ?? '토지임야 API 응답이 올바르지 않습니다.';
    throw new Error(message);
  }

  const record = data?.ladfrlList?.[0] ?? data?.response?.body?.items?.item ?? data?.items?.[0];
  if (!record) {
    throw new Error('토지임야 정보가 없습니다.');
  }

  return {
    pnu: record.pnu,
    ldCodeNm: record.ldCodeNm,
    lndpclAr: record.lndpclAr,
    posesnSeCodeNm: record.posesnSeCodeNm,
    cnrsPsnCo: record.cnrsPsnCo,
  };
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const roadAddress = roadInput.value.trim();
  const domain = domainInput.value.trim();

  if (!apiKey || !roadAddress) {
    setStatus('API 키와 도로명 주소를 입력해 주세요.', true);
    return;
  }

  submitBtn.disabled = true;
  setStatus('주소 검색 중...');

  try {
    const pnu = await fetchPnuFromRoadAddress({ query: roadAddress, key: apiKey });
    setStatus('PNU 변환 완료. 토지임야 정보를 조회합니다.');
    const landInfo = await fetchLandInfo({ pnu, key: apiKey, domain });
    setResult(landInfo);
    setStatus('조회가 완료되었습니다.');
  } catch (error) {
    setResult({});
    setStatus(error.message ?? '조회 중 오류가 발생했습니다.', true);
  } finally {
    submitBtn.disabled = false;
  }
});
