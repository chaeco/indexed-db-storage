/* ==========================================================================
   Chaeco — unified project website interactions & animation
   Zero-dependency, plain JS. Respects prefers-reduced-motion.
   ========================================================================== */

(() => {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ *
   * 活终端：循环演示（steps 定义在 HTML 的 <script type="application/json"> 中）
   * ------------------------------------------------------------------ */

  const stepsJson = document.getElementById('terminalSteps');
  const terminalSteps = stepsJson ? JSON.parse(stepsJson.textContent) : [];

  const codeEl = document.getElementById('terminalCode');
  const sqlEl  = document.getElementById('termSql');
  const paramsEl = document.getElementById('termParams');
  const resultEl = document.getElementById('termResult');
  const caretEl  = document.getElementById('terminalCaret');

  let stepIdx = 0;
  let rafId = 0;

  function highlightInline(code) {
    // 轻量内联高亮：字符串 / 数字 / 注释
    const escaped = code
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped
      .replace(/(\/\/.*$)/gm, '<span class="tok-comment">$1</span>')
      .replace(/'((?:[^'\\]|\\.)*)'/g, '<span class="tok-str">\'$1\'</span>')
      .replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>');
  }

  function setOutput(step) {
    sqlEl.textContent = step.sql;
    paramsEl.textContent = step.params;
    resultEl.textContent = step.result;
    codeEl.innerHTML = highlightInline(step.code);
  }

  // 打字机：逐步填充代码，同时输出区保持上一步结果；完成后逐步揭示输出。
  function playStep(step, done) {
    codeEl.textContent = '';
    sqlEl.textContent = '';
    paramsEl.textContent = '';
    resultEl.textContent = '';
    caretEl.style.opacity = '1';

    const chars = step.code.split('');
    let i = 0;
    const typeTick = () => {
      if (REDUCED) {
        codeEl.textContent = step.code;
        revealOutput(step, done);
        return;
      }
      if (i <= chars.length) {
        codeEl.textContent = chars.slice(0, i).join('');
        i += 2;
        rafId = requestAnimationFrame(typeTick);
      } else {
        revealOutput(step, done);
      }
    };
    typeTick();
  }

  function revealOutput(step, done) {
    if (REDUCED) {
      setOutput(step);
      done();
      return;
    }
    // 逐段淡入：SQL → 参数 → 结果
    sqlEl.textContent = step.sql;
    paramsEl.textContent = step.params;
    resultEl.textContent = step.result;
    codeEl.innerHTML = highlightInline(step.code);

    const rows = sqlEl.parentElement.querySelectorAll('.terminal__row');
    rows.forEach((el, idx) => {
      el.style.transition = `opacity 0.35s ${0.15 + idx * 0.14}s ease`;
      el.style.opacity = '1';
    });
    setTimeout(done, 400 + rows.length * 140);
  }

  // 初始隐藏输出行，准备动画
  function prepOutput() {
    const rows = sqlEl.parentElement.querySelectorAll('.terminal__row');
    rows.forEach((el) => { el.style.opacity = '0'; });
  }

  function loop() {
    if (REDUCED) {
      setOutput(terminalSteps[0]);
      return;
    }
    stepIdx = (stepIdx + 1) % terminalSteps.length;
    playStep(terminalSteps[stepIdx], () => {
      caretEl.style.opacity = '1';
      setTimeout(loop, 2600);
    });
  }

  // 点击终端重跑当前步
  const terminal = document.querySelector('.terminal');
  if (terminal && terminalSteps.length) {
    terminal.addEventListener('click', () => {
      if (REDUCED) return;
      cancelAnimationFrame(rafId);
      prepOutput();
      playStep(terminalSteps[stepIdx], () => {
        setTimeout(loop, 2600);
      });
    });

    // 启动
    prepOutput();
    if (REDUCED) {
      setOutput(terminalSteps[0]);
    } else {
      // 首步：展示第一条查询，再进入循环
      stepIdx = -1;
      loop();
    }
  }

  /* ------------------------------------------------------------------ *
   * 滚动揭示
   * ------------------------------------------------------------------ */

  const revealEls = document.querySelectorAll('.reveal');

  if (REDUCED) {
    revealEls.forEach((el) => el.classList.add('in-view'));
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in-view'));
  }

  /* ------------------------------------------------------------------ *
   * 事实计数：data-count 数字滚动
   * ------------------------------------------------------------------ */

  const counters = document.querySelectorAll('[data-count]');

  function animateCount(el) {
    const target = Number(el.dataset.count || 0);
    const dur = 1400;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = String(target);
    };
    requestAnimationFrame(tick);
  }

  if (counters.length) {
    if (REDUCED) {
      counters.forEach((el) => { el.textContent = el.dataset.count; });
    } else if ('IntersectionObserver' in window) {
      const cio = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animateCount(entry.target);
              cio.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 },
      );
      counters.forEach((el) => cio.observe(el));
    } else {
      counters.forEach((el) => { el.textContent = el.dataset.count; });
    }
  }

  /* ------------------------------------------------------------------ *
   * 用法 Tab 切换
   * ------------------------------------------------------------------ */

  const tabs = document.querySelectorAll('.demo__tab');
  const panels = document.querySelectorAll('.demo__panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      panels.forEach((panel) => {
        const active = panel.dataset.panel === target;
        panel.classList.toggle('is-active', active);
        // 重新触发一次 fade-in 动画
        if (active) {
          panel.style.animation = 'none';
          panel.offsetHeight; // reflow
          panel.style.animation = 'panel-in 0.5s var(--ease-out)';
        }
      });
    });
  });

  // Tab 键盘方向键支持
  const tabList = document.querySelector('.demo__tabs');
  if (tabList) {
    tabList.addEventListener('keydown', (e) => {
      const current = Array.from(tabs).findIndex((t) => t === document.activeElement);
      if (current < 0) return;
      let next = current;
      if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else return;
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  }

  /* ------------------------------------------------------------------ *
   * 导航：滚动后加一点阴影
   * ------------------------------------------------------------------ */

  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // panel-in keyframes 注入（避免污染全局样式表）
  const style = document.createElement('style');
  style.textContent = '@keyframes panel-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }';
  document.head.appendChild(style);
})();
