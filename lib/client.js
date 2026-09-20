window.__ModuleLoader__.load({
  id: "dsh-work-buddy",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // ---------------------------------------------------------------------
    // dsh-work-buddy -- browser half.
    //
    // A pixel desk buddy pinned to the bottom-right corner of the Web GUI.
    // It reads the live conversation DOM for two semantic signals the chat
    // surface already publishes:
    //
    //   [data-tool][data-state="running"]  a tool call is in flight -> typing
    //   [data-streaming]                   tokens are streaming     -> thinking
    //
    // Neither present means the turn is over, which is what bumps the
    // counters and fires the confetti. Counts persist in localStorage, so the
    // tally survives reloads without a host round-trip.
    // ---------------------------------------------------------------------

    var ROOT_ID = "dsh-work-buddy-root";
    var STYLE_ID = "dsh-work-buddy-style";
    var STATS_KEY = "dsh-work-buddy/stats/v1";

    var POLL_MS = 300;      // DOM sampling cadence
    var FRAME_MS = 110;     // sprite animation cadence
    var IDLE_STREAK = 3;    // consecutive idle polls before a turn counts as done
    var MIN_BUSY_MS = 900;  // ignore sub-second flickers
    var PARTY_MS = 4200;    // confetti duration

    // -- palette -----------------------------------------------------------
    var SKIN = "#f2c9a2";
    var HAIR = "#3a3346";
    var SHIRT = "#4f8ef7";
    var PANTS = "#33415c";
    var INK = "#23202b";
    var MOUTH = "#c2564a";
    var FISH = "#7dd3fc";
    var ZZZ = "#c7d2fe";
    var SPARK = "#fbbf24";
    var SCREEN = "#111827";
    var LAPTOP = "#374151";
    var DESK = "#4b5563";
    var CODE = "#34d399";
    var CONFETTI = ["#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa"];

    var POSE_ACCENT = { idle: "#38bdf8", think: "#fbbf24", code: "#34d399", party: "#f472b6" };
    var POSE_LABEL = { idle: "摸鱼中", think: "思考中", code: "写代码", party: "完成！撒花" };

    // Head + torso + legs. Arms, props and particles are layered per pose,
    // which keeps four readable poses out of one base sprite.
    var BASE = [
      "................",
      ".....hhhhhh.....",
      "....hhhhhhhh....",
      "....hssssssh....",
      "....hsessesh....",
      "....hssssssh....",
      ".....ssmmss.....",
      ".....cccccc.....",
      "....cccccccc....",
      "....cccccccc....",
      "....cccccccc....",
      ".....pppppp.....",
      ".....pp..pp.....",
      ".....pp..pp.....",
      "....ooo..ooo....",
      "................"
    ];
    var BASE_COLORS = { h: HAIR, s: SKIN, e: INK, m: MOUTH, c: SHIRT, p: PANTS, o: INK };

    var GRID = 16;   // sprite cells per side
    var PAD = 2;     // transparent cells around the sprite
    var SCALE = 5;   // device pixels per cell

    // -- stats -------------------------------------------------------------
    function loadStats() {
      try {
        var raw = window.localStorage.getItem(STATS_KEY);
        if (!raw) return { total: 0, days: {} };
        var parsed = JSON.parse(raw);
        return {
          total: typeof parsed.total === "number" && parsed.total >= 0 ? parsed.total : 0,
          days: parsed.days && typeof parsed.days === "object" ? parsed.days : {}
        };
      } catch (error) {
        return { total: 0, days: {} };
      }
    }
    function saveStats(stats) {
      try {
        window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
      } catch (error) {
        /* private mode: the buddy simply forgets */
      }
    }
    function dayKey(offset) {
      var d = new Date();
      if (offset) d.setDate(d.getDate() + offset);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    // -- activity probe ----------------------------------------------------
    // Two published DOM contracts carry the whole state machine; nothing here
    // reaches into React, so an upstream refactor that keeps the attributes
    // keeps the buddy working.
    function probe() {
      if (document.querySelector('[data-tool][data-state="running"]')) return "code";
      if (document.querySelector("[data-streaming]")) return "think";
      return "idle";
    }

    // -- widget ------------------------------------------------------------
    function apply(ctx) {
      if (document.getElementById(ROOT_ID)) return; // already mounted

      var stats = loadStats();
      var busy = false;
      var busySince = 0;
      var idleStreak = 0;
      var pose = "idle";
      var partyUntil = 0;
      var frame = 0;
      var lastFrameAt = 0;

      var style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);

      var root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "dwb-root";
      root.innerHTML =
        '<div class="dwb-panel" data-open="false">' +
          '<div class="dwb-head">' +
            '<span class="dwb-dot"></span>' +
            '<span class="dwb-state">摸鱼中</span>' +
          '</div>' +
          '<div class="dwb-line"><span>累计完成</span><b data-total>0</b></div>' +
          '<div class="dwb-line"><span>今日完成</span><b data-today>0</b></div>' +
          '<div class="dwb-bars" title="最近 7 天"></div>' +
          '<button class="dwb-reset" type="button">重置计数</button>' +
        "</div>" +
        '<button class="dwb-buddy" type="button" aria-label="工作伙伴" title="点我看统计">' +
          '<canvas class="dwb-canvas"></canvas>' +
        "</button>";
      document.body.appendChild(root);

      var panel = root.querySelector(".dwb-panel");
      var stateEl = root.querySelector(".dwb-state");
      var dotEl = root.querySelector(".dwb-dot");
      var totalEl = root.querySelector("[data-total]");
      var todayEl = root.querySelector("[data-today]");
      var barsEl = root.querySelector(".dwb-bars");
      var buddyBtn = root.querySelector(".dwb-buddy");
      var canvas = root.querySelector(".dwb-canvas");

      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var cells = GRID + PAD * 2;
      var cssSize = cells * SCALE;
      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);
      canvas.style.width = cssSize + "px";
      canvas.style.height = cssSize + "px";
      var g = canvas.getContext("2d");
      g.imageSmoothingEnabled = false;

      function renderStats() {
        totalEl.textContent = String(stats.total);
        var todayKey = dayKey(0);
        var today = typeof stats.days[todayKey] === "number" ? stats.days[todayKey] : 0;
        todayEl.textContent = String(today);
        var max = 1;
        var days = [];
        for (var i = 6; i >= 0; i -= 1) {
          var key = dayKey(-i);
          var value = typeof stats.days[key] === "number" ? stats.days[key] : 0;
          if (value > max) max = value;
          days.push({ key: key, value: value });
        }
        barsEl.textContent = "";
        days.forEach(function (day) {
          var bar = document.createElement("i");
          bar.style.height = Math.max(2, Math.round((day.value / max) * 22)) + "px";
          bar.title = day.key + ": " + day.value;
          barsEl.appendChild(bar);
        });
      }

      function setPose(next) {
        if (pose === next) return;
        pose = next;
        stateEl.textContent = POSE_LABEL[next] || next;
        dotEl.style.background = POSE_ACCENT[next] || "#38bdf8";
      }

      function complete() {
        busy = false;
        var now = Date.now();
        if (now - busySince >= MIN_BUSY_MS) {
          var key = dayKey(0);
          stats.total += 1;
          stats.days[key] = (typeof stats.days[key] === "number" ? stats.days[key] : 0) + 1;
          // keep the store tidy: 60 days is plenty for the sparkline
          var keys = Object.keys(stats.days).sort();
          while (keys.length > 60) delete stats.days[keys.shift()];
          saveStats(stats);
          renderStats();
        }
        partyUntil = now + PARTY_MS;
      }

      function tick() {
        var raw = probe();
        if (raw === "idle") {
          idleStreak += 1;
          if (busy && idleStreak >= IDLE_STREAK) complete();
          if (!busy) setPose(Date.now() < partyUntil ? "party" : "idle");
        } else {
          idleStreak = 0;
          if (!busy) { busy = true; busySince = Date.now(); }
          setPose(raw);
        }
        draw();
      }

      // -- drawing ---------------------------------------------------------
      function cell(x, y, w, h, color) {
        g.fillStyle = color;
        g.fillRect((PAD + x) * SCALE * dpr, (PAD + y) * SCALE * dpr, w * SCALE * dpr, h * SCALE * dpr);
      }

      function drawBase() {
        for (var y = 0; y < BASE.length; y += 1) {
          var row = BASE[y];
          for (var x = 0; x < row.length; x += 1) {
            var color = BASE_COLORS[row.charAt(x)];
            if (color) cell(x, y, 1, 1, color);
          }
        }
      }

      /** Two-cell-wide limb; `color` defaults to bare skin. */
      function arm(x, y, h, color) {
        cell(x, y, 2, h, color || SKIN);
      }

      function drawIdle() {
        // the fish that gives slacking off its name, at the buddy's feet
        cell(12, 12, 2, 2, FISH);
        cell(11, 13, 1, 1, FISH);
        cell(14, 13, 1, 1, FISH);
        cell(12, 13, 1, 1, INK);
        // hands behind the head
        arm(2, 5, 5);
        arm(12, 5, 5);
        // drifting z's
        for (var z = 0; z < 3; z += 1) {
          var up = (frame + z * 2) % 5;
          cell(13 + z, 3 - up, 1, 1, ZZZ);
        }
      }

      function drawThink() {
        // chin in one hand, the other arm resting
        arm(12, 6, 6);
        arm(2, 8, 4);
        // a thought bubble filling in
        var dots = (frame % 4) + 1;
        for (var i = 0; i < dots; i += 1) cell(13 + (i % 2), 1 + i, 1, 1, SPARK);
        cell(14, 4, 1, 1, "#fde68a");
      }

      function drawCode() {
        // desk and laptop in front of the lap; drawn over the legs on purpose
        cell(1, 13, 14, 1, DESK);
        cell(3, 10, 10, 3, LAPTOP);
        cell(4, 10, 8, 2, SCREEN);
        cell(4, 11, Math.min((frame % 4) * 2 + 2, 8), 1, CODE);
        // hands alternate between the two keyboard rows
        var left = frame % 2 === 0 ? 9 : 10;
        var right = frame % 2 === 0 ? 10 : 9;
        arm(1, left, 3);
        arm(13, right, 3);
      }

      function drawParty() {
        arm(2, 1, 6);
        arm(12, 1, 6);
        for (var i = 0; i < 16; i += 1) {
          var t = frame + i * 3;
          var x = (i * 5 + t) % (GRID + 4) - 2;
          var y = ((i * 3 + t * 2) % (GRID + 4)) - 2;
          cell(x, y, 1, 1, CONFETTI[i % CONFETTI.length]);
        }
      }

      function draw() {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.imageSmoothingEnabled = false;
        drawBase();
        if (pose === "code") drawCode();
        else if (pose === "think") drawThink();
        else if (pose === "party") drawParty();
        else drawIdle();
      }

      // -- wiring ----------------------------------------------------------
      var pollTimer = window.setInterval(tick, POLL_MS);
      var frameTimer = window.setInterval(function () {
        var now = Date.now();
        if (now - lastFrameAt < FRAME_MS) return;
        lastFrameAt = now;
        frame += 1;
        draw();
      }, FRAME_MS);

      buddyBtn.addEventListener("click", function () {
        var open = panel.getAttribute("data-open") === "true";
        panel.setAttribute("data-open", open ? "false" : "true");
      });
      root.querySelector(".dwb-reset").addEventListener("click", function (event) {
        event.stopPropagation();
        stats = { total: 0, days: {} };
        saveStats(stats);
        renderStats();
      });

      setPose("idle");
      renderStats();
      tick();

      ctx.effect(function () {
        return function () {
          window.clearInterval(pollTimer);
          window.clearInterval(frameTimer);
          root.remove();
          style.remove();
        };
      }, "dsh-work-buddy: widget");
    }

    var CSS =
      "#dsh-work-buddy-root{position:fixed;right:18px;bottom:18px;z-index:2147483000;" +
      "display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;" +
      "font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}" +
      "#dsh-work-buddy-root *{box-sizing:border-box;}" +
      "#dsh-work-buddy-root .dwb-buddy{pointer-events:auto;border:0;background:transparent;padding:0;" +
      "cursor:pointer;line-height:0;border-radius:12px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.22));" +
      "transition:transform .18s ease;}" +
      "#dsh-work-buddy-root .dwb-buddy:hover{transform:translateY(-3px) scale(1.04);}" +
      "#dsh-work-buddy-root .dwb-buddy:active{transform:translateY(0) scale(.98);}" +
      "#dsh-work-buddy-root .dwb-canvas{display:block;image-rendering:pixelated;}" +
      "#dsh-work-buddy-root .dwb-panel{pointer-events:auto;min-width:190px;padding:10px 12px 9px;" +
      "border-radius:12px;background:var(--dsw-alias-bg-elevated,#fff);" +
      "color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));" +
      "box-shadow:0 10px 28px rgba(0,0,0,.18);transform-origin:bottom right;" +
      "opacity:0;visibility:hidden;transform:translateY(6px) scale(.96);" +
      "transition:opacity .16s ease,transform .16s ease,visibility .16s;}" +
      "#dsh-work-buddy-root .dwb-panel[data-open=true]{opacity:1;visibility:visible;transform:none;}" +
      "#dsh-work-buddy-root .dwb-head{display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:7px;}" +
      "#dsh-work-buddy-root .dwb-dot{width:8px;height:8px;border-radius:50%;background:#38bdf8;flex:none;}" +
      "#dsh-work-buddy-root .dwb-line{display:flex;justify-content:space-between;gap:14px;padding:2px 0;" +
      "color:var(--dsw-alias-label-secondary,#57606a);}" +
      "#dsh-work-buddy-root .dwb-line b{color:var(--dsw-alias-label-primary,#1f2328);font-variant-numeric:tabular-nums;}" +
      "#dsh-work-buddy-root .dwb-bars{display:flex;align-items:flex-end;gap:3px;height:24px;margin:8px 0 6px;}" +
      "#dsh-work-buddy-root .dwb-bars i{flex:1;background:#93c5fd;border-radius:2px;min-height:2px;}" +
      "#dsh-work-buddy-root .dwb-reset{width:100%;margin-top:2px;padding:4px 0;font:inherit;cursor:pointer;" +
      "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:7px;background:transparent;" +
      "color:var(--dsw-alias-label-secondary,#57606a);}" +
      "#dsh-work-buddy-root .dwb-reset:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}" +
      "@media (prefers-reduced-motion: reduce){#dsh-work-buddy-root .dwb-buddy{transition:none;}}";

    exports.inject = [];
    exports.apply = apply;
    return module.exports;
  }
});