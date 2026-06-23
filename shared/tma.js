/* ============================================================
   shared/tma.js — общий слой Telegram Mini App для всех квизов.
   Безопасен в обычном браузере: если window.Telegram.WebApp нет,
   все методы просто no-op (или дают браузерный фолбэк).
   Каждый вызов TG API — через guard, чтобы ничего не падало.
   Глобал: window.TMA
   ============================================================ */
(function(){
  "use strict";

  var tg = (window.Telegram && window.Telegram.WebApp) || null;
  // ВАЖНО: SDK создаёт window.Telegram.WebApp ДАЖE в обычном браузере.
  // Поэтому «мы внутри Telegram» определяем по реальному признаку: platform
  // известен ('ios'/'android'/'tdesktop'/'web'…) только внутри клиента,
  // в браузере он === 'unknown'. От этого зависит выбор нативный/фолбэк.
  var has = !!tg && typeof tg.platform === "string" && tg.platform !== "unknown";

  // Проверка версии клиента (старые клиенты не знают часть методов)
  function ver(v){
    try { return has && tg.isVersionAtLeast && tg.isVersionAtLeast(v); }
    catch(e){ return false; }
  }
  // Безопасный вызов: метод может отсутствовать в старом клиенте
  function call(fn){ try { if(typeof fn === "function") fn(); } catch(e){} }

  window.TMA = {
    tg: tg,
    has: has,
    isVersionAtLeast: ver,

    /* Инициализация: готовность, разворот на весь экран,
       подгон нативной шапки/фона под бренд квиза (без цветового шва),
       блок случайного свайпа-вниз (чтобы не закрыть мини-апп). */
    init: function(brandColor){
      if(!has) return;
      call(function(){ tg.ready(); });
      call(function(){ tg.expand(); });
      call(function(){ if(tg.setHeaderColor) tg.setHeaderColor(brandColor); });
      call(function(){ if(tg.setBackgroundColor) tg.setBackgroundColor(brandColor); });
      call(function(){ if(tg.setBottomBarColor) tg.setBottomBarColor(brandColor); });
      call(function(){ if(tg.disableVerticalSwipes) tg.disableVerticalSwipes(); });
    },

    /* Хаптика — вся через guard HapticFeedback */
    haptic: {
      select:  function(){ call(function(){ if(has && tg.HapticFeedback) tg.HapticFeedback.selectionChanged(); }); },
      light:   function(){ call(function(){ if(has && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light"); }); },
      success: function(){ call(function(){ if(has && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success"); }); }
    },

    /* Нативная кнопка «Назад» */
    back: {
      show:    function(){ call(function(){ if(has && tg.BackButton) tg.BackButton.show(); }); },
      hide:    function(){ call(function(){ if(has && tg.BackButton) tg.BackButton.hide(); }); },
      onClick: function(cb){ call(function(){ if(has && tg.BackButton) tg.BackButton.onClick(cb); }); }
    },

    /* Нативная нижняя кнопка (MainButton) */
    main: {
      setText: function(t){ call(function(){ if(has && tg.MainButton) tg.MainButton.setText(t); }); },
      show:    function(){ call(function(){ if(has && tg.MainButton) tg.MainButton.show(); }); },
      hide:    function(){ call(function(){ if(has && tg.MainButton) tg.MainButton.hide(); }); },
      onClick: function(cb){ call(function(){ if(has && tg.MainButton) tg.MainButton.onClick(cb); }); }
    },

    /* Открыть ссылку на Telegram (канал, мини-апп).
       В TG — нативно (мини-апп при этом НЕ закрывается),
       вне TG — обычное новое окно. */
    openTelegramLink: function(url){
      if(has && tg.openTelegramLink){ call(function(){ tg.openTelegramLink(url); }); }
      else { window.open(url, "_blank", "noopener"); }
    },

    /* Нативный шеринг: открывает выбор чата с текстом + ссылкой.
       Реализован через t.me/share/url — работает без бота-бэкенда.
       Примечание: для богатого шеринга карточкой (tg.shareMessage)
       нужен бот-бэкенд с savePreparedInlineMessage — здесь намеренно
       не используем, чтобы остаться на статике без сервера. */
    share: function(url, text){
      var link = "https://t.me/share/url?url=" + encodeURIComponent(url) +
                 "&text=" + encodeURIComponent(text);
      this.openTelegramLink(link);
    }
  };
})();
