(function() {
  'use strict';

  // -- Helpers --

  /**
   * Adds ripple effect to all buttons.
   */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.setProperty('--x', (e.clientX - rect.left) + 'px');
    ripple.style.setProperty('--y', (e.clientY - rect.top) + 'px');
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });

  /**
   * Shows a toast notification.
   * @param {string=} msg
   */
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg || 'Copied!';
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 1500);
  }

  /**
   * Copies text to clipboard and shows toast.
   * @param {string} text
   */
  function copyText(text) {
    navigator.clipboard.writeText(text);
    showToast();
  }

  /**
   * Displays a status message.
   * @param {!HTMLElement} el
   * @param {string} msg
   * @param {boolean} isOk
   */
  function showStatus(el, msg, isOk) {
    el.textContent = msg;
    el.className = 'status is-visible' + (isOk ? ' is-ok' : '');
  }

  // -- Navigation --

  const toolGrid = document.getElementById('tool-grid');

  document.querySelectorAll('.tool-card').forEach((card) => {
    card.addEventListener('click', () => {
      toolGrid.style.opacity = '0';
      toolGrid.style.transform = 'scale(.98)';
      toolGrid.style.transition = 'opacity .15s, transform .15s';
      setTimeout(() => {
        toolGrid.style.display = 'none';
        document.querySelectorAll('.tool-panel').forEach((p) => p.classList.remove('is-open'));
        const panel = document.getElementById('panel-' + card.dataset.tool);
        if (panel) {
          panel.classList.add('is-open');
        }
      }, 150);
    });
  });

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const openPanel = document.querySelector('.tool-panel.is-open');
      if (openPanel) {
        openPanel.style.opacity = '0';
        openPanel.style.transform = 'translateY(-8px)';
        openPanel.style.transition = 'opacity .15s, transform .15s';
        setTimeout(() => {
          openPanel.style.opacity = '';
          openPanel.style.transform = '';
          openPanel.style.transition = '';
          document.querySelectorAll('.tool-panel').forEach((p) => p.classList.remove('is-open'));
          toolGrid.style.display = '';
          toolGrid.style.opacity = '';
          toolGrid.style.transform = '';
          // Re-trigger card animations
          toolGrid.querySelectorAll('.tool-card').forEach((c) => {
            c.style.animation = 'none';
            void c.offsetWidth;
            c.style.animation = '';
          });
        }, 150);
      }
    });
  });

  // ============================================================
  // 1. FILE UPLOAD
  // ============================================================

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadStatus = document.getElementById('upload-status');
  const uploadResult = document.getElementById('upload-result');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-dragover');
    if (e.dataTransfer.files.length) {
      handleUpload(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      handleUpload(fileInput.files[0]);
    }
  });

  /**
   * @param {!File} file
   */
  async function handleUpload(file) {
    const apiKey = document.getElementById('api-key').value.trim();
    if (!apiKey) {
      showStatus(uploadStatus, 'Please enter API key', false);
      return;
    }
    showStatus(uploadStatus, 'Uploading...', true);
    uploadResult.classList.remove('is-visible');
    // Add progress bar animation
    const progressBar = document.createElement('div');
    progressBar.className = 'upload-progress';
    dropZone.appendChild(progressBar);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/upload', {method: 'POST', headers: {'X-API-Key': apiKey}, body: formData});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      document.getElementById('result-url').href = data.url;
      document.getElementById('result-url').textContent = data.url;
      document.getElementById('result-delete').href = data.delete_url;
      document.getElementById('result-delete').textContent = data.delete_url;
      uploadResult.classList.add('is-visible');
      uploadStatus.classList.remove('is-visible');
      progressBar.remove();
    } catch (err) {
      showStatus(uploadStatus, err.message, false);
      progressBar.remove();
    }
  }

  // ============================================================
  // 2. TIMEZONE
  // ============================================================

  const TIMEZONES = [
    'UTC', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong',
    'Asia/Singapore', 'Asia/Seoul', 'Asia/Kolkata', 'Asia/Dubai',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Sao_Paulo',
    'Australia/Sydney', 'Pacific/Auckland',
  ];

  const tzFrom = document.getElementById('tz-from');
  const tzTo = document.getElementById('tz-to');
  TIMEZONES.forEach((tz) => { tzFrom.appendChild(new Option(tz, tz)); tzTo.appendChild(new Option(tz, tz)); });
  tzFrom.value = 'UTC';
  tzTo.value = 'Asia/Taipei';

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('tz-input').value =
      now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
      'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  document.getElementById('tz-convert').addEventListener('click', () => {
    const input = document.getElementById('tz-input').value;
    if (!input) return;
    const fromTz = tzFrom.value;
    const toTz = tzTo.value;
    const inputDate = new Date(input);
    const fromFormatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: fromTz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(inputDate).replace(',', '').replace(' ', 'T');
    const offset = inputDate - new Date(fromFormatted);
    const utcInstant = new Date(inputDate.getTime() + offset);
    const result = new Intl.DateTimeFormat('en-GB', {
      timeZone: toTz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short',
    }).format(utcInstant);
    document.getElementById('tz-output').textContent = result;
    document.getElementById('tz-sub').textContent = fromTz + ' \u2192 ' + toTz;
    document.getElementById('tz-result').classList.add('is-visible');
  });

  // ============================================================
  // 3. BASE64
  // ============================================================

  document.getElementById('b64-encode').addEventListener('click', () => {
    try {
      document.getElementById('b64-output').value = btoa(unescape(encodeURIComponent(document.getElementById('b64-input').value)));
      document.getElementById('b64-status').classList.remove('is-visible');
    } catch (e) { showStatus(document.getElementById('b64-status'), 'Encode failed: ' + e.message, false); }
  });

  document.getElementById('b64-decode').addEventListener('click', () => {
    try {
      document.getElementById('b64-output').value = decodeURIComponent(escape(atob(document.getElementById('b64-input').value)));
      document.getElementById('b64-status').classList.remove('is-visible');
    } catch (e) { showStatus(document.getElementById('b64-status'), 'Decode failed: invalid Base64', false); }
  });

  document.getElementById('b64-copy').addEventListener('click', () => {
    const v = document.getElementById('b64-output').value;
    if (v) copyText(v);
  });

  // ============================================================
  // 4. JSON FORMATTER
  // ============================================================

  document.getElementById('json-format').addEventListener('click', () => {
    try {
      const parsed = JSON.parse(document.getElementById('json-input').value);
      document.getElementById('json-output').value = JSON.stringify(parsed, null, 2);
      document.getElementById('json-status').classList.remove('is-visible');
    } catch (e) { showStatus(document.getElementById('json-status'), 'Invalid JSON: ' + e.message, false); }
  });

  document.getElementById('json-minify').addEventListener('click', () => {
    try {
      const parsed = JSON.parse(document.getElementById('json-input').value);
      document.getElementById('json-output').value = JSON.stringify(parsed);
      document.getElementById('json-status').classList.remove('is-visible');
    } catch (e) { showStatus(document.getElementById('json-status'), 'Invalid JSON: ' + e.message, false); }
  });

  document.getElementById('json-copy').addEventListener('click', () => {
    const v = document.getElementById('json-output').value;
    if (v) copyText(v);
  });

  // ============================================================
  // 5. URL ENCODER
  // ============================================================

  document.getElementById('url-encode').addEventListener('click', () => {
    document.getElementById('url-output').value = encodeURIComponent(document.getElementById('url-input').value);
  });

  document.getElementById('url-decode').addEventListener('click', () => {
    try {
      document.getElementById('url-output').value = decodeURIComponent(document.getElementById('url-input').value);
      document.getElementById('url-status').classList.remove('is-visible');
    } catch (e) { showStatus(document.getElementById('url-status'), 'Decode failed: ' + e.message, false); }
  });

  document.getElementById('url-copy').addEventListener('click', () => {
    const v = document.getElementById('url-output').value;
    if (v) copyText(v);
  });

  // ============================================================
  // 6. PASSWORD GENERATOR
  // ============================================================

  document.getElementById('pw-generate').addEventListener('click', () => {
    const length = Math.max(4, Math.min(128, parseInt(document.getElementById('pw-length').value, 10) || 16));
    let chars = '';
    if (document.getElementById('pw-upper').checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (document.getElementById('pw-lower').checked) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (document.getElementById('pw-digits').checked) chars += '0123456789';
    if (document.getElementById('pw-symbols').checked) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars[array[i] % chars.length];
    }
    // Scramble animation
    const display = document.getElementById('pw-display');
    display.classList.remove('is-flash');
    const scrambleChars = '!@#$%^&*0123456789ABCDEFabcdef';
    let frame = 0;
    const totalFrames = 8;
    const interval = setInterval(() => {
      frame++;
      let shown = '';
      for (let j = 0; j < password.length; j++) {
        shown += j < (password.length * frame / totalFrames)
          ? password[j]
          : scrambleChars[Math.random() * scrambleChars.length | 0];
      }
      display.textContent = shown;
      if (frame >= totalFrames) {
        clearInterval(interval);
        display.textContent = password;
        void display.offsetWidth;
        display.classList.add('is-flash');
      }
    }, 30);
  });

  document.getElementById('pw-copy').addEventListener('click', () => {
    const v = document.getElementById('pw-display').textContent;
    if (v && v !== 'Click Generate') copyText(v);
  });

  // ============================================================
  // 7. HASH GENERATOR
  // ============================================================

  document.getElementById('hash-generate').addEventListener('click', async () => {
    const input = document.getElementById('hash-input').value;
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const algorithms = ['SHA-1', 'SHA-256', 'SHA-512'];
    let html = '';
    for (const algo of algorithms) {
      const hashBuffer = await crypto.subtle.digest(algo, data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      html += '<div class="hash-value"><div class="hash-label">' + algo + '</div>' + hashHex + '</div>';
    }
    const output = document.getElementById('hash-output');
    output.classList.remove('is-fresh');
    output.innerHTML = html;
    output.style.display = 'block';
    void output.offsetWidth;
    output.classList.add('is-fresh');
  });

  // ============================================================
  // 8. COLOR CONVERTER
  // ============================================================

  const colorHex = document.getElementById('color-hex');
  const colorR = document.getElementById('color-r');
  const colorG = document.getElementById('color-g');
  const colorB = document.getElementById('color-b');
  const colorH = document.getElementById('color-h');
  const colorS = document.getElementById('color-s');
  const colorL = document.getElementById('color-l');
  const colorPreview = document.getElementById('color-preview');

  /**
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @return {!Array<number>} [h, s, l]
   */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, Math.round(l * 100)];
    const d = max - min;
    const s = l > .5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  /**
   * @param {number} h
   * @param {number} s
   * @param {number} l
   * @return {!Array<number>} [r, g, b]
   */
  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < .5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
  }

  /** Triggers color morph animation on preview. */
  function morphPreview() {
    colorPreview.classList.remove('is-morph');
    void colorPreview.offsetWidth;
    colorPreview.classList.add('is-morph');
  }

  /** Updates all fields from RGB values. */
  function syncFromRgb() {
    const r = parseInt(colorR.value, 10) || 0;
    const g = parseInt(colorG.value, 10) || 0;
    const b = parseInt(colorB.value, 10) || 0;
    colorHex.value = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
    const [h, s, l] = rgbToHsl(r, g, b);
    colorH.value = h; colorS.value = s; colorL.value = l;
    colorPreview.style.background = colorHex.value;
    morphPreview();
  }

  /** Updates all fields from HSL values. */
  function syncFromHsl() {
    const h = parseInt(colorH.value, 10) || 0;
    const s = parseInt(colorS.value, 10) || 0;
    const l = parseInt(colorL.value, 10) || 0;
    const [r, g, b] = hslToRgb(h, s, l);
    colorR.value = r; colorG.value = g; colorB.value = b;
    colorHex.value = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
    colorPreview.style.background = colorHex.value;
    morphPreview();
  }

  colorHex.addEventListener('input', () => {
    const hex = colorHex.value.replace('#', '');
    if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
      colorR.value = parseInt(hex.slice(0, 2), 16);
      colorG.value = parseInt(hex.slice(2, 4), 16);
      colorB.value = parseInt(hex.slice(4, 6), 16);
      const [h, s, l] = rgbToHsl(+colorR.value, +colorG.value, +colorB.value);
      colorH.value = h; colorS.value = s; colorL.value = l;
      colorPreview.style.background = '#' + hex;
    }
  });

  [colorR, colorG, colorB].forEach((el) => el.addEventListener('input', syncFromRgb));
  [colorH, colorS, colorL].forEach((el) => el.addEventListener('input', syncFromHsl));

  document.getElementById('color-copy').addEventListener('click', () => copyText(colorHex.value));

  // ============================================================
  // 9. WORD COUNTER
  // ============================================================

  /**
   * Updates a stat value with pop animation if changed.
   * @param {string} id
   * @param {string|number} value
   */
  function updateStat(id, value) {
    const el = document.getElementById(id);
    const strVal = String(value);
    if (el.textContent !== strVal) {
      el.textContent = strVal;
      el.classList.remove('is-pop');
      void el.offsetWidth;
      el.classList.add('is-pop');
    }
  }

  document.getElementById('wc-input').addEventListener('input', () => {
    const text = document.getElementById('wc-input').value;
    updateStat('wc-chars', text.length);
    updateStat('wc-words', text.trim() ? text.trim().split(/\s+/).length : 0);
    updateStat('wc-lines', text ? text.split('\n').length : 0);
    updateStat('wc-sentences', text.trim() ? (text.match(/[.!?]+/g) || []).length : 0);
  });

  // ============================================================
  // 10. UUID GENERATOR
  // ============================================================

  function generateUUID() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  document.getElementById('uuid-generate').addEventListener('click', () => {
    const count = Math.max(1, Math.min(50, parseInt(document.getElementById('uuid-count').value, 10) || 1));
    const uppercase = document.getElementById('uuid-uppercase').checked;
    const nodash = document.getElementById('uuid-nodash').checked;
    const uuids = [];
    for (let i = 0; i < count; i++) {
      let id = generateUUID();
      if (nodash) id = id.replace(/-/g, '');
      if (uppercase) id = id.toUpperCase();
      uuids.push(id);
    }
    const output = document.getElementById('uuid-output');
    output.value = uuids.join('\n');
    output.classList.remove('is-fresh');
    void output.offsetWidth;
    output.classList.add('is-fresh');
  });

  document.getElementById('uuid-copy').addEventListener('click', () => {
    const v = document.getElementById('uuid-output').value;
    if (v) copyText(v);
  });

  // ============================================================
  // 11. UNIX TIMESTAMP
  // ============================================================

  // Live clock
  let tsInterval;
  function startTsClock() {
    const el = document.getElementById('ts-live');
    function tick() {
      const now = Math.floor(Date.now() / 1000);
      el.textContent = now + '  \u2022  ' + new Date().toISOString();
    }
    tick();
    tsInterval = setInterval(tick, 1000);
  }

  // Start/stop clock when panel opens/closes
  const tsObserver = new MutationObserver(() => {
    const panel = document.getElementById('panel-timestamp');
    if (panel.classList.contains('is-open')) {
      startTsClock();
    } else if (tsInterval) {
      clearInterval(tsInterval);
    }
  });
  tsObserver.observe(document.getElementById('panel-timestamp'), { attributes: true, attributeFilter: ['class'] });

  document.getElementById('ts-to-date').addEventListener('click', () => {
    const input = document.getElementById('ts-input').value.trim();
    const ts = parseInt(input, 10);
    if (isNaN(ts)) {
      showStatus(document.getElementById('ts-status'), 'Invalid timestamp', false);
      return;
    }
    // Auto-detect milliseconds vs seconds
    const ms = input.length > 10 ? ts : ts * 1000;
    const date = new Date(ms);
    document.getElementById('ts-utc').textContent = date.toUTCString();
    document.getElementById('ts-local').textContent = date.toLocaleString();
    document.getElementById('ts-iso').textContent = date.toISOString();
    document.getElementById('ts-result').classList.add('is-visible');
    document.getElementById('ts-status').classList.remove('is-visible');
  });

  document.getElementById('ts-now').addEventListener('click', () => {
    document.getElementById('ts-input').value = Math.floor(Date.now() / 1000);
    document.getElementById('ts-to-date').click();
  });

  // Set default date-time input
  {
    const n = new Date();
    document.getElementById('ts-date-input').value =
      n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()) +
      'T' + pad(n.getHours()) + ':' + pad(n.getMinutes());
  }

  document.getElementById('ts-to-unix').addEventListener('click', () => {
    const input = document.getElementById('ts-date-input').value;
    if (!input) return;
    const ts = Math.floor(new Date(input).getTime() / 1000);
    document.getElementById('ts-unix-out').textContent = ts;
    document.getElementById('ts-unix-result').classList.add('is-visible');
  });

  document.getElementById('ts-copy-unix').addEventListener('click', () => {
    const v = document.getElementById('ts-unix-out').textContent;
    if (v) copyText(v);
  });

  // ============================================================
  // 12. LOREM IPSUM
  // ============================================================

  const LOREM_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');

  function randomLoremWords(count) {
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(LOREM_WORDS[Math.random() * LOREM_WORDS.length | 0]);
    }
    result[0] = result[0][0].toUpperCase() + result[0].slice(1);
    return result.join(' ');
  }

  function randomLoremSentence() {
    const len = 8 + (Math.random() * 12 | 0);
    return randomLoremWords(len) + '.';
  }

  function randomLoremParagraph() {
    const count = 3 + (Math.random() * 5 | 0);
    const sentences = [];
    for (let i = 0; i < count; i++) sentences.push(randomLoremSentence());
    return sentences.join(' ');
  }

  document.getElementById('lorem-generate').addEventListener('click', () => {
    const count = Math.max(1, Math.min(50, parseInt(document.getElementById('lorem-count').value, 10) || 3));
    const type = document.getElementById('lorem-type').value;
    let text = '';
    if (type === 'paragraphs') {
      const paras = [];
      for (let i = 0; i < count; i++) paras.push(randomLoremParagraph());
      text = paras.join('\n\n');
    } else if (type === 'sentences') {
      const sents = [];
      for (let i = 0; i < count; i++) sents.push(randomLoremSentence());
      text = sents.join(' ');
    } else {
      text = randomLoremWords(count) + '.';
    }
    document.getElementById('lorem-output').value = text;
  });

  document.getElementById('lorem-copy').addEventListener('click', () => {
    const v = document.getElementById('lorem-output').value;
    if (v) copyText(v);
  });

  // ============================================================
  // 13. REGEX TESTER
  // ============================================================

  function testRegex() {
    const patternStr = document.getElementById('regex-pattern').value;
    const flags = document.getElementById('regex-flags').value;
    const input = document.getElementById('regex-input').value;
    const output = document.getElementById('regex-output');
    const status = document.getElementById('regex-status');

    if (!patternStr) {
      output.innerHTML = '<span style="color:#555">Enter a pattern</span>';
      status.classList.remove('is-visible');
      return;
    }

    let regex;
    try {
      regex = new RegExp(patternStr, flags);
      status.classList.remove('is-visible');
    } catch (e) {
      output.innerHTML = '';
      showStatus(status, e.message, false);
      return;
    }

    const matches = [];
    let match;
    if (flags.includes('g')) {
      while ((match = regex.exec(input)) !== null) {
        matches.push({ text: match[0], index: match.index, groups: match.slice(1) });
        if (!match[0].length) regex.lastIndex++;
      }
    } else {
      match = regex.exec(input);
      if (match) matches.push({ text: match[0], index: match.index, groups: match.slice(1) });
    }

    if (!matches.length) {
      output.innerHTML = '<span style="color:#555">No matches</span>';
      return;
    }

    let html = '<div class="hash-label">' + matches.length + ' match' + (matches.length > 1 ? 'es' : '') + '</div>';
    matches.forEach((m, i) => {
      html += '<div class="hash-value" style="animation-delay:' + (i * .06) + 's">';
      html += '<span style="color:#666">[' + m.index + ']</span> ';
      html += '<span style="color:#7eb8ff">' + m.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
      if (m.groups.length) {
        html += ' <span style="color:#555">\u2192 groups: ' + m.groups.map((g, j) => '<span style="color:#4ade80">$' + (j + 1) + '=' + (g || '').replace(/</g, '&lt;') + '</span>').join(', ') + '</span>';
      }
      html += '</div>';
    });
    output.innerHTML = html;
    output.classList.remove('is-fresh');
    void output.offsetWidth;
    output.classList.add('is-fresh');
  }

  document.getElementById('regex-pattern').addEventListener('input', testRegex);
  document.getElementById('regex-flags').addEventListener('input', testRegex);
  document.getElementById('regex-input').addEventListener('input', testRegex);

  // ============================================================
  // 14. NUMBER BASE CONVERTER
  // ============================================================

  const nbDec = document.getElementById('nb-dec');
  const nbHex = document.getElementById('nb-hex');
  const nbBin = document.getElementById('nb-bin');
  const nbOct = document.getElementById('nb-oct');
  const nbStatus = document.getElementById('nb-status');
  const nbFields = [nbDec, nbHex, nbBin, nbOct];

  function syncFromBase(source) {
    const base = parseInt(source.dataset.base, 10);
    const raw = source.value.trim();
    if (!raw) {
      nbFields.forEach(f => { if (f !== source) f.value = ''; });
      nbStatus.classList.remove('is-visible');
      return;
    }
    const num = parseInt(raw, base);
    if (isNaN(num) || num < 0) {
      showStatus(nbStatus, 'Invalid number for base ' + base, false);
      return;
    }
    nbStatus.classList.remove('is-visible');
    if (source !== nbDec) nbDec.value = num.toString(10);
    if (source !== nbHex) nbHex.value = num.toString(16).toUpperCase();
    if (source !== nbBin) nbBin.value = num.toString(2);
    if (source !== nbOct) nbOct.value = num.toString(8);
  }

  nbFields.forEach(field => {
    field.addEventListener('input', () => syncFromBase(field));
  });

})();
