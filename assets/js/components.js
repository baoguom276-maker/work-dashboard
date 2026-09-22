/* ============================================================
 * components.js — 通用 UI 组件
 * modal / toast / confirm / 状态标签下拉 / 模块标签 / 任务卡片
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  /* ---------------- 弹窗 ---------------- */
  function modal(opts) {
    const root = document.getElementById('modalRoot');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const el = document.createElement('div');
    el.className = 'modal' + (opts.size === 'lg' ? ' modal-lg' : '');
    el.innerHTML = D.html`
      <div class="modal-head">
        <div class="modal-title">${opts.title || ''}</div>
        <button class="icon-btn modal-close" title="关闭（Esc）">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div>`;
    overlay.appendChild(el);
    root.appendChild(overlay);

    const bodyEl = el.querySelector('.modal-body');
    const footEl = el.querySelector('.modal-foot');
    if (opts.bodyNode) bodyEl.appendChild(opts.bodyNode);
    else if (opts.body) bodyEl.innerHTML = opts.body;

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
      opts.onClose && opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function onOutside(e) { if (e.target === overlay) close(); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    el.querySelector('.modal-close').addEventListener('click', close);

    function setFoot(buttons) {
      footEl.innerHTML = '';
      (buttons || []).forEach((b, i) => {
        if (b.spacer) { const s = document.createElement('div'); s.className = 'spacer'; footEl.appendChild(s); return; }
        const btn = document.createElement('button');
        btn.className = 'btn ' + (b.variant === 'primary' ? 'btn-primary' : b.variant === 'danger' ? 'btn-danger' : '');
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
          if (b.onClick) b.onClick({ close, bodyEl, el });
        });
        footEl.appendChild(btn);
      });
    }
    setFoot(opts.buttons);

    // 打开后自动聚焦首个输入框
    setTimeout(() => {
      const first = el.querySelector('input[type=text], input:not([type]), textarea, select');
      if (first) first.focus();
    }, 30);

    return { el, bodyEl, close, setFoot };
  }

  /* ---------------- Toast ---------------- */
  function toast(msg, ms, action) {
    const root = document.getElementById('toastRoot');
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = msg;
    if (action && action.label) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { node.remove(); if (action.onClick) action.onClick(); });
      node.appendChild(btn);
    }
    root.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity .25s';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 260);
    }, ms || 2200);
  }

  /* ---------------- 确认框 ---------------- */
  function confirm(message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const m = modal({
        title: opts.title || '请确认',
        body: D.html`<div style="font-size:13.5px;line-height:1.7">${message}</div>`,
        buttons: [
          { label: '取消', onClick: ({ close }) => { close(); resolve(false); } },
          {
            label: opts.confirmText || '确定', variant: opts.danger ? 'danger' : 'primary',
            onClick: ({ close }) => { close(); resolve(true); }
          }
        ]
      });
    });
  }

  /* ---------------- 模块标签 ---------------- */
  function moduleTag(name) {
    const c = D.moduleColor(name || '');
    return D.raw(D.html`<span class="tag tag-module" style="background:${c.bg};color:${c.color};border-color:${c.border}">${name || '未分类'}</span>`);
  }

  function personTags(personIds, personMap) {
    const items = (personIds || [])
      .map(id => ({ id, name: (personMap[id] || {}).name }))
      .filter(x => x.name);
    if (!items.length) return null;
    return D.raw(items.map(x => D.html`<button type="button" class="tag tag-person tag-person-link" data-person-view="${x.id}" title="查看 ${x.name} 的所有任务">${x.name}</button>`).join(''));
  }

  /* ---------------- 状态标签 + 全局下拉 ---------------- */
  function statusTag(task) {
    const meta = D.STATUS_MAP[task.status] || D.STATUS_MAP.pending;
    return D.raw(D.html`
      <button type="button" class="tag tag-status ${meta.cls}"
        data-status-menu="${task.id}" data-status="${task.status}"
        title="点击切换状态">${meta.label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
      </button>`);
  }

  function closePopMenu() {
    const old = document.getElementById('activePopMenu');
    if (old) old.remove();
    document.removeEventListener('mousedown', onPopOutside, true);
  }
  function onPopOutside(e) {
    if (!e.target.closest('.pop-menu') && !e.target.closest('[data-status-menu]')) closePopMenu();
  }

  function openStatusMenu(trigger) {
    const taskId = trigger.dataset.statusMenu;
    closePopMenu();
    const rect = trigger.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'pop-menu';
    menu.id = 'activePopMenu';
    menu.innerHTML = D.STATUSES.map(s => D.html`
      <button type="button" class="pop-menu-item" data-set-status="${s.key}">
        <span class="pm-dot" style="background:${s.dot}"></span>${s.label}
      </button>`).join('');
    document.getElementById('menuRoot').appendChild(menu);
    // 定位：默认在触发器下方，空间不足则向上
    const top = rect.bottom + 4;
    menu.style.left = Math.min(rect.left, window.innerWidth - 150) + 'px';
    menu.style.top = (top + menu.offsetHeight > window.innerHeight ? rect.top - menu.offsetHeight - 4 : top) + 'px';

    menu.addEventListener('click', e => {
      const item = e.target.closest('[data-set-status]');
      if (!item) return;
      App.Tasks.setStatus(taskId, item.dataset.setStatus);
      closePopMenu();
    });
    document.addEventListener('mousedown', onPopOutside, true);
  }

  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-status-menu]');
    if (trigger) { e.stopPropagation(); openStatusMenu(trigger); }
  });

  /* ---------------- 固定任务专属快捷按钮 ---------------- */
  function fixedQuickActions(task) {
    // 根据模板 ID 显示不同快捷按钮
    if (task.templateId === 'tpl_1' || /审核视频.*Quota/i.test(task.title)) {
      return D.raw(D.html`
        <button class="btn btn-sm btn-quota" data-task-action="quota" title="录入 Quota 数据">
          📊 检查 Quota
        </button>`);
    }
    if (task.templateId === 'tpl_3' || /检查剪辑手.*异常/i.test(task.title)) {
      return D.raw(D.html`
        <button class="btn btn-sm btn-ghost" data-task-action="quick-add-problem" title="快速记录一个异常">
          + 记录异常
        </button>
        <button class="btn btn-sm" data-task-action="done" title="标记完成">
          ✓ 无异常
        </button>`);
    }
    // 其他固定任务默认显示 ✓ 今日完成
    return D.raw(D.html`
      <button class="btn btn-sm" data-task-action="done" title="标记完成">
        ✓ 今日完成
      </button>`);
  }

  /* ---------------- 任务卡片 ---------------- */
  function taskCard(task, opts) {
    opts = opts || {};
    const pm = App.Store.personMap();
    const meta = D.STATUS_MAP[task.status] || D.STATUS_MAP.pending;
    const people = personTags(task.personIds, pm);

    const originLine = opts.showOrigin && task.date !== D.today()
      ? D.raw(D.html`<span class="tc-origin">原始日期：${D.fmtCN(task.date)}</span>`)
      : null;
    const dateLine = opts.showDate
      ? D.raw(D.html`<span>${D.relLabel(task.date)}</span>`)
      : null;
    const tplLine = task.templateId
      ? D.raw(D.html`<span title="由重复任务模板生成">🔁 固定任务</span>`)
      : null;
    const badgeLine = opts.badge
      ? D.raw(D.html`<span class="tc-origin">${opts.badge}</span>`)
      : null;

    const metaBits = [originLine || dateLine, badgeLine, tplLine, people].filter(Boolean);

    const doneBtn = task.status === 'done'
      ? D.html`<button class="icon-btn tc-done-btn" data-task-action="reopen" title="撤销完成"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>`
      : D.html`<button class="icon-btn tc-done-btn" data-task-action="done" title="标记完成"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l5 5L20 6"/></svg></button>`;

    // 固定任务显示专属快捷按钮（未完成时）
    const quickActions = (opts.fixedTask && task.status !== 'done') ? fixedQuickActions(task) : null;

    return D.raw(D.html`
      <div class="task-card ${task.status === 'done' ? 'is-done' : ''}" data-task-id="${task.id}" draggable="${opts.draggable === false ? 'false' : 'true'}">
        <div class="tc-drag" title="拖拽调整顺序"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></div>
        <div class="tc-main">
          <div class="tc-line1">
            ${moduleTag(task.module)}
            <span class="task-title">${task.title}</span>
            ${statusTag(task)}
          </div>
          ${metaBits.length ? D.raw('<div class="tc-line2">' + metaBits.map(b => b.s).join('') + '</div>') : ''}
          ${task.result ? D.raw(D.html`<div class="tc-note">${task.result}</div>`) : ''}
          ${quickActions ? D.raw(D.html`<div class="tc-quick-actions">${quickActions}</div>`) : ''}
        </div>
        <div class="tc-actions">
          ${D.raw(doneBtn)}
          <button class="icon-btn tc-edit-btn" data-task-action="edit" title="编辑（也可双击任务）">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-btn tc-copy-btn" data-task-action="copy" title="复制任务">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="icon-btn tc-del-btn" data-task-action="delete" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>`);
  }

  function emptyState(title, sub, icon) {
    return D.raw(D.html`
      <div class="empty-state">
        <div class="es-icon">${icon || '📋'}</div>
        <div class="es-title">${title}</div>
        ${sub ? D.raw(D.html`<div class="es-sub">${sub}</div>`) : ''}
      </div>`);
  }

  /* ---------------- Drawer（右侧抽屉） ---------------- */
  function drawer(opts) {
    const root = document.getElementById('modalRoot');
    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    const el = document.createElement('div');
    el.className = 'drawer';
    el.innerHTML = D.html`
      <div class="drawer-head">
        <div class="drawer-title">${opts.title || ''}</div>
        <button class="icon-btn drawer-close" title="关闭（Esc）">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="drawer-body"></div>`;
    overlay.appendChild(el);
    root.appendChild(overlay);

    const bodyEl = el.querySelector('.drawer-body');
    if (opts.bodyNode) bodyEl.appendChild(opts.bodyNode);
    else if (opts.body) bodyEl.innerHTML = opts.body;

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
      opts.onClose && opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function onOutside(e) { if (e.target === overlay) close(); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    el.querySelector('.drawer-close').addEventListener('click', close);

    setTimeout(() => overlay.classList.add('show'), 10);

    return { el, bodyEl, close };
  }

  App.UI = { modal, toast, confirm, moduleTag, personTags, statusTag, taskCard, emptyState, drawer };
})();
