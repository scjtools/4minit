(function () {
  'use strict';

  const form       = document.getElementById('unsubscribeForm');
  const emailInput = document.getElementById('emailInput');
  const button     = document.getElementById('unsubBtn');
  const formWrap   = document.getElementById('formWrap');
  const msgSuccess = document.getElementById('msgSuccess');
  const msgError   = document.getElementById('msgError');

  if (!form) return;

  // Pre-fill from ?email= query param (set by newsletter unsubscribe link)
  const params       = new URLSearchParams(window.location.search);
  const emailFromUrl = params.get('email');
  if (emailFromUrl) emailInput.value = emailFromUrl;

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const email = emailInput.value.trim();
    emailInput.classList.remove('error');
    msgSuccess.classList.add('hidden');
    msgError.classList.add('hidden');

    if (!email || !isValidEmail(email)) {
      emailInput.classList.add('error');
      emailInput.focus();
      return;
    }

    button.disabled    = true;
    button.textContent = 'Unsubscribing...';

    try {
      const response = await fetch('/api/unsubscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) throw new Error();

      formWrap.classList.add('hidden');
      msgSuccess.classList.remove('hidden');

    } catch {
      msgError.classList.remove('hidden');
      button.disabled    = false;
      button.textContent = 'Unsubscribe';
    }
  });

  emailInput.addEventListener('input', function () {
    emailInput.classList.remove('error');
    msgError.classList.add('hidden');
  });
})();
