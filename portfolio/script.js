(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Preloader ---------- */
  document.body.classList.add('loading');
  const finishLoading = () => {
    $('#loader').classList.add('done');
    document.body.classList.remove('loading');
    document.body.classList.add('ready');
    startTyping();
  };
  let loaded = false;
  const onLoad = () => { if (!loaded) { loaded = true; setTimeout(finishLoading, reduceMotion ? 0 : 900); } };
  window.addEventListener('load', onLoad);
  setTimeout(onLoad, 3000); // never trap the page behind a slow asset

  $('#year').textContent = new Date().getFullYear();

  /* ---------- Theme ---------- */
  const root = document.documentElement;
  $('#themeToggle').addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* ---------- Typing effect ---------- */
  const roles = ['Full-Stack Developer', 'FinTech Engineer', 'Blockchain Builder', 'Python Developer', 'Team Leader'];
  function startTyping() {
    const el = $('#typed');
    if (reduceMotion) { el.textContent = roles[0]; return; }
    let r = 0, i = 0, deleting = false;
    const tick = () => {
      const word = roles[r];
      i += deleting ? -1 : 1;
      el.textContent = word.slice(0, i);
      let delay = deleting ? 45 : 90;
      if (!deleting && i === word.length) { deleting = true; delay = 1700; }
      else if (deleting && i === 0) { deleting = false; r = (r + 1) % roles.length; delay = 350; }
      setTimeout(tick, delay);
    };
    tick();
  }

  /* ---------- Nav: scrolled state, progress, active link ---------- */
  const nav = $('#nav'), progress = $('#progress');
  const sections = $$('main section[id]');
  const links = $$('.nav-links a');
  const timeline = $('#timeline'), timelineFill = $('#timelineFill');
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    nav.classList.toggle('scrolled', y > 30);
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    let current = '';
    for (const s of sections) if (s.offsetTop - 140 <= y) current = s.id;
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + current));
    // timeline fill follows the scroll position
    const r = timeline.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    timelineFill.style.height = pct * 100 + '%';
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const burger = $('#burger'), navLinks = $('#navLinks');
  const setMenu = open => {
    burger.classList.toggle('open', open);
    navLinks.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
  };
  burger.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
  links.forEach(a => a.addEventListener('click', () => setMenu(false)));

  /* ---------- Reveal on scroll + counters ---------- */
  const countUp = el => {
    const to = +el.dataset.to, suffix = el.dataset.suffix || '';
    const from = to > 1000 ? to - 40 : 0;
    if (reduceMotion) { el.textContent = to + suffix; return; }
    const t0 = performance.now(), dur = 1600;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e) + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('.count', e.target).forEach(countUp);
      io.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  /* ---------- Project filters ---------- */
  const projects = $$('.project');
  $$('.filter').forEach(btn => btn.addEventListener('click', () => {
    $$('.filter').forEach(b => b.classList.toggle('active', b === btn));
    const f = btn.dataset.filter;
    projects.forEach(p => {
      const show = f === 'all' || p.dataset.cat.split(' ').includes(f);
      if (show) {
        p.classList.remove('hide');
        requestAnimationFrame(() => requestAnimationFrame(() => p.classList.remove('fade')));
      } else {
        p.classList.add('fade');
        setTimeout(() => { if (p.classList.contains('fade')) p.classList.add('hide'); }, 300);
      }
    });
  }));

  /* ---------- Spotlight follows the pointer ---------- */
  $$('.spotlight').forEach(el => el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', e.clientX - r.left + 'px');
    el.style.setProperty('--my', e.clientY - r.top + 'px');
  }));

  if (finePointer && !reduceMotion) {
    /* ---------- 3D tilt ---------- */
    $$('.tilt').forEach(el => {
      const max = +el.dataset.tilt || 8;
      el.addEventListener('pointermove', e => {
        if (el.classList.contains('reveal') && !el.classList.contains('in')) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(1000px) rotateX(${-y * max}deg) rotateY(${x * max}deg)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });

    /* ---------- Magnetic buttons ---------- */
    $$('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.25}px, ${y * 0.3}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });

    /* ---------- Custom cursor ---------- */
    const dot = $('.cursor-dot'), ring = $('.cursor-ring');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('pointermove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      document.body.classList.add('has-cursor');
    });
    document.addEventListener('pointerleave', () => document.body.classList.remove('has-cursor'));
    const follow = () => {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(follow);
    };
    follow();
    document.addEventListener('pointerover', e => {
      ring.classList.toggle('hover', !!e.target.closest('a, button, .project, input, textarea'));
    });
  }

  /* ---------- Particle network ---------- */
  const canvas = $('#particles');
  const ctx = canvas.getContext('2d');
  let W, H, dpr, pts = [];
  const mouse = { x: -9999, y: -9999 };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(110, Math.floor(W * H / 14000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.6 + 0.6
    }));
  };
  const hero = $('.hero');
  hero.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  let heroVisible = true;
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(hero);
  const draw = () => {
    if (heroVisible) {
      const c = getComputedStyle(root).getPropertyValue('--particle').trim();
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 120) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c}, .7)`; ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) {
          ctx.strokeStyle = `rgba(${c}, ${0.18 * (1 - d / 120)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  };
  resize();
  addEventListener('resize', resize);
  draw();

  /* ---------- Contact form → opens the visitor's mail app, pre-filled ---------- */
  const TO = 'bp877396@gmail.com';
  $('#contactForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('name').trim(), from = f.get('email').trim();
    const subject = `Portfolio enquiry from ${name}`;
    const body = `Hi Bhumik,\n\n${f.get('message').trim()}\n\nRegards,\n${name}\n${from}`;
    const q = encodeURIComponent;
    const mailto = `mailto:${TO}?subject=${q(subject)}&body=${q(body)}`;
    $('#mcMail').href = mailto;
    $('#mcGmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${TO}&su=${q(subject)}&body=${q(body)}`;
    $('#mcOutlook').href = `https://outlook.live.com/mail/0/deeplink/compose?to=${TO}&subject=${q(subject)}&body=${q(body)}`;
    $('#mailChoice').hidden = false;
    let embedded = true;
    try { embedded = window.self !== window.top; } catch (err) {}
    if (embedded) {
      // Inside an embedded preview, opening a mail app replaces the page with a "blocked" screen,
      // so open the pre-filled Gmail draft in a new tab instead and keep the page in place.
      $('#mcMail').hidden = true;
      $('#formNote').textContent = 'A Gmail draft with everything filled in should open in a new tab. Just press Send.';
      $('#mcGmail').click();
    } else {
      $('#formNote').textContent = 'Your email app should open with everything filled in. Just press Send.';
      location.href = mailto;
    }
  });
})();
