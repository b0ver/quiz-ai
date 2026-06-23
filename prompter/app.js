/* ============================================================
   prompter/app.js — движок квиза.
   Конфиг-управляемый: данные берёт из window.QUIZ_CONFIG,
   Telegram-слой — из window.TMA (shared/tma.js).
   Чтобы сделать похожий квиз — скопируй папку и перепиши config.js.
   ============================================================ */
(function(){
  "use strict";

  var C = window.QUIZ_CONFIG;
  var T = window.TMA;
  var $ = function(id){ return document.getElementById(id); };

  // --- состояние прохождения ---
  var idx = 0;              // индекс текущего вопроса
  var scores = {};          // накопленные баллы по типам
  var picked = [];          // выбранные ответы по вопросам (для отката через «Назад»)
  var finalKey = null;      // итоговый тип
  var screen = "start";     // start | quiz | result

  var REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- TMA: инициализация один раз при старте ---------- */
  T.init(C.BRAND_COLOR || "#0b1020");
  // Единый обработчик нативной «Назад» — маршрутизирует по текущему экрану
  T.back.onClick(goBack);
  // Единый обработчик нативной нижней кнопки — шеринг (видна только на результате)
  T.main.onClick(share);
  // В обычном браузере (без Telegram) показываем in-page кнопку «Поделиться»
  if(!T.has){ var sb = $("shareBtn"); if(sb) sb.classList.remove("hidden"); }

  /* ---------- навигация по экранам ---------- */
  function show(name){
    screen = name;
    var nodes = document.querySelectorAll(".screen");
    for(var i=0;i<nodes.length;i++) nodes[i].classList.remove("active");
    $(name).classList.add("active");
    window.scrollTo(0,0);
    syncChrome();
  }

  // Нативная шапка Telegram под текущий экран: Back + MainButton
  function syncChrome(){
    if(screen === "start"){ T.back.hide(); T.main.hide(); }
    else if(screen === "quiz"){ T.back.show(); T.main.hide(); }
    else if(screen === "result"){ T.back.show(); T.main.setText("Поделиться результатом"); T.main.show(); }
  }

  /* ---------- старт / прохождение ---------- */
  function start(){
    idx = 0; picked = [];
    scores = {};
    for(var i=0;i<C.ORDER.length;i++) scores[C.ORDER[i]] = 0;
    show("quiz");
    render();
  }

  function render(){
    var q = C.QUESTIONS[idx];
    $("bars").innerHTML = C.QUESTIONS.map(function(_, i){
      return '<div class="bar' + (i < idx ? " done" : "") + '"></div>';
    }).join("");
    $("qcount").textContent = "// вопрос " + (idx+1) + " из " + C.QUESTIONS.length;
    $("qtext").innerHTML = '<span class="o">&gt;</span> ' + q.q;
    $("answers").innerHTML = q.a.map(function(ans, i){
      return '<button class="answer" data-i="' + i + '">' +
               '<span class="mk">▸</span><span>' + ans.t + '</span></button>';
    }).join("");
    var btns = $("answers").querySelectorAll(".answer");
    btns.forEach(function(btn){
      btn.addEventListener("click", function(){ choose(parseInt(btn.dataset.i, 10), btn); });
    });
  }

  function choose(i, btn){
    T.haptic.select();                       // хаптика на тапе по варианту
    var s = C.QUESTIONS[idx].a[i].s;
    for(var k in s){ if(s.hasOwnProperty(k)) scores[k] += s[k]; }
    picked[idx] = i;                         // запоминаем выбор для отката
    btn.classList.add("picked");
    $("answers").querySelectorAll(".answer").forEach(function(b){ b.style.pointerEvents = "none"; });
    var next = function(){ idx++; (idx >= C.QUESTIONS.length) ? finish() : render(); };
    REDUCE ? next() : setTimeout(next, 270);
  }

  function finish(){
    // скоринг: максимум; при ничьей — порядок из ORDER (раньше = приоритетнее)
    var max = -1;
    for(var i=0;i<C.ORDER.length;i++){
      var k = C.ORDER[i];
      if(scores[k] > max){ max = scores[k]; finalKey = k; }
    }
    var r = C.RESULTS[finalKey];
    $("resEmoji").textContent = r.e;
    $("resName").textContent  = r.name;
    $("resDesc").textContent  = r.desc;
    $("resSub").textContent   = r.sub;
    T.haptic.success();                      // хаптика на показе результата
    show("result");
  }

  /* ---------- «Назад»: навигация + откат баллов ---------- */
  function goBack(){
    if(screen === "result"){ show("start"); return; }
    if(screen === "quiz"){
      if(idx === 0){ show("start"); return; }   // с первого вопроса — на старт
      idx--;
      // откатываем баллы выбранного на этом вопросе ответа
      var i = picked[idx];
      if(i != null){
        var s = C.QUESTIONS[idx].a[i].s;
        for(var k in s){ if(s.hasOwnProperty(k)) scores[k] -= s[k]; }
      }
      picked.length = idx;
      render();
    }
  }

  /* ---------- шеринг результата ---------- */
  function share(){
    var r = C.RESULTS[finalKey];
    if(!r) return;
    var url = C.APP_DIRECT_LINK;
    var text = "Мой тип промптинга: " + r.e + " " + r.name + "\n" + r.sub +
               "\n\nА ты какой промптер? Пройди тест и подпишись на " + C.CHANNEL_HANDLE;
    if(T.has){
      // нативный выбор чата; мини-апп при openTelegramLink НЕ закрывается
      T.share(url, text);
    } else {
      // фолбэк вне Telegram: копируем тот же текст в буфер + тост
      copyText(url + "\n\n" + text);
    }
  }

  /* ---------- переход на канал (ростовая петля) ---------- */
  function openChannel(){ T.openTelegramLink(C.CHANNEL_URL); }

  /* ---------- буфер обмена + тост (фолбэк-шеринг) ---------- */
  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(toast).catch(function(){ fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text){
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(); } catch(e){}
    document.body.removeChild(ta);
  }
  var toastTimer;
  function toast(){
    var t = $("toast"); t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 1900);
  }

  /* ---------- проводка кнопок (без глобальных onclick) ---------- */
  $("startBtn").addEventListener("click", start);
  $("restartBtn").addEventListener("click", start);
  $("channelBtn").addEventListener("click", openChannel);
  var shareBtn = $("shareBtn");
  if(shareBtn) shareBtn.addEventListener("click", share);

  // стартовый экран: убрать нативные кнопки
  syncChrome();
})();
