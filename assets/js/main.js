/* SAÑLAQ landing — slide engine and interactions. */
(() => {
  'use strict';

  // Contact buttons in the "Байланыс" dialog and the footer. Empty values are hidden.
  const CONTACTS = {
    telegram: 'https://t.me/mmeirbek',
    instagram: 'https://www.instagram.com/sanlaq.kaz/',
    whatsapp: '',
    email: 'meirnur22@gmail.com'
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const I18N = window.SANLAQ_I18N;
  const Audio = window.SanlaqAudio;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  const allSlides = $$('.slide');
  let slides = allSlides;
  let total = slides.length;
  let cur = 0;
  let busy = false;
  let started = false;
  let lang = 'kk';
  let mobile = false;

  /* ---------------- i18n ---------------- */
  const kkStatic = {};
  $$('[data-i18n]').forEach((el) => { const k = el.dataset.i18n; if (!(k in kkStatic)) kkStatic[k] = el.innerHTML; });
  $$('[data-i18n-aria]').forEach((el) => { const k = el.dataset.i18nAria; if (!(k in kkStatic)) kkStatic[k] = el.getAttribute('aria-label'); });

  function t(key) {
    const d = I18N[lang] || {};
    if (key in d) return d[key];
    if (key in I18N.kk) return I18N.kk[key];
    return kkStatic[key] != null ? kkStatic[key] : key;
  }
  const title = (i) => t('titles')[Number(slides[i].dataset.title.slice(1)) - 1];

  function applyLang(next, silent) {
    lang = I18N[next] || next === 'kk' ? next : 'kk';
    document.documentElement.lang = lang === 'kk' ? 'kk' : lang;
    $$('[data-i18n]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18n);
      if (el.dataset.split) splitText(el);
    });
    $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    $$('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
    updateSoundButton();
    buildMenu();
    updateNav();
    renderEntry(itemIndex, true);
    fireSay(fireState.lines ? fireState.lines[fireState.at] : t('fireIntro'), true);
    $$('.count').forEach((el) => { if (el.dataset.done) el.textContent = fmt(+el.dataset.to); });
    if (!silent) store.set('sanlaq.lang', lang);
  }

  /* ---------------- split text ---------------- */
  function splitText(el) {
    const mode = el.dataset.split;
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            if (mode === 'words') {
              w.textContent = part;
              w.style.setProperty('--i', i++);
            } else {
              Array.from(part).forEach((c) => {
                const s = document.createElement('span');
                s.className = 'ch';
                s.textContent = c;
                s.style.setProperty('--i', i++);
                s.style.setProperty('--r', ((Math.random() * 16) - 8).toFixed(1) + 'deg');
                w.appendChild(s);
              });
            }
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    el.classList.add('split-ready');
  }
  $$('[data-split]').forEach(splitText);

  /* ---------------- layout ---------------- */
  function layout() {
    const w = innerWidth;
    const h = innerHeight;
    mobile = w < 760 || (w < 1000 && h > w);
    document.body.classList.toggle('is-mobile', mobile);
    const nav = mobile ? 76 : h < 720 ? 80 : 96;
    const root = document.documentElement.style;
    root.setProperty('--nav', nav + 'px');
    const s = Math.min(w / 1440, (h - nav) / 800);
    root.setProperty('--s', Math.max(0.3, Math.min(s, 1.6)).toFixed(4));
    buildTransitionGrid();
  }

  // Slides without their own logo or title box get the small logo, which leads back to the cover.
  slides.forEach((slide) => {
    if (['s1', 's9', 's16'].includes(slide.id)) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stage-logo';
    b.dataset.action = 'home';
    b.setAttribute('aria-label', 'SAÑLAQ');
    b.innerHTML = '<img class="px" src="assets/img/logo-small.png" alt="" width="118" height="31">';
    $('.stage', slide).prepend(b);
  });

  /* ---------------- sound ---------------- */
  const soundBtn = $('#sound');
  function updateSoundButton() {
    const muted = Audio.isMuted();
    soundBtn.classList.toggle('is-muted', muted);
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.setAttribute('aria-label', t(muted ? 'nav.soundOn' : 'nav.soundOff'));
  }
  function setSound(on) {
    if (on) Audio.init();
    Audio.setMuted(!on);
    if (on) Audio.music(slides[cur].dataset.music);
    store.set('sanlaq.sound', on ? '1' : '0');
    updateSoundButton();
  }
  soundBtn.addEventListener('click', () => {
    setSound(Audio.isMuted());
    Audio.sfx('click');
  });

  let lastHover = 0;
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('button, a');
    if (!el || el.contains(e.relatedTarget)) return;
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
    Audio.sfx('hover', 0.7);
  });

  /* ---------------- transition ---------------- */
  const tr = $('#transition');
  const trGrid = $('#transition-grid');
  const trLabel = $('#transition-label');
  const trTitle = $('#transition-title');
  let cells = [];
  let gridCols = 0;
  let gridRows = 0;

  function buildTransitionGrid() {
    const size = mobile ? 44 : 72;
    const cols = Math.ceil(innerWidth / size);
    const rows = Math.ceil(innerHeight / size);
    if (cols === gridCols && rows === gridRows) return;
    gridCols = cols;
    gridRows = rows;
    trGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    trGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    trGrid.innerHTML = '';
    cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = document.createElement('i');
        d.className = 'tb' + ((r + c) % 2 ? ' alt' : '');
        trGrid.appendChild(d);
        cells.push({ el: d, r, c });
      }
    }
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
  }

  function setDelays(dir, uncovering) {
    const span = gridCols + gridRows * 0.8;
    cells.forEach(({ el, r, c }) => {
      let k = ((dir > 0 ? c : gridCols - 1 - c) + r * 0.8) / span;
      if (uncovering) k = 1 - k;
      const jitter = ((c * 7 + r * 13) % 5) * 9;
      el.style.setProperty('--d', Math.round(k * 300 + jitter) + 'ms');
    });
  }

  function setTransitionText(i) {
    trLabel.textContent = t('nav.slide') + ' ' + String(i + 1).padStart(2, '0');
    trTitle.innerHTML = '';
    let n = 0;
    title(i).split(' ').forEach((word, wi) => {
      if (wi > 0) { const sp = document.createElement('span'); sp.className = 'sp'; trTitle.appendChild(sp); }
      const w = document.createElement('span');
      w.className = 'w';
      Array.from(word).forEach((ch) => {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = ch;
        s.style.setProperty('--i', n++);
        s.style.setProperty('--y', (((n * 37) % 23) - 11) + 'px');
        s.style.setProperty('--r', (((n * 53) % 9) - 4) + 'deg');
        w.appendChild(s);
      });
      trTitle.appendChild(w);
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runTransition(target, dir, onCovered) {
    const slide = slides[target];
    const bg = slide.dataset.bg || '#6D1D17';
    tr.style.setProperty('--c1', bg);
    tr.style.setProperty('--c2', shade(bg, 0.9));
    tr.dataset.theme = slide.dataset.theme;
    setTransitionText(target);
    setDelays(dir, false);
    tr.classList.add('on');
    void tr.offsetWidth;
    tr.classList.add('cover');
    Audio.sfx('whoosh');
    await wait(470);
    onCovered();
    tr.classList.add('text');
    Audio.sfx('blip');
    setTimeout(() => Audio.sfx('blip'), 120);
    await wait(760);
    tr.classList.remove('text');
    setDelays(dir, true);
    tr.classList.remove('cover');
    await wait(440);
    tr.classList.remove('on');
  }

  /* ---------------- navigation ---------------- */
  const counter = $('#counter');
  const prevBtn = $('#nav-prev');
  const nextBtn = $('#nav-next');
  const announcer = $('#announcer');
  $('#total').textContent = String(total).padStart(2, '0');

  function updateNav() {
    counter.textContent = String(cur + 1).padStart(2, '0');
    prevBtn.disabled = cur === 0;
    const last = cur === total - 1;
    $('.nav-next__t', nextBtn).textContent = t(last ? 'nav.home' : 'nav.next');
    nextBtn.setAttribute('aria-label', t(last ? 'nav.home' : 'nav.next'));
    document.body.dataset.theme = slides[cur].dataset.theme;
    $$('.th', menuGrid).forEach((b, i) => b.classList.toggle('on', i === cur));
  }

  function show(i) {
    slides.forEach((s, k) => {
      s.classList.toggle('is-active', k === i);
      s.setAttribute('aria-hidden', String(k !== i));
      if (k !== i) { s.classList.remove('is-in'); s.inert = true; } else { s.inert = false; }
    });
    slides[i].scrollTop = 0;
    cur = i;
    updateNav();
  }

  function enter(i) {
    const slide = slides[i];
    slide.classList.add('is-in');
    Audio.music(slide.dataset.music);
    announcer.textContent = t('a11y.slide') + ' ' + (i + 1) + ': ' + title(i);
    if (location.hash !== '#/' + (i + 1)) history.replaceState(null, '', '#/' + (i + 1));
    runCounts(slide);
    hooks.enter[slide.id] && hooks.enter[slide.id]();
  }

  function leave(i) {
    const slide = slides[i];
    hooks.leave[slide.id] && hooks.leave[slide.id]();
  }

  async function goTo(i, force) {
    if (!started) return;
    i = (i + total) % total;
    if ((i === cur && !force) || busy) return;
    busy = true;
    wheelAcc = 0;
    hideScrollNav();
    const dir = i > cur ? 1 : -1;
    leave(cur);
    if (reduced) {
      show(i);
      enter(i);
      busy = false;
      return;
    }
    await runTransition(i, dir, () => show(i));
    enter(i);
    busy = false;
  }
  const next = () => goTo(cur === total - 1 ? 0 : cur + 1);
  const prev = () => { if (cur > 0) goTo(cur - 1); };

  prevBtn.addEventListener('click', () => { Audio.sfx('click'); prev(); });
  nextBtn.addEventListener('click', () => { Audio.sfx('click'); next(); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'next') { Audio.sfx('click'); next(); }
    if (a.dataset.action === 'home') { Audio.sfx('click'); goTo(0); }
  });

  function setAudience(audience) {
    slides = audience === 'investor'
      ? allSlides.filter((slide) => slide.dataset.audience === 'investor')
      : allSlides.filter((slide) => slide.dataset.audience !== 'investor');
    total = slides.length;
    buildMenu();
    updateNav();
  }

  $$('[data-audience]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    const audience = button.dataset.audience;
    setAudience(audience);
    const targetId = audience === 'investor' ? 's11' : 's2';
    const target = slides.findIndex((slide) => slide.id === targetId);
    if (target >= 0) goTo(target, true);
  }));

  /* keyboard */
  document.addEventListener('keydown', (e) => {
    if (!started || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ($('dialog[open]')) return;
    if (!menu.hidden) { if (e.key === 'Escape') closeMenu(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const onControl = tag === 'button' || tag === 'a';
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break;
      case ' ': if (!onControl) { e.preventDefault(); e.shiftKey ? prev() : next(); } break;
      case 'Home': e.preventDefault(); goTo(0); break;
      case 'End': e.preventDefault(); goTo(total - 1); break;
      case 'm': case 'M': openMenu(); break;
      default:
    }
  });

  /* wheel → fills the "next slide" bar, then turns the page */
  const scrollNav = $('#scrollnav');
  const scrollFill = $('#scrollnav-fill');
  let wheelAcc = 0;
  let wheelTimer = 0;
  let wheelLock = 0;
  function hideScrollNav() { scrollNav.classList.remove('on'); scrollFill.style.width = '0'; }
  window.addEventListener('wheel', (e) => {
    if (!started || mobile || busy || $('dialog[open]') || !menu.hidden) return;
    const now = performance.now();
    if (now < wheelLock) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 32;
    if (Math.abs(e.deltaX) > Math.abs(dy)) dy = e.deltaX;
    wheelAcc += dy;
    const need = 420;
    const p = Math.min(1, Math.abs(wheelAcc) / need);
    scrollNav.classList.add('on');
    scrollFill.style.width = (p * 100).toFixed(0) + '%';
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelAcc = 0; hideScrollNav(); }, 380);
    if (p >= 1) {
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      wheelLock = now + 1400;
      hideScrollNav();
      if (dir > 0) { if (cur < total - 1) next(); } else prev();
    }
  }, { passive: true });

  /* touch swipe (horizontal rows keep their own scrolling) */
  let touch = null;
  document.addEventListener('touchstart', (e) => {
    if (!started || e.touches.length !== 1) return;
    const t0 = e.touches[0];
    touch = { x: t0.clientX, y: t0.clientY, row: !!e.target.closest('.cards4, .heroes, .games, .gp__steps, .tiles, .menu, dialog') };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touch || touch.row) { touch = null; return; }
    const t1 = e.changedTouches[0];
    const dx = t1.clientX - touch.x;
    const dy = t1.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) { dx < 0 ? next() : prev(); }
  }, { passive: true });

  /* ---------------- menu ---------------- */
  const menu = $('#menu');
  const menuGrid = $('#menu-grid');
  const menuBtn = $('#nav-menu');
  function buildMenu() {
    menuGrid.innerHTML = '';
    slides.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'th' + (i === cur ? ' on' : '');
      const bg = s.dataset.bg;
      b.style.background = bg;
      b.style.color = s.dataset.theme === 'light' ? '#351713' : '#F7E6D1';
      b.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b><span></span>`;
      $('span', b).textContent = title(i);
      b.addEventListener('click', () => { Audio.sfx('click'); closeMenu(); goTo(i); });
      menuGrid.appendChild(b);
    });
  }
  function openMenu() {
    if (!started || busy) return;
    menu.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    Audio.sfx('toss');
    const on = $('.th.on', menuGrid) || $('.th', menuGrid);
    on && on.focus();
  }
  function closeMenu() {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  $$('[data-close]', menu).forEach((b) => b.addEventListener('click', closeMenu));

  /* ---------------- dialogs ---------------- */
  function openDialog(id) {
    const d = $('#modal-' + id);
    if (!d || d.open) return;
    d.showModal();
    Audio.sfx('toss');
  }
  $$('dialog.modal').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
  });
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-modal]');
    if (m) openDialog(m.dataset.modal);
    const c = e.target.closest('[data-contact]');
    if (c) openContact(c.dataset.contact);
  });

  const contactLinks = $('#contact-links');
  function contactAnchors(className) {
    return [['telegram', 'TELEGRAM'], ['whatsapp', 'WHATSAPP'], ['instagram', 'INSTAGRAM'], ['email', 'EMAIL']]
      .filter(([k]) => CONTACTS[k])
      .map(([k, label]) => {
        const a = document.createElement('a');
        if (className) a.className = className;
        a.textContent = label;
        a.href = k === 'email' ? 'mailto:' + CONTACTS[k] : CONTACTS[k];
        if (k !== 'email') { a.target = '_blank'; a.rel = 'noopener'; }
        return a;
      });
  }
  // Footer of the last slide: direct links when we have them, otherwise the dialog button.
  const footLinks = contactAnchors();
  footLinks.forEach((a) => $('#foot-contacts').appendChild(a));
  $('#foot-contact-btn').hidden = footLinks.length > 0;

  function openContact(tab) {
    const links = contactAnchors('pb');
    contactLinks.innerHTML = '';
    links.forEach((a) => contactLinks.appendChild(a));
    $('#contact-soon').hidden = links.length > 0;
    setTab(tab || 'player');
    openDialog('contact');
  }
  function setTab(tab) {
    $$('#modal-contact [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('#modal-contact [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  }
  $$('#modal-contact [data-tab]').forEach((b) => b.addEventListener('click', () => { Audio.sfx('click'); setTab(b.dataset.tab); }));

  /* ---------------- language buttons ---------------- */
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    Audio.sfx('click');
    applyLang(b.dataset.lang);
    if (started) enter(cur); // replay the reveal in the new language
  }));

  /* ---------------- count-up numbers ---------------- */
  function fmt(n) {
    return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(n).replace(/ /g, ' ');
  }
  function runCounts(slide) {
    $$('.count', slide).forEach((el, k) => {
      const to = +el.dataset.to;
      if (reduced) { el.textContent = fmt(to); el.dataset.done = '1'; return; }
      const steps = 16;
      let n = 0;
      el.textContent = fmt(0);
      clearInterval(el._t);
      setTimeout(() => {
        el._t = setInterval(() => {
          n++;
          el.textContent = fmt(Math.round((to * n) / steps));
          if (n >= steps) { clearInterval(el._t); el.dataset.done = '1'; if (k === 0) Audio.sfx('reward'); }
        }, 55);
      }, 900 + k * 120);
    });
  }

  /* ---------------- sprites: two-frame walk cycle at 6 fps like the game ---------------- */
  let frame = 0;
  setInterval(() => {
    frame ^= 1;
    $$('img[data-look]', slides[cur]).forEach((img) => {
      img.src = img.dataset.idle
        ? `assets/img/sprites/${img.dataset.look}_idle_E_00.png`
        : `assets/img/sprites/${img.dataset.look}_walk_E_0${frame}.png`;
    });
  }, 166);
  // Warm the second frames so the swap never flickers.
  ['kerey', 'abylai', 'kabanbay'].forEach((l) => { const im = new Image(); im.src = `assets/img/sprites/${l}_walk_E_01.png`; });

  /* ---------------- embers ---------------- */
  class Embers {
    constructor(canvas, mode) {
      this.c = canvas;
      this.x = canvas.getContext('2d');
      this.mode = mode;
      this.p = [];
      this.on = false;
      this.loop = this.loop.bind(this);
    }
    size() {
      if (this.mode === 'stage') { this.w = 1440; this.h = 800; }
      else { this.w = this.c.width = Math.ceil(this.c.clientWidth / 3); this.h = this.c.height = Math.ceil(this.c.clientHeight / 3); }
      if (this.mode === 'stage') { this.c.width = this.w; this.c.height = this.h; }
    }
    start() { if (reduced || this.on) return; this.on = true; this.size(); this.last = performance.now(); requestAnimationFrame(this.loop); }
    stop() { this.on = false; this.p = []; this.x.clearRect(0, 0, this.c.width, this.c.height); }
    spawn() {
      if (this.mode === 'stage') {
        return { x: 700 + Math.random() * 40, y: 470, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 70, life: 1.6 + Math.random(), age: 0, s: Math.random() < 0.3 ? 6 : 4 };
      }
      return { x: Math.random() * this.w, y: this.h - 30 * Math.random(), vx: (Math.random() - 0.5) * 8, vy: -10 - Math.random() * 16, life: 3 + Math.random() * 3, age: 0, s: Math.random() < 0.3 ? 2 : 1 };
    }
    loop(now) {
      if (!this.on) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const want = this.mode === 'stage' ? 26 : 34;
      if (this.p.length < want && Math.random() < 0.35) this.p.push(this.spawn());
      const x = this.x;
      x.clearRect(0, 0, this.c.width, this.c.height);
      this.p = this.p.filter((q) => {
        q.age += dt;
        q.x += (q.vx + Math.sin(q.age * 3 + q.y) * 10) * dt;
        q.y += q.vy * dt;
        const k = 1 - q.age / q.life;
        if (k <= 0) return false;
        x.fillStyle = k > 0.6 ? '#F2C27B' : k > 0.3 ? '#D99A55' : '#8B2E24';
        x.globalAlpha = Math.min(1, k * 1.4);
        x.fillRect(Math.round(q.x / q.s) * q.s, Math.round(q.y / q.s) * q.s, q.s, q.s);
        return true;
      });
      x.globalAlpha = 1;
      requestAnimationFrame(this.loop);
    }
  }
  const coverEmbers = new Embers($('#s1 .embers'), 'slide');
  const fireEmbers = new Embers($('#s9 .embers--stage'), 'stage');

  /* ---------------- per-slide hooks ---------------- */
  const hooks = { enter: {}, leave: {} };

  // 01 cover: parallax + embers
  const coverBg = $('#s1 .bgimg');
  window.addEventListener('pointermove', (e) => {
    if (reduced || mobile || cur !== 0) return;
    coverBg.style.setProperty('--px', ((e.clientX / innerWidth) - 0.5).toFixed(3));
    coverBg.style.setProperty('--py', ((e.clientY / innerHeight) - 0.5).toFixed(3));
  });
  hooks.enter.s1 = () => coverEmbers.start();
  hooks.leave.s1 = () => coverEmbers.stop();

  // 05 heroes: flip cards
  $$('.hero').forEach((h) => h.addEventListener('click', () => {
    h.classList.toggle('flipped');
    Audio.sfx(h.classList.contains('flipped') ? 'ring' : 'toss');
  }));
  hooks.leave.s5 = () => $$('.hero.flipped').forEach((h) => h.classList.remove('flipped'));

  // 06 gameplay: steps + screenshots, auto-advance until the visitor takes over
  const beats = [1, 1, 2, 6, 7];
  const gpSteps = $$('#s6 .step');
  let gpIndex = 0;
  let gpTimer = 0;
  function setStep(i) {
    gpIndex = i;
    gpSteps.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', String(k === i)); });
    $$('#s6 .shot').forEach((s, k) => s.classList.toggle('on', k === i));
    $$('#s6 .cap').forEach((s, k) => s.classList.toggle('on', k === i));
    $$('#s6 .dots i').forEach((s, k) => s.classList.toggle('on', k === i));
    $('#s6 .gp__n').textContent = beats[i];
    if (mobile) gpSteps[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }
  gpSteps.forEach((b, k) => b.addEventListener('click', () => { clearInterval(gpTimer); Audio.sfx('blip'); setStep(k); }));
  hooks.enter.s6 = () => {
    clearInterval(gpTimer);
    setStep(0);
    if (!reduced) gpTimer = setInterval(() => setStep((gpIndex + 1) % gpSteps.length), 4200);
  };
  hooks.leave.s6 = () => clearInterval(gpTimer);

  // 08 learn: wardrobe / encyclopedia entries with a typewriter
  const tiles = $$('#s8 .tile');
  let itemIndex = 0;
  let typeTimer = 0;
  function typeInto(el, text, instant) {
    clearInterval(typeTimer);
    if (instant || reduced) { el.textContent = text; return; }
    let n = 0;
    el.textContent = '';
    typeTimer = setInterval(() => {
      n += 2;
      el.textContent = text.slice(0, n);
      if (n % 6 === 0) Audio.sfx('blip', 0.5);
      if (n >= text.length) clearInterval(typeTimer);
    }, 22);
  }
  function renderEntry(i, instant) {
    itemIndex = i;
    const item = t('items')[i];
    tiles.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', String(k === i)); });
    $('#s8 .entry__icon').src = $('img', tiles[i]).src;
    $('#s8 .entry__name').textContent = item.n;
    $('#s8 .entry__slot').textContent = item.s;
    typeInto($('#s8 .entry__desc'), item.d, instant);
  }
  tiles.forEach((b, k) => b.addEventListener('click', () => { Audio.sfx('click'); renderEntry(k); }));

  // 09 campfire: ask the elder, lines type out like the game's dialogue box
  const talkText = $('#talk-text');
  const fireState = { lines: null, at: 0, topic: -1, timer: 0, typing: false, full: '' };
  function fireSay(text, instant) {
    clearInterval(fireState.timer);
    fireState.full = text;
    if (instant || reduced) { talkText.textContent = text; fireState.typing = false; return; }
    let n = 0;
    fireState.typing = true;
    talkText.textContent = '';
    fireState.timer = setInterval(() => {
      n++;
      talkText.textContent = text.slice(0, n);
      if (n % 3 === 0) Audio.sfx('blip', 0.45);
      if (n >= text.length) { clearInterval(fireState.timer); fireState.typing = false; }
    }, 28);
  }
  $$('#s9 [data-topic]').forEach((b) => b.addEventListener('click', () => {
    const k = +b.dataset.topic;
    $$('#s9 [data-topic]').forEach((q) => q.classList.toggle('on', q === b));
    fireState.topic = k;
    fireState.lines = t('topics')[k];
    fireState.at = 0;
    Audio.sfx('ring');
    fireSay(fireState.lines[0]);
  }));
  $('#talk').addEventListener('click', () => {
    if (fireState.typing) { fireSay(fireState.full, true); return; }
    if (!fireState.lines) return;
    fireState.at = (fireState.at + 1) % fireState.lines.length;
    Audio.sfx('click');
    fireSay(fireState.lines[fireState.at]);
  });
  // A language switch must re-read the current topic in the new language.
  const baseApply = applyLang;
  applyLang = function (next, silent) {
    if (fireState.topic >= 0) fireState.lines = (I18N[next] || I18N.kk).topics[fireState.topic];
    baseApply(next, silent);
  };
  hooks.enter.s9 = () => {
    fireEmbers.start();
    if (!fireState.lines) setTimeout(() => cur === 8 && fireSay(t('fireIntro')), 900);
  };
  hooks.leave.s9 = () => fireEmbers.stop();

  // 10 proof carousel
  const proofs = $$('#s10 .pf');
  let proofIndex = 0;
  function setProof(i, dir) {
    proofIndex = (i + proofs.length) % proofs.length;
    proofs.forEach((p, k) => {
      p.classList.remove('from-r', 'from-l');
      p.classList.toggle('on', k === proofIndex);
      if (k === proofIndex && !reduced) { void p.offsetWidth; p.classList.add(dir > 0 ? 'from-r' : 'from-l'); }
    });
    $('#proof-n').textContent = proofIndex + 1;
  }
  $$('#s10 [data-proof]').forEach((b) => b.addEventListener('click', () => {
    const d = +b.dataset.proof;
    Audio.sfx('click');
    setProof(proofIndex + d, d);
  }));

  // 13 roadmap: Kerey walks from MVP to "we are here", then stops
  const roadWalker = $('#s13 .road__walker');
  let roadTimer = 0;
  hooks.enter.s13 = () => {
    delete roadWalker.dataset.idle;
    clearTimeout(roadTimer);
    roadTimer = setTimeout(() => { roadWalker.dataset.idle = '1'; Audio.sfx('reward'); }, reduced ? 0 : 2250);
  };
  hooks.leave.s13 = () => clearTimeout(roadTimer);

  // 14 team: tap to reveal the real photo on touch screens
  $$('.mb').forEach((m) => m.addEventListener('click', () => { if (!finePointer) m.classList.toggle('show'); }));

  // 16 join: the "skip history" button runs from the cursor; catching it (or tapping it) says no
  const runaway = $('#runaway');
  let dodges = 0;
  document.body.classList.add(finePointer ? 'pointer-fine' : 'pointer-coarse');
  $('#modal-sike [data-i18n="sike.touch"]').hidden = finePointer;
  function dodge(mx, my) {
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
    const stage = $('#s16 .stage').getBoundingClientRect();
    const px = (mx - stage.left) / s;
    const py = (my - stage.top) / s;
    let x;
    let y;
    let tries = 0;
    do {
      x = 60 + Math.random() * (1440 - 460);
      y = 470 + Math.random() * 230;
      tries++;
    } while (Math.hypot(x + 140 - px, y + 22 - py) < 300 && tries < 20);
    runaway.style.left = x.toFixed(0) + 'px';
    runaway.style.top = y.toFixed(0) + 'px';
    dodges++;
    Audio.sfx(dodges % 4 === 0 ? 'fail' : 'toss', 0.8);
  }
  window.addEventListener('pointermove', (e) => {
    if (!finePointer || mobile || cur !== total - 1 || busy) return;
    const r = runaway.getBoundingClientRect();
    const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    if (d < 110) dodge(e.clientX, e.clientY);
  });
  runaway.addEventListener('click', () => { Audio.sfx('hit'); openDialog('sike'); });
  hooks.leave.s16 = () => { runaway.style.left = ''; runaway.style.top = ''; dodges = 0; };

  /* ---------------- start gate ---------------- */
  const gate = $('#gate');
  const gateFill = $('#gate-fill');
  const gatePct = $('#gate-pct');
  const gateSound = $('#gate-sound');
  const gateMute = $('#gate-mute');

  function preload() {
    const urls = new Set();
    $$('img').forEach((img) => img.getAttribute('loading') !== 'lazy' && urls.add(img.src));
    ['assets/img/bg-steppe.webp', 'assets/img/scenes/campfire.png'].forEach((u) => urls.add(new URL(u, location.href).href));
    const list = Array.from(urls);
    let done = 0;
    const tick = () => {
      done++;
      const p = Math.round((done / list.length) * 100);
      gateFill.style.width = p + '%';
      gatePct.textContent = p;
    };
    const imgs = list.map((u) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => { tick(); res(); }; im.src = u; }));
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    return Promise.race([Promise.all([...imgs, fonts]), wait(9000)]);
  }

  function ready() {
    gate.hidden = true;
  }

  async function start(withSound) {
    if (started) return;
    started = true;
    setSound(false);
    const target = 0;
    if (reduced) {
      gate.hidden = true;
      show(target);
      enter(target);
      return;
    }
    busy = true;
    await runTransition(target, 1, () => { gate.hidden = true; show(target); });
    enter(target);
    busy = false;
  }
  gateSound.addEventListener('click', () => start(true));
  gateMute.addEventListener('click', () => start(false));

  function startIndex() {
    const m = /^#\/(\d+)$/.exec(location.hash);
    const n = m ? +m[1] - 1 : 0;
    return n >= 0 && n < total ? n : 0;
  }
  window.addEventListener('hashchange', () => {
    const n = startIndex();
    if (started && n !== cur) goTo(n);
  });

  /* ---------------- boot ---------------- */
  window.addEventListener('resize', layout);
  layout();
  const savedLang = store.get('sanlaq.lang');
  const browserLang = (navigator.language || '').slice(0, 2);
  applyLang(savedLang || (browserLang === 'ru' ? 'ru' : browserLang === 'en' ? 'en' : 'kk'), true);
  show(0);
  slides.forEach((s, k) => { if (k !== 0) s.inert = true; });
  ready();
  start(false);
})();
