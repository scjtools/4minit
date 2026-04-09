const NEWSLETTERS_DATA_URL = '/assets/data/newsletters.json';
const LATEST_NEWSLETTER_LIMIT = 6;

async function loadPartial(targetId, url) {
  const target = document.getElementById(targetId);
  if (!target) return;

  try {
    const response = await fetch(url, { credentials: 'same-origin' });

    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }

    target.innerHTML = await response.text();
  } catch (error) {
    console.error(error);
    target.innerHTML = '';
  }
}

async function loadPartials() {
  await Promise.all([
    loadPartial('header', '/assets/partials/header.html'),
    loadPartial('footer', '/assets/partials/footer.html')
  ]);
}

function setupSubscribeForm() {
  const emailInput = document.getElementById('emailInput');
  const subscribeForm = document.getElementById('subscribeForm');
  const subBtn = document.getElementById('subBtn');
  const formWrap = document.getElementById('formWrap');
  const msgSuccess = document.getElementById('msgSuccess');
  const msgError = document.getElementById('msgError');

  if (!emailInput || !subscribeForm || !subBtn || !formWrap || !msgSuccess || !msgError) {
    return;
  }

  async function subscribe() {
    const trap = document.getElementById('_trap')?.value || '';
    const email = emailInput.value.trim();

    emailInput.classList.remove('error');
    msgError.classList.add('hidden');
    msgSuccess.classList.add('hidden');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.classList.add('error');
      emailInput.focus();
      return;
    }

    subBtn.disabled = true;
    subBtn.textContent = 'Subscribing…';

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, _trap: trap })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      formWrap.classList.add('hidden');
      msgSuccess.classList.remove('hidden');
    } catch (error) {
      console.error('Subscription failed:', error);
      msgError.classList.remove('hidden');
      subBtn.disabled = false;
      subBtn.textContent = 'Subscribe for FREE';
    }
  }

  subscribeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    subscribe();
  });

  emailInput.addEventListener('input', function () {
    this.classList.remove('error');
  });
}

function setupScrollProgress() {
  const progressBar = document.getElementById('myBar');
  if (!progressBar) return;

  window.addEventListener('scroll', function () {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
    progressBar.style.width = `${scrolled}%`;
  }, { passive: true });
}

function formatEditionDate(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function normaliseNewsletterItem(item = {}) {
  const date = item.date || '';
  const explicitUrl = item.url || '';
  const title = item.title || 'Untitled edition';
  const summary = item.summary || item.excerpt || '';
  const url = explicitUrl || (date ? `/newsletters/${date}.html` : '/newsletters');

  return {
    date,
    title,
    summary,
    url
  };
}

function compareNewsletterDatesDesc(a, b) {
  const dateA = new Date(a.date);
  const dateB = new Date(b.date);

  const timeA = Number.isNaN(dateA.getTime()) ? 0 : dateA.getTime();
  const timeB = Number.isNaN(dateB.getTime()) ? 0 : dateB.getTime();

  return timeB - timeA;
}

async function fetchNewsletters() {
  const response = await fetch(NEWSLETTERS_DATA_URL, {
    credentials: 'same-origin'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch newsletters.json: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('newsletters.json must contain an array');
  }

  return data
    .map(normaliseNewsletterItem)
    .filter(item => item.date && item.title)
    .sort(compareNewsletterDatesDesc);
}

function createEditionCard(item, isLatest = false) {
  const template = document.getElementById('editionCardTemplate');

  if (!template) {
    return '';
  }

  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.edition-card');
  const dateEl = fragment.querySelector('.edition-date');
  const latestBadge = fragment.querySelector('.badge-latest');
  const titleEl = fragment.querySelector('.edition-title');
  const summaryEl = fragment.querySelector('.edition-summary');
  const ctaEl = fragment.querySelector('.edition-cta');

  dateEl.textContent = formatEditionDate(item.date);
  titleEl.textContent = item.title;
  summaryEl.textContent = item.summary;
  ctaEl.href = item.url;

  if (isLatest && latestBadge) {
    latestBadge.classList.remove('hidden');
  }

  if (item.title) {
    card.setAttribute('aria-label', item.title);
  }

  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

async function loadLatestEditions() {
  const grid = document.getElementById('editionGrid');
  if (!grid) return;

  grid.setAttribute('aria-busy', 'true');

  try {
    const latestEditions = (await fetchNewsletters()).slice(0, LATEST_NEWSLETTER_LIMIT);

    if (!latestEditions.length) {
      grid.innerHTML = '<p class="edition-grid-status">No editions published yet.</p>';
      grid.setAttribute('aria-busy', 'false');
      return;
    }

    grid.innerHTML = latestEditions
      .map((item, index) => createEditionCard(item, index === 0))
      .join('');

    grid.setAttribute('aria-busy', 'false');
  } catch (error) {
    console.error('Failed to load latest editions:', error);
    grid.innerHTML = '<p class="edition-grid-status">Unable to load the latest editions right now.</p>';
    grid.setAttribute('aria-busy', 'false');
  }
}

async function loadNewsletterArchive() {
  const grid = document.getElementById('archiveGrid');
  if (!grid) return;

  grid.setAttribute('aria-busy', 'true');

  try {
    const editions = await fetchNewsletters();

    if (!editions.length) {
      grid.innerHTML = '<p class="edition-grid-status">No editions published yet.</p>';
      grid.setAttribute('aria-busy', 'false');
      return;
    }

    grid.innerHTML = editions
      .map((item, index) => createEditionCard(item, index === 0))
      .join('');
    grid.setAttribute('aria-busy', 'false');
  } catch (error) {
    console.error('Failed to load newsletter archive:', error);
    grid.innerHTML = '<p class="edition-grid-status">Unable to load the newsletter archive right now.</p>';
    grid.setAttribute('aria-busy', 'false');
  }
}

function setupHeaderSubscribeLink() {
  const subscribeLink = document.querySelector('[data-subscribe-link]');
  if (!subscribeLink) return;
  subscribeLink.setAttribute('href', '/#subscribe');
}

document.addEventListener('DOMContentLoaded', async function () {
  await loadPartials();
  setupHeaderSubscribeLink();
  setupSubscribeForm();
  setupScrollProgress();
  await loadLatestEditions();
  await loadNewsletterArchive();
});