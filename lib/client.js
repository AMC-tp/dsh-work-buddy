window.__ModuleLoader__.load({
  id: "dsh-work-buddy",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // ---------------------------------------------------------------------
    // dsh-work-buddy -- browser half.
    //
    // A high-density pixel desk buddy in the bottom-right corner. It reads
    // only published surfaces:
    //
    //   [data-tool][data-state="running"]  a tool is in flight     -> coding
    //   [data-streaming]                   tokens are streaming    -> thinking
    //   ctx.uiSession.pendingInteractions  a choice waits for you  -> asking
    //
    // and the durable token accounting from the session projection:
    //
    //   ctx.uiSession.adapter.current  ->  SessionBinding
    //   binding.session.projections.faceOf('tokenUsage')
    //     -> { uncachedInputTokens, cacheReadTokens, cacheWriteTokens,
    //          outputTokens }
    //
    // Cost is derived from the delta of that monotonic counter, priced with
    // the official DeepSeek USD table at the time the delta lands. It is an
    // estimate: peak/off-peak is sampled per delta rather than replayed from
    // each request's own timestamp.
    // ---------------------------------------------------------------------

    var ROOT_ID = "dsh-work-buddy-root";
    var STYLE_ID = "dsh-work-buddy-style";
    var LEDGER_KEY = "dsh-work-buddy/ledger/v2";

    var POLL_MS = 300;
    var FRAME_MS = 110;
    var IDLE_STREAK = 3;
    var MIN_BUSY_MS = 900;
    var PARTY_MS = 4200;

    // -- pricing (USD per million tokens, official DeepSeek table) ---------
    var PRICES = {
      "deepseek-v4-flash": {
        offPeak: { cacheRead: 0.007, input: 0.22, output: 0.66 },
        peak: { cacheRead: 0.014, input: 0.44, output: 1.32 }
      },
      "deepseek-v4-pro": {
        offPeak: { cacheRead: 0.022, input: 0.66, output: 1.98 },
        peak: { cacheRead: 0.044, input: 1.32, output: 3.96 }
      }
    };
    var MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];
    // Peak windows are Asia/Shanghai 09:00-12:00 and 14:00-18:00 on Mon-Fri.
    var PEAK_BANDS = [[540, 720], [840, 1080]];

    function shanghaiNow() {
      var d = new Date();
      var utc = d.getTime() + d.getTimezoneOffset() * 60000;
      return new Date(utc + 8 * 3600000);
    }
    function isPeak() {
      var s = shanghaiNow();
      var weekday = s.getDay();
      if (weekday === 0 || weekday === 6) return false;
      var minutes = s.getHours() * 60 + s.getMinutes();
      for (var i = 0; i < PEAK_BANDS.length; i += 1) {
        if (minutes >= PEAK_BANDS[i][0] && minutes < PEAK_BANDS[i][1]) return true;
      }
      return false;
    }
    function priceOf(model) {
      var table = PRICES[model] || PRICES["deepseek-v4-flash"];
      return isPeak() ? table.peak : table.offPeak;
    }
    /** USD for one bucket delta under the model's current band. */
    function costOf(buckets, model) {
      var p = priceOf(model);
      var perToken = 1 / 1e6;
      return (
        buckets.uncachedInputTokens * p.input +
        buckets.cacheReadTokens * p.cacheRead +
        buckets.cacheWriteTokens * p.input +
        buckets.outputTokens * p.output
      ) * perToken;
    }
    function totalTokens(b) {
      return b.uncachedInputTokens + b.cacheReadTokens + b.cacheWriteTokens + b.outputTokens;
    }

    // -- ledger ------------------------------------------------------------
    function dayKey(offset) {
      var d = new Date();
      if (offset) d.setDate(d.getDate() + offset);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
    function emptyDay() { return { done: 0, tokens: 0, usd: 0 }; }
    function loadLedger() {
      var fallback = { days: {}, seen: {}, model: MODELS[0] };
      try {
        var raw = window.localStorage.getItem(LEDGER_KEY);
        if (!raw) return fallback;
        var p = JSON.parse(raw);
        return {
          days: p.days && typeof p.days === "object" ? p.days : {},
          seen: p.seen && typeof p.seen === "object" ? p.seen : {},
          model: MODELS.indexOf(p.model) >= 0 ? p.model : MODELS[0]
        };
      } catch (e) { return fallback; }
    }
    function saveLedger() {
      try { window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); } catch (e) {}
    }
    function day(key) {
      if (!ledger.days[key]) ledger.days[key] = emptyDay();
      return ledger.days[key];
    }
    /** Sum a [from, to] inclusive yyyy-mm-dd string range. */
    function sumRange(from, to) {
      var acc = { done: 0, tokens: 0, usd: 0 };
      Object.keys(ledger.days).forEach(function (k) {
        if (k >= from && k <= to) {
          var d = ledger.days[k];
          acc.done += d.done || 0;
          acc.tokens += d.tokens || 0;
          acc.usd += d.usd || 0;
        }
      });
      return acc;
    }
    function weekStart() {
      var d = new Date();
      var dow = (d.getDay() + 6) % 7; // Monday-based
      d.setDate(d.getDate() - dow);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
    function monthStart() {
      var d = new Date();
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-01";
    }
    function yearStart() {
      return new Date().getFullYear() + "-01-01";
    }

    // -- formatting --------------------------------------------------------
    /** Token counts are large, so the headline figure is millions. */
    function fmtM(n) {
      if (!n) return "0";
      var m = n / 1e6;
      if (m >= 100) return m.toFixed(0) + "M";
      if (m >= 10) return m.toFixed(1) + "M";
      if (m >= 0.01) return m.toFixed(2) + "M";
      return n.toLocaleString();
    }
    function fmtUsd(v) {
      if (!v) return "$0.00";
      if (v < 0.01) return "<$0.01";
      return "$" + v.toFixed(2);
    }

    // -- sprite: 32x32 original robot ------------------------------------
    // An original boxy treaded robot -- same archetype as the famous
    // trash-compactor robot, deliberately not a copy of any character.
    // Drawn at one consistent density (no doubled blocks), so it stays crisp
    // when the canvas is scaled up with image-rendering: pixelated.
    var PAL = {
      K: "#262b33", B: "#dfe6ee", b: "#f2f6fa", d: "#97a3b0",
      L: "#10141b", W: "#ffffff", C: "#38bdf8",
      F: "#7dd3fc", z: "#c7d2fe", "*": "#fbbf24", "+": "#fde68a",
      "=": "#4b5563", "@": "#111827", ">": "#34d399",
      o: "#f472b6"
    };
    var BASE32 = [
      "..............AAAA..............",
      ".............AAAAAA.............",
      "...............KK...............",
      "...............KK...............",
      "........KKKKKKKKKKKKKKKK........",
      ".......KbbbbbbbbbbbbbbbbK.......",
      ".......KBKKKKKKBBKKKKKKBK.......",
      ".......KBKWWLLKBBKWWLLKBK.......",
      ".......KBKWWLLKBBKWWLLKBK.......",
      ".......KBKLLLLKBBKLLLLKBK.......",
      ".......KBKLLCLKBBKLLCLKBK.......",
      ".......KBKLLLLKBBKLLLLKBK.......",
      ".......KBKKKKBKBKBKBKKKBK.......",
      ".......KBBBBBBBBBBBBBBBBK.......",
      ".......KddddddddddddddddK.......",
      "........KKKKKKKKKKKKKKKK........",
      ".............KddddK.............",
      ".............KddddK.............",
      "...........KKKKKKKKKK...........",
      ".........KKKdBBBBBBdKKK.........",
      ".........KKKdBKKKKBdKKK.........",
      ".........KKKdBKCCKBdKKK.........",
      ".........KKKdBKCCKBdKKK.........",
      "...........KdBKKKKBdK...........",
      "...........KdBBBBBBdK...........",
      "...........KKKKKKKKKK...........",
      "........KKKKKKKKKKKKKKKK........",
      "........KbbbbbbbbbbbbbbK........",
      "........KddddddddddddddK........",
      "........KKKKKKKKKKKKKKKK........",
      "................................",
      "................................"
    ];
    var CELLS = 32;   // one consistent grid: no doubled blocks
    var SCALE = 5;    // device pixels per cell -> 160 px sprite

    var POSE_LABEL = {
      idle: "摸鱼中", think: "思考中", code: "写代码中",
      ask: "等你选择", party: "完成！撒花"
    };
    var POSE_ACCENT = {
      idle: "#38bdf8", think: "#fbbf24", code: "#34d399",
      ask: "#f472b6", party: "#f472b6"
    };
    var CONFETTI = ["#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa"];
    // -- projection wiring -------------------------------------------------
    /**
     * Subscribe to the durable token accounting of whichever session is
     * current, without React: the official adapter hands out a SessionBinding
     * and the session face owns the key-addressed projection observables.
     */
    function watchTokens(ctx, onUsage) {
      var ui = ctx.get("uiSession");
      if (!ui || !ui.adapter || !ui.adapter.current) return function () {};
      var current = ui.adapter.current;
      var offFace = null;
      var seenId = null;
      var bind = function () {
        var binding = current.getSnapshot();
        var id = binding && binding.sessionId;
        if (id === seenId) return;
        if (offFace) { offFace(); offFace = null; }
        seenId = id;
        if (!binding || !binding.session || !binding.session.projections) return;
        var face = binding.session.projections.faceOf("tokenUsage");
        if (!face) return;
        var push = function () { onUsage(id, face.getSnapshot()); };
        var un = face.subscribe(push);
        offFace = function () { try { un(); } catch (e) {} };
        push();
      };
      var offCurrent = current.subscribe(bind);
      bind();
      return function () {
        if (offFace) offFace();
        try { offCurrent(); } catch (e) {}
      };
    }

    /** Whether a pending interaction is waiting on the reader right now. */
    function watchPending(ctx, onChange) {
      var ui = ctx.get("uiSession");
      if (!ui || !ui.pendingInteractions) return function () {};
      var push = function () {
        var snap = ui.pendingInteractions.getSnapshot();
        var n = 0;
        if (snap && typeof snap.forEach === "function") snap.forEach(function () { n += 1; });
        else if (snap && typeof snap.size === "number") n = snap.size;
        onChange(n);
      };
      var un = ui.pendingInteractions.subscribe(push);
      push();
      return function () { try { un(); } catch (e) {} };
    }

    function probe() {
      if (document.querySelector('[data-tool][data-state="running"]')) return "code";
      if (document.querySelector("[data-streaming]")) return "think";
      return "idle";
    }

    var ledger = null;

    // -- widget ------------------------------------------------------------
    function apply(ctx) {
      if (document.getElementById(ROOT_ID)) return;
      ledger = loadLedger();

      var busy = false, busySince = 0, idleStreak = 0, pose = "idle";
      var partyUntil = 0, asking = false, frame = 0, lastFrameAt = 0, expanded = false;

      var style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);

      var root = document.createElement("div");
      root.id = ROOT_ID;
      root.innerHTML =
        '<div class="dwb-tip" data-show="false"></div>' +
        '<div class="dwb-panel" data-open="false">' +
          '<div class="dwb-head"><span class="dwb-dot"></span><span class="dwb-state">摸鱼中</span></div>' +
          '<div class="dwb-metrics">' +
            '<div class="dwb-m"><span>完成</span><b data-done>0</b></div>' +
            '<div class="dwb-m"><span>Token</span><b data-tok>0</b></div>' +
            '<div class="dwb-m"><span>费用</span><b data-usd>$0.00</b></div>' +
          '</div>' +
          '<div class="dwb-week"><span>本周</span>' +
            '<b data-w-done>0</b><b data-w-tok>0</b><b data-w-usd>$0.00</b>' +
          '</div>' +
          '<div class="dwb-more" data-more="false">' +
            '<div class="dwb-row"><span>本月</span><b data-m-done>0</b><b data-m-tok>0</b><b data-m-usd>$0.00</b></div>' +
            '<div class="dwb-row"><span>年度</span><b data-y-done>0</b><b data-y-tok>0</b><b data-y-usd>$0.00</b></div>' +
            '<label class="dwb-row dwb-model"><span>计价</span><select data-model></select></label>' +
          '</div>' +
          '<div class="dwb-actions">' +
            '<button type="button" data-toggle>展开 本月 / 年度</button>' +
            '<button type="button" data-reset title="清空账本">清零</button>' +
          '</div>' +
        '</div>' +
        '<button class="dwb-buddy" type="button" aria-label="工作伙伴"><canvas class="dwb-canvas"></canvas></button>';
      document.body.appendChild(root);

      var $ = function (s) { return root.querySelector(s); };
      var panel = $(".dwb-panel"), tip = $(".dwb-tip"), stateEl = $(".dwb-state"), dotEl = $(".dwb-dot");
      var canvas = $(".dwb-canvas"), buddyBtn = $(".dwb-buddy"), more = $(".dwb-more");
      var modelSel = $("[data-model]");
      MODELS.forEach(function (m) {
        var o = document.createElement("option");
        o.value = m; o.textContent = m.replace("deepseek-", "");
        modelSel.appendChild(o);
      });
      modelSel.value = ledger.model;

      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var px = CELLS * SCALE;
      canvas.width = Math.round(px * dpr); canvas.height = Math.round(px * dpr);
      canvas.style.width = px + "px"; canvas.style.height = px + "px";
      var g = canvas.getContext("2d");
      g.imageSmoothingEnabled = false;

      var accent = "#38bdf8";

      /** One cell of the 32x32 grid. */
      function c(x, y, w, h, color) {
        g.fillStyle = color;
        g.fillRect(x * SCALE * dpr, y * SCALE * dpr, w * SCALE * dpr, h * SCALE * dpr);
      }
      function drawBase() {
        for (var y = 0; y < CELLS; y += 1) {
          var row = BASE32[y];
          for (var x = 0; x < CELLS; x += 1) {
            var ch = row.charAt(x);
            if (ch === ".") continue;
            c(x, y, 1, 1, ch === "A" ? accent : PAL[ch]);
          }
        }
      }
      // pose overlays live in the same 32x32 space as the base
      function eyesShut() {
        c(9, 6, 6, 7, PAL.B); c(17, 6, 6, 7, PAL.B);
        c(10, 9, 4, 1, PAL.K); c(18, 9, 4, 1, PAL.K);
      }
      function eyesWide() {
        c(10, 7, 4, 5, PAL.W); c(18, 7, 4, 5, PAL.W);
        c(11, 8, 2, 2, PAL.L); c(19, 8, 2, 2, PAL.L);
      }
      function armLow(x) {
        c(x, 22, 2, 4, PAL.d);
        c(x - 1, 25, 4, 2, PAL.K);
        c(x, 25, 2, 1, PAL.B);
      }
      function armHigh(x) {
        c(x, 10, 2, 13, PAL.d);
        c(x - 1, 7, 4, 3, PAL.K);
        c(x, 7, 2, 1, PAL.B);
      }
      function blinking() { return frame % 16 === 0; }

      function drawIdle() {
        drawBase(); eyesShut(); armLow(4); armLow(26);
        c(25, 15, 4, 4, PAL.F); c(23, 17, 2, 2, PAL.F);
        c(29, 17, 2, 2, PAL.F); c(26, 17, 2, 2, PAL.K);
        for (var i = 0; i < 3; i += 1) {
          var t = (frame + i * 3) % 6;
          c(26 + i * 2, 6 - t, 2, 2, PAL.z);
        }
      }
      function drawThink() {
        drawBase(); armHigh(26); armLow(4);
        if (blinking()) eyesShut();
        var dots = (frame % 4) + 1;
        for (var i = 0; i < dots; i += 1) c(28 + (i % 2) * 2, 2 + i * 2, 2, 2, PAL["*"]);
      }
      function drawCode() {
        drawBase();
        if (blinking()) eyesShut();
        c(1, 29, 30, 2, PAL["="]);
        c(10, 22, 12, 7, PAL["="]);
        c(11, 22, 10, 5, PAL["@"]);
        c(12, 24, Math.min((frame % 4) * 2 + 2, 10), 1, PAL[">"]);
        c(6, 23, 5, 4, PAL.d); c(22, 23, 5, 4, PAL.d);
      }
      function drawAsk() {
        drawBase(); eyesWide(); armHigh(26);
        var bubble = frame % 2 === 0 ? PAL.o : "#f9a8d4";
        c(0, 1, 7, 7, bubble);
        c(2, 2, 3, 1, PAL.W); c(3, 3, 1, 1, PAL.W);
        c(3, 4, 1, 1, PAL.W); c(2, 5, 1, 1, PAL.W);
        c(2, 8, 2, 2, bubble);
      }
      function drawParty() {
        drawBase(); armHigh(4); armHigh(26);
        var pts = [[2, 2], [6, 0], [11, 1], [16, 0], [21, 2], [29, 1],
                   [30, 5], [1, 12], [30, 14], [3, 22], [28, 22], [13, 5]];
        for (var i = 0; i < pts.length; i += 1) {
          var t = frame + i * 2;
          c((pts[i][0] + t) % CELLS, (pts[i][1] + Math.floor(t / 2)) % CELLS, 2, 2, CONFETTI[i % CONFETTI.length]);
        }
      }
      function draw() {
        accent = POSE_ACCENT[pose] || POSE_ACCENT.idle;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.imageSmoothingEnabled = false;
        if (pose === "code") drawCode();
        else if (pose === "think") drawThink();
        else if (pose === "ask") drawAsk();
        else if (pose === "party") drawParty();
        else drawIdle();
      }
      // -- panel ---------------------------------------------------------
      function setText(sel, v) { var el = $(sel); if (el) el.textContent = v; }
      function renderPanel() {
        var today = day(dayKey(0));
        setText("[data-done]", String(today.done || 0));
        setText("[data-tok]", fmtM(today.tokens || 0));
        setText("[data-usd]", fmtUsd(today.usd || 0));
        var w = sumRange(weekStart(), dayKey(0));
        setText("[data-w-done]", String(w.done));
        setText("[data-w-tok]", fmtM(w.tokens));
        setText("[data-w-usd]", fmtUsd(w.usd));
        var m = sumRange(monthStart(), dayKey(0));
        setText("[data-m-done]", String(m.done));
        setText("[data-m-tok]", fmtM(m.tokens));
        setText("[data-m-usd]", fmtUsd(m.usd));
        var y = sumRange(yearStart(), dayKey(0));
        setText("[data-y-done]", String(y.done));
        setText("[data-y-tok]", fmtM(y.tokens));
        setText("[data-y-usd]", fmtUsd(y.usd));
      }
      function setPose(next, label) {
        if (pose !== next) {
          pose = next;
          dotEl.style.background = POSE_ACCENT[next] || "#38bdf8";
          root.setAttribute("data-pose", next);
        }
        if (label !== undefined) stateEl.textContent = label;
      }
      function statusLabel() {
        if (asking) return POSE_LABEL.ask;
        if (pose === "party" && Date.now() < partyUntil) return POSE_LABEL.party;
        return POSE_LABEL[pose] || pose;
      }
      function syncChrome() {
        var label = statusLabel();
        stateEl.textContent = label;
        tip.textContent = label;
        tip.setAttribute("data-show", "true");
      }

      function complete() {
        busy = false;
        var now = Date.now();
        if (now - busySince >= MIN_BUSY_MS) {
          var d = day(dayKey(0));
          d.done = (d.done || 0) + 1;
          saveLedger(); renderPanel();
        }
        partyUntil = now + PARTY_MS;
      }

      // token deltas land in the ledger
      function onUsage(sessionId, snap) {
        if (!snap) return;
        var cur = {
          uncachedInputTokens: snap.uncachedInputTokens || 0,
          cacheReadTokens: snap.cacheReadTokens || 0,
          cacheWriteTokens: snap.cacheWriteTokens || 0,
          outputTokens: snap.outputTokens || 0
        };
        var prev = ledger.seen[sessionId];
        if (!prev) { ledger.seen[sessionId] = cur; saveLedger(); return; }
        var delta = {
          uncachedInputTokens: Math.max(0, cur.uncachedInputTokens - prev.uncachedInputTokens),
          cacheReadTokens: Math.max(0, cur.cacheReadTokens - prev.cacheReadTokens),
          cacheWriteTokens: Math.max(0, cur.cacheWriteTokens - prev.cacheWriteTokens),
          outputTokens: Math.max(0, cur.outputTokens - prev.outputTokens)
        };
        ledger.seen[sessionId] = cur;
        var n = totalTokens(delta);
        if (n > 0) {
          var d = day(dayKey(0));
          d.tokens = (d.tokens || 0) + n;
          d.usd = (d.usd || 0) + costOf(delta, ledger.model);
          renderPanel();
        }
        saveLedger();
      }

      function tick() {
        var raw = probe();
        if (raw === "idle") {
          idleStreak += 1;
          if (busy && idleStreak >= IDLE_STREAK) complete();
          if (!busy) setPose(Date.now() < partyUntil ? "party" : (asking ? "ask" : "idle"));
        } else {
          idleStreak = 0;
          if (!busy) { busy = true; busySince = Date.now(); }
          setPose(raw);
        }
        if (asking && !busy) setPose("ask");
        syncChrome();
        draw();
      }

      // -- wiring --------------------------------------------------------
      var pollTimer = window.setInterval(tick, POLL_MS);
      var frameTimer = window.setInterval(function () {
        var now = Date.now();
        if (now - lastFrameAt < FRAME_MS) return;
        lastFrameAt = now; frame += 1; draw();
      }, FRAME_MS);

      var offTok = watchTokens(ctx, onUsage);
      var offPending = watchPending(ctx, function (n) { asking = n > 0; });

      buddyBtn.addEventListener("click", function () {
        var open = panel.getAttribute("data-open") === "true";
        panel.setAttribute("data-open", open ? "false" : "true");
        if (!open) renderPanel();
      });
      buddyBtn.addEventListener("mouseenter", function () { tip.setAttribute("data-show", "true"); });
      buddyBtn.addEventListener("mouseleave", function () { tip.setAttribute("data-show", "false"); });
      $("[data-toggle]").addEventListener("click", function (e) {
        e.stopPropagation();
        expanded = !expanded;
        more.setAttribute("data-more", expanded ? "true" : "false");
        this.textContent = expanded ? "收起" : "展开 本月 / 年度";
      });
      $("[data-reset]").addEventListener("click", function (e) {
        e.stopPropagation();
        ledger = { days: {}, seen: ledger.seen, model: ledger.model };
        saveLedger(); renderPanel();
      });
      modelSel.addEventListener("change", function () {
        ledger.model = modelSel.value; saveLedger(); renderPanel();
      });

      setPose("idle");
      renderPanel();
      tick();

      ctx.effect(function () {
        return function () {
          window.clearInterval(pollTimer);
          window.clearInterval(frameTimer);
          try { offTok(); } catch (e) {}
          try { offPending(); } catch (e) {}
          root.remove();
          style.remove();
        };
      }, "dsh-work-buddy: widget");
    }

    var CSS =
      "#dsh-work-buddy-root{position:fixed;right:18px;bottom:18px;z-index:2147483000;" +
      "display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;" +
      "font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}" +
      "#dsh-work-buddy-root *{box-sizing:border-box;}" +
      "#dsh-work-buddy-root .dwb-tip{pointer-events:none;padding:2px 8px;border-radius:999px;font-size:11px;" +
      "background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary,#1f2328);" +
      "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));box-shadow:0 4px 12px rgba(0,0,0,.14);" +
      "opacity:0;transition:opacity .12s ease;}" +
      "#dsh-work-buddy-root .dwb-tip[data-show=true]{opacity:1;}" +
      "#dsh-work-buddy-root .dwb-buddy{pointer-events:auto;border:0;background:transparent;padding:0;cursor:pointer;" +
      "line-height:0;border-radius:14px;filter:drop-shadow(0 6px 16px rgba(0,0,0,.24));transition:transform .18s ease;}" +
      "#dsh-work-buddy-root .dwb-buddy:hover{transform:translateY(-3px) scale(1.03);}" +
      "#dsh-work-buddy-root .dwb-buddy:active{transform:scale(.98);}" +
      "#dsh-work-buddy-root .dwb-canvas{display:block;image-rendering:pixelated;}" +
      "#dsh-work-buddy-root .dwb-panel{pointer-events:auto;min-width:224px;padding:10px 12px 9px;border-radius:12px;" +
      "background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary,#1f2328);" +
      "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));box-shadow:0 12px 30px rgba(0,0,0,.2);" +
      "transform-origin:bottom right;opacity:0;visibility:hidden;transform:translateY(6px) scale(.96);" +
      "transition:opacity .16s ease,transform .16s ease,visibility .16s;}" +
      "#dsh-work-buddy-root .dwb-panel[data-open=true]{opacity:1;visibility:visible;transform:none;}" +
      "#dsh-work-buddy-root .dwb-head{display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:8px;}" +
      "#dsh-work-buddy-root .dwb-dot{width:8px;height:8px;border-radius:50%;background:#38bdf8;flex:none;}" +
      "#dsh-work-buddy-root .dwb-metrics{display:flex;gap:8px;padding:7px 0;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));" +
      "border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));}" +
      "#dsh-work-buddy-root .dwb-m{flex:1;min-width:0;}" +
      "#dsh-work-buddy-root .dwb-m span{display:block;color:var(--dsw-alias-label-tertiary,#8b949e);font-size:10px;}" +
      "#dsh-work-buddy-root .dwb-m b{font-size:13px;font-variant-numeric:tabular-nums;}" +
      "#dsh-work-buddy-root .dwb-week,#dsh-work-buddy-root .dwb-row{display:flex;align-items:center;gap:6px;padding:4px 0;" +
      "color:var(--dsw-alias-label-secondary,#57606a);}" +
      "#dsh-work-buddy-root .dwb-week span,#dsh-work-buddy-root .dwb-row span{flex:none;width:34px;font-size:11px;}" +
      "#dsh-work-buddy-root .dwb-week b,#dsh-work-buddy-root .dwb-row b{flex:1;text-align:right;font-variant-numeric:tabular-nums;" +
      "color:var(--dsw-alias-label-primary,#1f2328);font-size:11.5px;}" +
      "#dsh-work-buddy-root .dwb-more{display:none;}" +
      "#dsh-work-buddy-root .dwb-more[data-more=true]{display:block;}" +
      "#dsh-work-buddy-root .dwb-model select{flex:1;font:inherit;font-size:11px;padding:1px 4px;border-radius:5px;" +
      "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));background:transparent;color:inherit;}" +
      "#dsh-work-buddy-root .dwb-actions{display:flex;gap:6px;margin-top:8px;}" +
      "#dsh-work-buddy-root .dwb-actions button{flex:1;padding:4px 0;font:inherit;font-size:11px;cursor:pointer;" +
      "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:7px;background:transparent;" +
      "color:var(--dsw-alias-label-secondary,#57606a);}" +
      "#dsh-work-buddy-root .dwb-actions button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}" +
      "@media (prefers-reduced-motion: reduce){#dsh-work-buddy-root .dwb-buddy{transition:none;}}";

    exports.inject = [];
    exports.apply = apply;
    return module.exports;
  }
});