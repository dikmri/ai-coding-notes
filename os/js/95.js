/*
 * 95.js  95.css 用の動作（95slop スキル同梱）。依存なし。window.w95 に公開する。
 *
 * 扱うもの: メニュー、右クリックメニュー、タブ、ダイアログ、メッセージボックス、
 *           ツールチップ、ステータスバーの説明文、一覧とツリーの選択、アクセスキー（Alt+文字）
 *
 * 画面の出来事は w95.log(event, detail) に渡す。既定では何もしない。
 *   例: w95.log = (event, detail) => console.log(event, detail);
 *
 * アプリ側が受け取るイベント（すべて bubbles）
 *   w95:command  メニュー項目が選ばれた        detail: { command, label, checked, item }
 *   w95:tab      タブが切り替わった            detail: { tab }
 *   w95:select   一覧やツリーの選択が変わった  detail: { item }
 *   w95:open     一覧の項目がダブルクリックか Enter で開かれた  detail: { item }
 *   w95:window   タイトルバーのボタンが押された  detail: { action: 'min' | 'max' | 'restore' | 'close' | 'help' }
 */
(function () {
  'use strict';

  var w95 = (window.w95 = window.w95 || {});
  if (w95.__loaded) return;
  w95.__loaded = true;

  function log(event, detail) {
    if (typeof w95.log !== 'function') return;
    try {
      w95.log(event, detail || {});
    } catch (e) {
      /* 記録の失敗で画面を止めない */
    }
  }

  function emit(el, name, detail) {
    return el.dispatchEvent(new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail }));
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function isDisabled(el) {
    return el.getAttribute('aria-disabled') === 'true' || el.disabled === true;
  }

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  /* メニューの項目や題名から、下位のメニューを除いた文字を取り出す */
  function labelText(el) {
    var label = el.querySelector(':scope > .label');
    if (label) return textOf(label);
    var s = '';
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeType === 1 && !n.classList.contains('menu') && !n.classList.contains('shortcut')) s += n.textContent;
    });
    return s.replace(/\s+/g, ' ').trim();
  }

  /* 下線の付いた文字（アクセスキー）を返す */
  function accessKeyOf(el) {
    var us = el.querySelectorAll('u');
    for (var i = 0; i < us.length; i++) {
      var owner = us[i].closest('.menu-item, .menu-title, button, label, legend');
      if (owner === el) return us[i].textContent.trim().toLowerCase();
    }
    return '';
  }

  /* 'はい(&Y)' の形のラベルを、下線付きの HTML にする */
  w95.label = function (text) {
    var esc = String(text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
    return esc.replace(/&amp;([A-Za-z0-9])/, '<u>$1</u>');
  };

  function root() {
    return document.querySelector('.w95') || document.body;
  }

  /* ---------- ステータスバーの説明文 ---------- */

  /* Future OS での変更: 窓が何枚もあるので、説明文はポインタが乗った部品のある窓のステータスバーに出す。
     元に戻す文は、ステータスバーの区画ごとに覚えておく */
  var lastField = null;

  function statusField(from) {
    var win = from && from.closest ? from.closest('.window') : null;
    var root = win || document;
    return root.querySelector('.status-bar [data-status-target], .status-bar > .status-field');
  }

  w95.setStatus = function (text, from) {
    var f = statusField(from) || lastField;
    if (!f) return;
    if (lastField && lastField !== f) w95.clearStatus();
    if (f.dataset.saved === undefined) f.dataset.saved = f.textContent;
    f.textContent = text;
    lastField = f;
  };

  w95.clearStatus = function () {
    var f = lastField;
    if (f && f.dataset.saved !== undefined) { f.textContent = f.dataset.saved; delete f.dataset.saved; }
    lastField = null;
  };

  function showHint(el) {
    if (el && el.dataset && el.dataset.status) w95.setStatus(el.dataset.status, el);
    else w95.clearStatus();
  }

  /* ---------- メニュー ---------- */

  var activeBar = null;
  var contextMenu = null;
  var submenuTimer = 0;

  function normalizeMenus(scope) {
    scope.querySelectorAll('.menu-item').forEach(function (item) {
      if (!item.querySelector(':scope > .label')) {
        var label = document.createElement('span');
        label.className = 'label';
        Array.prototype.slice.call(item.childNodes).forEach(function (n) {
          if (n.nodeType === 1 && (n.classList.contains('menu') || n.classList.contains('shortcut'))) return;
          label.appendChild(n);
        });
        item.insertBefore(label, item.firstChild);
      }
      if (item.querySelector(':scope > .menu')) item.classList.add('has-submenu');
      if (!item.hasAttribute('role')) item.setAttribute('role', 'menuitem');
    });
  }

  function menuItems(menu) {
    return menu ? Array.prototype.slice.call(menu.querySelectorAll(':scope > .menu-item')) : [];
  }

  function setActive(item) {
    var menu = item.parentElement;
    menuItems(menu).forEach(function (i) {
      if (i !== item) i.classList.remove('active');
    });
    item.classList.add('active');
    showHint(item);
  }

  function closeSub(item) {
    item.classList.remove('open');
    item.querySelectorAll('.menu-item.open, .menu-item.active').forEach(function (i) {
      i.classList.remove('open', 'active');
    });
  }

  function openSub(item, viaKeyboard) {
    menuItems(item.parentElement).forEach(function (i) {
      if (i !== item && i.classList.contains('open')) closeSub(i);
    });
    item.classList.add('open');
    var sub = item.querySelector(':scope > .menu');
    if (sub) {
      sub.style.left = '';
      sub.style.right = '';
      var r = sub.getBoundingClientRect();
      if (r.right > window.innerWidth) {
        sub.style.left = 'auto';
        sub.style.right = 'calc(100% - 3px)';
      }
      if (viaKeyboard) {
        var first = menuItems(sub)[0];
        if (first) setActive(first);
      }
    }
  }

  function closeMenus(reason) {
    clearTimeout(submenuTimer);
    var had = activeBar || contextMenu;
    document.querySelectorAll('.w95 .menu-title.open, .w95 .menu-title.active').forEach(function (t) {
      t.classList.remove('open', 'active');
    });
    document.querySelectorAll('.w95 .menu-item.open, .w95 .menu-item.active').forEach(function (i) {
      i.classList.remove('open', 'active');
    });
    if (contextMenu) contextMenu.classList.remove('open');
    activeBar = null;
    contextMenu = null;
    if (had) {
      w95.clearStatus();
      log('menu.close', { reason: reason || '' });
    }
  }

  function openTitle(title, viaKeyboard) {
    var bar = title.parentElement;
    if (contextMenu) closeMenus('switch');
    bar.querySelectorAll(':scope > .menu-title').forEach(function (t) {
      t.classList.remove('open', 'active');
    });
    bar.querySelectorAll('.menu-item.open, .menu-item.active').forEach(function (i) {
      i.classList.remove('open', 'active');
    });
    title.classList.add('open');
    activeBar = bar;
    w95.clearStatus();
    log('menu.open', { menu: labelText(title) });
    if (viaKeyboard) {
      var first = menuItems(title.querySelector(':scope > .menu'))[0];
      if (first) setActive(first);
    }
  }

  w95.popupMenu = function (menu, x, y) {
    closeMenus('switch');
    normalizeMenus(menu);
    menu.classList.add('context', 'open');
    menu.style.left = '0px';
    menu.style.top = '0px';
    var r = menu.getBoundingClientRect();
    menu.style.left = Math.max(0, Math.min(x, window.innerWidth - r.width)) + 'px';
    menu.style.top = Math.max(0, Math.min(y, window.innerHeight - r.height)) + 'px';
    contextMenu = menu;
    log('menu.popup', { x: Math.round(x), y: Math.round(y) });
  };

  function activate(item) {
    if (isDisabled(item)) return;
    if (item.classList.contains('has-submenu')) {
      openSub(item, false);
      return;
    }
    if (item.dataset.toggle === 'check') item.classList.toggle('checked');
    if (item.dataset.radio) {
      menuItems(item.parentElement).forEach(function (i) {
        if (i.dataset.radio === item.dataset.radio) i.classList.remove('checked');
      });
      item.classList.add('radio', 'checked');
    }
    var detail = {
      command: item.dataset.command || '',
      label: labelText(item),
      checked: item.classList.contains('checked'),
      item: item
    };
    closeMenus('command');
    log('menu.command', { command: detail.command, label: detail.label, checked: detail.checked });
    emit(item, 'w95:command', detail);
  }

  /* いま操作対象になっているメニュー（いちばん深く開いているもの） */
  function deepestMenu() {
    var menu = contextMenu;
    if (!menu && activeBar) {
      var t = activeBar.querySelector(':scope > .menu-title.open');
      menu = t ? t.querySelector(':scope > .menu') : null;
    }
    while (menu) {
      var open = menu.querySelector(':scope > .menu-item.open > .menu');
      if (!open) break;
      menu = open;
    }
    return menu;
  }

  function moveTitle(dir) {
    var titles = Array.prototype.slice.call(activeBar.querySelectorAll(':scope > .menu-title')).filter(function (t) {
      return !isDisabled(t);
    });
    var cur = activeBar.querySelector(':scope > .menu-title.open, :scope > .menu-title.active');
    var wasOpen = cur && cur.classList.contains('open');
    var next = titles[(titles.indexOf(cur) + dir + titles.length) % titles.length];
    if (!next) return;
    if (wasOpen) openTitle(next, true);
    else {
      titles.forEach(function (t) {
        t.classList.remove('active');
      });
      next.classList.add('active');
    }
  }

  function menuKey(e) {
    var menu = deepestMenu();
    var items = menuItems(menu);
    var cur = menu ? menu.querySelector(':scope > .menu-item.active') : null;
    var idx = items.indexOf(cur);
    var parentItem = menu ? menu.parentElement.closest('.menu-item') : null;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!menu) {
          var t = activeBar && activeBar.querySelector(':scope > .menu-title.active');
          if (t) openTitle(t, true);
        } else if (items.length) {
          var d = e.key === 'ArrowDown' ? 1 : -1;
          setActive(items[idx < 0 ? (d > 0 ? 0 : items.length - 1) : (idx + d + items.length) % items.length]);
        }
        return true;
      case 'ArrowRight':
        if (cur && cur.classList.contains('has-submenu') && !isDisabled(cur)) openSub(cur, true);
        else if (activeBar) moveTitle(1);
        return true;
      case 'ArrowLeft':
        if (parentItem) {
          closeSub(parentItem);
          setActive(parentItem);
        } else if (activeBar) moveTitle(-1);
        return true;
      case 'Enter':
        if (!menu) {
          var at = activeBar && activeBar.querySelector(':scope > .menu-title.active');
          if (at) openTitle(at, true);
        } else if (cur) {
          if (cur.classList.contains('has-submenu')) openSub(cur, true);
          else activate(cur);
        }
        return true;
      case 'Escape':
        if (parentItem) {
          closeSub(parentItem);
          setActive(parentItem);
        } else if (activeBar && menu) {
          var ot = activeBar.querySelector(':scope > .menu-title.open');
          ot.classList.remove('open');
          ot.classList.add('active');
          w95.clearStatus();
        } else closeMenus('escape');
        return true;
      case 'Tab':
        closeMenus('tab');
        return false;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      var k = e.key.toLowerCase();
      if (menu) {
        for (var i = 0; i < items.length; i++) {
          if (accessKeyOf(items[i]) === k) {
            setActive(items[i]);
            if (items[i].classList.contains('has-submenu')) openSub(items[i], true);
            else activate(items[i]);
            break;
          }
        }
      } else if (activeBar) {
        var ts = activeBar.querySelectorAll(':scope > .menu-title');
        for (var j = 0; j < ts.length; j++) {
          if (accessKeyOf(ts[j]) === k && !isDisabled(ts[j])) {
            openTitle(ts[j], true);
            break;
          }
        }
      }
      return true;
    }
    return false;
  }

  function toggleBarFocus() {
    if (activeBar || contextMenu) {
      closeMenus('alt');
      return;
    }
    var scope = topDialog() || document;
    var bar = scope.querySelector('.w95 .menu-bar, .menu-bar');
    var first = bar && bar.querySelector(':scope > .menu-title:not([aria-disabled="true"])');
    if (!first) return;
    first.classList.add('active');
    activeBar = bar;
    log('menu.focus', {});
  }

  /* ---------- 窓、ダイアログ ---------- */

  var appActive = true;
  var lastActive = null;
  var drag = null;

  function topDialog() {
    var ds = document.querySelectorAll('dialog[open]');
    return ds.length ? ds[ds.length - 1] : null;
  }

  /* 窓の中のキャンセルのボタン。data-cancel 属性か、ラベルで探す */
  function cancelButtonOf(win) {
    var marked = win.querySelector('button[data-cancel]:not(:disabled)');
    if (marked) return marked;
    var found = null;
    win.querySelectorAll('button:not(:disabled)').forEach(function (b) {
      if (!found && /^(キャンセル|cancel)$/i.test(textOf(b))) found = b;
    });
    return found;
  }

  function updateActive() {
    var wins = Array.prototype.slice.call(document.querySelectorAll('.w95 .window, .window.w95')).filter(function (w) {
      return w.tagName !== 'DIALOG' || w.open;
    });
    var modal = null;
    wins.forEach(function (w) {
      if (w.tagName === 'DIALOG' && w.matches(':modal')) modal = w;
    });
    var top = modal || (lastActive && wins.indexOf(lastActive) >= 0 ? lastActive : wins[0]);
    wins.forEach(function (w) {
      w.classList.toggle('inactive', !appActive || w !== top);
    });
  }

  /* Future OS での追加: プログラムから開いた窓を、押されたときと同じく手前の色にする */
  w95.activate = function (win) {
    lastActive = win;
    updateActive();
  };

  w95.openDialog = function (dlg, opts) {
    opts = opts || {};
    var title = textOf(dlg.querySelector('.title-bar-text'));
    if (!dlg.open) {
      /* 同じダイアログを開き直したときに、前回の結果が残らないようにする */
      dlg.returnValue = '';
      if (opts.modal === false) dlg.show();
      else dlg.showModal();
    }
    if (!dlg.dataset.moved) {
      dlg.style.position = 'fixed';
      dlg.style.margin = '0';
      dlg.style.left = Math.max(0, Math.round((window.innerWidth - dlg.offsetWidth) / 2)) + 'px';
      dlg.style.top = Math.max(0, Math.round((window.innerHeight - dlg.offsetHeight) / 2.5)) + 'px';
    }
    updateActive();
    var target = dlg.querySelector('[autofocus]') || dlg.querySelector('button.default') || dlg.querySelector('input, select, textarea, button');
    if (target) target.focus();
    log('dialog.open', { title: title });
    return new Promise(function (resolve) {
      dlg.addEventListener(
        'close',
        function () {
          updateActive();
          log('dialog.close', { title: title, result: dlg.returnValue });
          resolve(dlg.returnValue);
        },
        { once: true }
      );
    });
  };

  w95.closeDialog = function (dlg, value) {
    dlg.close(value === undefined ? '' : String(value));
  };

  var MSG_ICONS = {
    info:
      "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32' shape-rendering='crispEdges'><path fill='#808080' d='M9 6h16v2h3v3h2v12h-2v3h-3v2h-8l-5 4v-4h-3v-2H6V8h3z'/><path d='M7 3h16v2h3v3h2v12h-2v3h-3v2h-7l-6 5v-5H7v-2H4v-3H2V8h2V5h3z'/><path fill='#fff' d='M8 4h14v2h3v3h2v10h-2v3h-3v2h-7l-4 3v-3H8v-2H5v-3H3V9h2V6h3z'/><path fill='#00f' d='M13 7h4v4h-4zM11 13h6v8h3v2h-9v-2h3v-6h-3z'/></svg>",
    warning:
      "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32' shape-rendering='crispEdges'><path fill='#808080' d='M17 4h3l11 23v3H6v-3z'/><path d='M14 1h4l12 24v4H2v-4z'/><path fill='#ff0' d='M15 3h2l11 22v2H4v-2z'/><path d='M14 9h4v3l-1 8h-2l-1-8zM14 22h4v3h-4z'/></svg>",
    error:
      "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32' shape-rendering='crispEdges'><path fill='#808080' d='M13 4h10v2h3v3h3v3h2v10h-2v3h-3v3h-3v2H13v-2h-3v-3H7v-3H5V12h2V9h3V6h3z'/><path fill='#800000' d='M10 1h10v2h3v3h3v3h2v10h-2v3h-3v3h-3v2H10v-2H7v-3H4v-3H2V9h2V6h3V3h3z'/><path fill='#f00' d='M11 2h8v2h3v3h3v3h2v8h-2v3h-3v3h-3v2h-8v-2H8v-3H5v-3H3v-8h2V7h3V4h3z'/><path fill='#fff' d='M9 8l2-2 4 4 4-4 2 2-4 4 4 4-2 2-4-4-4 4-2-2 4-4z'/></svg>"
  };

  w95.msgbox = function (opts) {
    var o = typeof opts === 'string' ? { text: opts } : opts || {};
    var buttons = (o.buttons || ['OK']).map(function (b, i) {
      var spec = typeof b === 'string' ? { label: b } : b;
      var plain = String(spec.label).replace(/\(&.\)|&/g, '');
      return {
        label: spec.label,
        value: spec.value !== undefined ? String(spec.value) : plain,
        isDefault: spec.default !== undefined ? !!spec.default : i === 0,
        isCancel: !!spec.cancel || /^(cancel|キャンセル|いいえ|no)$/i.test(plain)
      };
    });
    var cancel = buttons.filter(function (b) {
      return b.isCancel;
    })[0];
    var dlg = document.createElement('dialog');
    dlg.className = 'window dialog msgbox';
    var html =
      "<div class='title-bar'><div class='title-bar-text'></div><div class='title-bar-controls'><button type='button' class='close' aria-label='閉じる'></button></div></div>" +
      "<div class='msgbox-body'>" +
      (MSG_ICONS[o.icon] || '') +
      "<div class='msgbox-text'></div></div><div class='button-row center' style='margin:0 11px 11px'></div>";
    dlg.innerHTML = html;
    dlg.querySelector('.title-bar-text').textContent = o.title || document.title;
    dlg.querySelector('.msgbox-text').textContent = o.text || '';
    var close = dlg.querySelector('.close');
    if (cancel || buttons.length === 1) close.dataset.close = (cancel || buttons[0]).value;
    else close.disabled = true;
    var row = dlg.querySelector('.button-row');
    buttons.forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.innerHTML = w95.label(b.label);
      el.dataset.close = b.value;
      if (b.isDefault) el.className = 'default';
      row.appendChild(el);
    });
    dlg.addEventListener('cancel', function (e) {
      if (!cancel && buttons.length > 1) e.preventDefault();
      else dlg.returnValue = (cancel || buttons[0]).value;
    });
    root().appendChild(dlg);
    log('msgbox.open', { title: o.title || document.title, text: o.text || '', icon: o.icon || '' });
    return w95.openDialog(dlg).then(function (v) {
      dlg.remove();
      return v;
    });
  };

  /* ---------- タブ ---------- */

  function selectTab(tab, focus) {
    var list = tab.parentElement;
    var tabs = Array.prototype.slice.call(list.querySelectorAll(':scope > .tab'));
    var pages = Array.prototype.slice.call(list.parentElement.querySelectorAll(':scope > .tab-page'));
    tabs.forEach(function (t, i) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var id = t.getAttribute('aria-controls');
      var page = id ? document.getElementById(id) : pages[i];
      if (page) page.hidden = !on;
    });
    if (focus) tab.focus();
    log('tab.select', { tab: textOf(tab) });
    emit(tab, 'w95:tab', { tab: tab });
  }

  w95.selectTab = selectTab;

  /* ---------- 一覧、ツリー ---------- */

  function rowsOf(container) {
    if (container.matches('table.details')) return Array.prototype.slice.call(container.querySelectorAll('tbody > tr'));
    return Array.prototype.slice.call(container.children);
  }

  function selectRow(container, row, additive) {
    var multi = container.hasAttribute('data-multi');
    if (!(multi && additive)) {
      rowsOf(container).forEach(function (r) {
        r.classList.remove('selected');
        r.removeAttribute('aria-selected');
      });
      row.classList.add('selected');
    } else row.classList.toggle('selected');
    row.setAttribute('aria-selected', row.classList.contains('selected') ? 'true' : 'false');
    if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    log('list.select', { item: textOf(row).slice(0, 80) });
    emit(row, 'w95:select', { item: row });
  }

  /* ---------- ツールチップ ---------- */

  var tipTimer = 0;
  var tipEl = null;
  var mouseX = 0;
  var mouseY = 0;

  function hideTip() {
    clearTimeout(tipTimer);
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
    }
  }

  function showTip(el) {
    if (!document.contains(el) || !el.dataset.tip) return;
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.textContent = el.dataset.tip;
    (el.closest('dialog[open]') || root()).appendChild(tipEl);
    var r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.max(0, Math.min(mouseX, window.innerWidth - r.width)) + 'px';
    tipEl.style.top = Math.min(mouseY + 20, window.innerHeight - r.height) + 'px';
  }

  /* ---------- 入力の受け口 ---------- */

  document.addEventListener(
    'mousedown',
    function (e) {
      hideTip();
      var t = e.target;
      if (!(t instanceof Element)) return;

      var title = t.closest('.w95 .menu-bar > .menu-title');
      if (title && !t.closest('.menu')) {
        e.preventDefault();
        if (isDisabled(title)) return;
        if (title.classList.contains('open')) closeMenus('title');
        else openTitle(title, false);
        return;
      }
      if (!t.closest('.w95 .menu')) closeMenus('outside');

      var win = t.closest('.w95 .window, .window.w95');
      if (win && win !== lastActive) {
        lastActive = win;
        updateActive();
      }

      var bar = t.closest('.w95 .title-bar');
      if (bar && e.button === 0 && !t.closest('.title-bar-controls')) {
        var w = bar.closest('.window');
        if (w && (w.tagName === 'DIALOG' || w.hasAttribute('data-draggable'))) {
          var r = w.getBoundingClientRect();
          drag = { win: w, dx: e.clientX - r.left, dy: e.clientY - r.top };
          w.style.position = 'fixed';
          w.style.margin = '0';
          w.style.left = r.left + 'px';
          w.style.top = r.top + 'px';
          e.preventDefault();
        }
      }

      var list = t.closest('.w95 .list, .w95 table.details');
      if (list) {
        var row = list.matches('table.details') ? t.closest('tbody > tr') : t.closest('.list > *');
        if (row && e.button === 0) selectRow(list, row, e.ctrlKey || e.metaKey);
      }

      var tl = t.closest('.w95 ul.tree .label');
      if (tl) {
        var tree = tl.closest('ul.tree');
        tree.querySelectorAll('.selected').forEach(function (s) {
          s.classList.remove('selected');
        });
        tl.classList.add('selected');
        if (tree.tabIndex >= 0) tree.focus();
        log('tree.select', { item: textOf(tl) });
        emit(tl, 'w95:select', { item: tl });
      }
    },
    true
  );

  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!drag) return;
    var w = drag.win;
    w.style.left = Math.max(40 - w.offsetWidth, Math.min(window.innerWidth - 40, e.clientX - drag.dx)) + 'px';
    w.style.top = Math.max(0, Math.min(window.innerHeight - 20, e.clientY - drag.dy)) + 'px';
    w.dataset.moved = '1';
  });

  document.addEventListener('mouseup', function () {
    if (!drag) return;
    log('window.move', { title: textOf(drag.win.querySelector('.title-bar-text')), left: drag.win.style.left, top: drag.win.style.top });
    drag = null;
  });

  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var title = t.closest('.w95 .menu-bar > .menu-title');
    if (title && !t.closest('.menu')) {
      if (activeBar === title.parentElement && !title.classList.contains('open') && !isDisabled(title)) openTitle(title, false);
      return;
    }

    var item = t.closest('.w95 .menu-item');
    if (item) {
      setActive(item);
      clearTimeout(submenuTimer);
      submenuTimer = setTimeout(function () {
        menuItems(item.parentElement).forEach(function (i) {
          if (i !== item && i.classList.contains('open')) closeSub(i);
        });
        if (item.classList.contains('has-submenu') && !isDisabled(item) && !item.classList.contains('open')) openSub(item, false);
      }, 300);
      return;
    }

    var hinted = t.closest('.w95 [data-status]');
    if (hinted && !activeBar && !contextMenu) showHint(hinted);

    var tipped = t.closest('.w95 [title], .w95 [data-tip]');
    if (tipped) {
      if (tipped.hasAttribute('title')) {
        tipped.dataset.tip = tipped.getAttribute('title');
        if (!tipped.hasAttribute('aria-label')) tipped.setAttribute('aria-label', tipped.dataset.tip);
        tipped.removeAttribute('title');
      }
      if (!tipEl) {
        clearTimeout(tipTimer);
        tipTimer = setTimeout(function () {
          showTip(tipped);
        }, 500);
      }
    }
  });

  document.addEventListener('mouseout', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var item = t.closest('.w95 .menu-item');
    if (item && !item.contains(e.relatedTarget) && !item.classList.contains('open')) {
      item.classList.remove('active');
      if (activeBar || contextMenu) w95.clearStatus();
    }
    var hinted = t.closest('.w95 [data-status]');
    if (hinted && !hinted.contains(e.relatedTarget) && !activeBar && !contextMenu) w95.clearStatus();
    var tipped = t.closest('.w95 [data-tip]');
    if (tipped && !tipped.contains(e.relatedTarget)) hideTip();
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var item = t.closest('.w95 .menu-item');
    if (item) {
      activate(item);
      return;
    }

    var tab = t.closest('.w95 .tab-list > .tab');
    if (tab) {
      selectTab(tab, false);
      return;
    }

    var closer = t.closest('[data-close]');
    var cb = t.closest('.w95 .title-bar-controls > button');
    if (closer && closer.closest('dialog')) {
      w95.closeDialog(closer.closest('dialog'), closer.dataset.close);
      return;
    }
    if (cb) {
      var action = ['min', 'max', 'restore', 'close', 'help'].filter(function (a) {
        return cb.classList.contains(a);
      })[0];
      var win = cb.closest('.window');
      log('window.button', { action: action || '', title: textOf(win && win.querySelector('.title-bar-text')) });
      var go = emit(cb, 'w95:window', { action: action, window: win });
      if (go && action === 'close' && win) {
        if (win.tagName === 'DIALOG') w95.closeDialog(win, 'cancel');
        else if (win.classList.contains('dialog')) {
          /* ダイアログ型の窓の閉じるボタンは、キャンセルと同じ働き */
          var cancelBtn = cancelButtonOf(win);
          if (cancelBtn) cancelBtn.click();
        }
      }
      return;
    }

    /* ツリーのラベルは 1 回のクリックでは開閉しない（選択だけ） */
    if (t.closest('.w95 ul.tree summary .label')) e.preventDefault();

    var btn = t.closest('.w95 button, .w95 input[type="button"], .w95 input[type="submit"]');
    if (btn) log('button.click', { label: textOf(btn) || btn.value || btn.getAttribute('aria-label') || btn.dataset.tip || '' });
  });

  document.addEventListener('dblclick', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var sl = t.closest('.w95 ul.tree summary .label');
    if (sl) {
      var d = sl.closest('details');
      d.open = !d.open;
      return;
    }
    var list = t.closest('.w95 .list, .w95 table.details');
    var row = list && (list.matches('table.details') ? t.closest('tbody > tr') : t.closest('.list > *'));
    if (row) {
      log('list.open', { item: textOf(row).slice(0, 80) });
      emit(row, 'w95:open', { item: row });
    }
  });

  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var host = t.closest('.w95 [data-context-menu]');
    if (!host) return;
    var menu = document.querySelector(host.dataset.contextMenu);
    if (!menu) return;
    e.preventDefault();
    w95.popupMenu(menu, e.clientX, e.clientY);
  });

  /* キーボードでフォーカスが移ったときも、ステータスバーに説明文を出す */
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!(t instanceof Element) || activeBar || contextMenu) return;
    var hinted = t.closest('.w95 [data-status]');
    if (hinted) showHint(hinted);
  });

  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (!(t instanceof Element) || activeBar || contextMenu) return;
    if (t.closest('.w95 [data-status]')) w95.clearStatus();
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!(t instanceof Element) || !t.closest('.w95')) return;
    var name = t.name || t.id || textOf(t.closest('label')) || t.type || t.tagName.toLowerCase();
    var value = t.type === 'checkbox' || t.type === 'radio' ? t.checked : t.type === 'password' ? '(非表示)' : String(t.value).slice(0, 80);
    log('input.change', { name: name, value: value });
  });

  var altTap = false;

  document.addEventListener(
    'keydown',
    function (e) {
      hideTip();
      /* かな漢字変換の途中のキーは、変換の操作なので扱わない */
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Alt') {
        altTap = !e.repeat && !e.ctrlKey && !e.shiftKey;
        return;
      }
      altTap = false;

      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        if (handleAccessKey(e.key.toLowerCase())) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey) {
        toggleBarFocus();
        e.preventDefault();
        return;
      }

      if (activeBar || contextMenu) {
        if (menuKey(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      var t = e.target instanceof Element ? e.target : null;
      if (!t) return;

      var tab = t.closest('.w95 .tab-list > .tab');
      if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        var tabs = Array.prototype.slice.call(tab.parentElement.querySelectorAll(':scope > .tab'));
        var n = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        selectTab(n, true);
        e.preventDefault();
        return;
      }

      var list = t.closest('.w95 .list, .w95 table.details, .w95 .field');
      if (list && list.matches('.field')) list = list.querySelector('table.details');
      if (list && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].indexOf(e.key) >= 0) {
        var rows = rowsOf(list);
        var cur = rows.filter(function (r) {
          return r.classList.contains('selected');
        })[0];
        var i = rows.indexOf(cur);
        if (e.key === 'Enter') {
          if (cur) {
            log('list.open', { item: textOf(cur).slice(0, 80) });
            emit(cur, 'w95:open', { item: cur });
            e.preventDefault();
          }
          return;
        }
        var ni = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        if (rows[ni]) selectRow(list, rows[ni], false);
        e.preventDefault();
        return;
      }

      /* ダイアログの中で、文字を入力しない部品にフォーカスがあるときは、
         Alt なしの文字キーでもアクセスキーが働く（メッセージボックスの Y、N など） */
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.key !== ' ') {
        var inDialog = t.closest('dialog[open]');
        var typing = t.matches('textarea, select, [contenteditable="true"]') || (t.matches('input') && !/^(checkbox|radio|button|submit|reset|range)$/.test(t.type));
        if (inDialog && !typing && handleAccessKey(e.key.toLowerCase(), true)) {
          e.preventDefault();
          return;
        }
      }

      /* <dialog> でないダイアログ型の窓では、Esc がキャンセルのボタンを押す */
      if (e.key === 'Escape' && !topDialog()) {
        var alone = document.querySelectorAll('.w95 .window.dialog');
        var cw = t.closest('.w95 .window.dialog') || (alone.length === 1 ? alone[0] : null);
        var cancel = cw && cancelButtonOf(cw);
        if (cancel) {
          cancel.click();
          e.preventDefault();
          return;
        }
      }

      /* ダイアログでは Enter が既定のボタンを押す。タブにフォーカスがあるときも同じ */
      if (e.key === 'Enter') {
        var dlg = t.closest('dialog[open], .w95 .window');
        if (dlg && !t.matches('button:not(.tab), textarea, select, a, summary, [contenteditable="true"]')) {
          var def = dlg.querySelector('button.default:not(:disabled)');
          if (def) {
            def.click();
            e.preventDefault();
          }
        }
      }
    },
    true
  );

  document.addEventListener('keyup', function (e) {
    if (e.key === 'Alt' && altTap) {
      altTap = false;
      toggleBarFocus();
      e.preventDefault();
    }
  });

  function handleAccessKey(key, skipMenus) {
    var scope = topDialog() || document;
    var titles = skipMenus ? [] : scope.querySelectorAll('.menu-bar > .menu-title');
    for (var i = 0; i < titles.length; i++) {
      if (accessKeyOf(titles[i]) === key && !isDisabled(titles[i]) && isVisible(titles[i])) {
        openTitle(titles[i], true);
        log('accesskey', { key: key, target: labelText(titles[i]) });
        return true;
      }
    }
    var els = scope.querySelectorAll('button, label, legend');
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      if (accessKeyOf(el) !== key || !isVisible(el) || el.closest('.menu')) continue;
      if (el.matches('.tab')) {
        selectTab(el, true);
      } else if (el.matches('button')) {
        if (el.disabled) continue;
        el.focus();
        el.click();
      } else if (el.matches('label')) {
        var c = el.control || el.querySelector('input, select, textarea');
        if (!c || c.disabled) continue;
        c.focus();
        if (c.type === 'checkbox' || c.type === 'radio') c.click();
      } else {
        var f = el.parentElement.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)');
        if (!f) continue;
        f.focus();
      }
      log('accesskey', { key: key, target: textOf(el) });
      return true;
    }
    return false;
  }

  document.addEventListener(
    'cancel',
    function (e) {
      if (e.target instanceof HTMLDialogElement) e.target.returnValue = 'cancel';
    },
    true
  );

  window.addEventListener('blur', function () {
    appActive = false;
    closeMenus('blur');
    updateActive();
  });

  window.addEventListener('focus', function () {
    appActive = true;
    updateActive();
  });

  window.addEventListener('error', function (e) {
    log('error', { message: e.message, source: (e.filename || '') + ':' + (e.lineno || 0) });
  });

  window.addEventListener('unhandledrejection', function (e) {
    log('error', { message: String(e.reason && e.reason.message ? e.reason.message : e.reason) });
  });

  /* ---------- 初期化 ---------- */

  w95.init = function (scope) {
    scope = scope || document;
    normalizeMenus(scope);
    scope.querySelectorAll('.tab-list').forEach(function (list) {
      var tabs = Array.prototype.slice.call(list.querySelectorAll(':scope > .tab'));
      var pages = Array.prototype.slice.call(list.parentElement.querySelectorAll(':scope > .tab-page'));
      var sel = tabs.filter(function (t) {
        return t.getAttribute('aria-selected') === 'true';
      })[0] || tabs[0];
      tabs.forEach(function (t, i) {
        var on = t === sel;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('role', 'tab');
        t.tabIndex = on ? 0 : -1;
        var id = t.getAttribute('aria-controls');
        var page = id ? document.getElementById(id) : pages[i];
        if (page) page.hidden = !on;
      });
    });
    updateActive();
  };

  w95.closeMenus = closeMenus;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { w95.init(); });
  else w95.init();
})();
