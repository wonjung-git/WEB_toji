const SEARCH_ENDPOINT = '/api/search';
const DATA_ENDPOINT = '/api/data';

// 🔒 고정값
const FIXED_API_KEY = '588C7DD7-726F-3C0E-96D3-D04FF29060FB';
const FIXED_DOMAIN = 'web-toji.pages.dev';

const form = document.getElementById('land-form');
const resultSection = document.getElementById('result-section');
const resultContent = document.getElementById('result-content');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const loader = document.getElementById('loader');

const showLoader = () => loader.classList.remove('hidden');
const hideLoader = () => loader.classList.add('hidden');

const showError = (message) => {
  errorMessage.textContent = message;
  errorSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
};

const showResult = (html) => {
  resultContent.innerHTML = html;
  resultSection.classList.remove('hidden');
  errorSection.classList.add('hidden');
};

const buildSearchParams = (params) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value);
    }
  });
  return searchParams.toString();
};

// 도로명 → PNU 조회
const fetchPnuFromRoadAddress = async (query) => {
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
    key: FIXED_API_KEY,
    domain: FIXED_DOMAIN, // 🔒 고정
  });

  const response = await fetch(`${SEARCH_ENDPOINT}?${params}`);
  if (!response.ok) {
    throw new Error(`주소 검색 API 오류 (status: ${response.status})`);
  }

  const data = await response.json();
  const items = data?.response?.result?.items;

  if (!items || items.length === 0) {
    throw new Error('입력한 도로명 주소로 검색 결과를 찾을 수 없습니다.');
  }

  return items[0].id;
};

// 토지 정보 조회
const fetchLandInfo = async (pnu) => {
  const params = buildSearchParams({
    service: 'data',
    request: 'GetFeature',
    data: 'LP_PA_CBND_BUBUN',
    key: FIXED_API_KEY,
    domain: FIXED_DOMAIN, // 🔒 고정
    attrFilter: `pnu:like:${pnu}`,
  });

  const response = await fetch(`${DATA_ENDPOINT}?${params}`);
  if (!response.ok) {
    throw new Error(`토지 조회 API 오류 (status: ${response.status})`);
  }

  return await response.json();
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const roadAddress = document.getElementById('roadAddress').value.trim();

  if (!roadAddress) {
    showError('도로명 주소를 입력하세요.');
    return;
  }

  showLoader();
  errorSection.classList.add('hidden');
  resultSection.classList.add('hidden');

  try {
    const pnu = await fetchPnuFromRoadAddress(roadAddress);
    const landData = await fetchLandInfo(pnu);

    const features = landData?.response?.result?.featureCollection?.features;
    if (!features || features.length === 0) {
      throw new Error('해당 주소에 대한 토지 정보를 찾을 수 없습니다.');
    }

    const properties = features[0].properties;

    const html = `
      <p><strong>지번:</strong> ${properties.jibun || '-'}</p>
      <p><strong>지목:</strong> ${properties.lndcgrCodeNm || '-'}</p>
      <p><strong>면적:</strong> ${properties.lndpclAr || '-'}㎡</p>
      <p><strong>공시지가:</strong> ${properties.pblntfPc || '-'}원</p>
    `;

    showResult(html);
  } catch (error) {
    console.error(error);
    showError(error.message || '알 수 없는 오류가 발생했습니다.');
  } finally {
    hideLoader();
  }
});