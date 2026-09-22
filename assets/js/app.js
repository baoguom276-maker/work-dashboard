/* ============================================================
 * app.js — 应用入口
 * Store（内存状态 + 订阅刷新）/ Tasks 操作 / Templates 自动生成
 * 任务卡片事件绑定 / 日报弹窗 / 侧边导航与 hash 路由
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  /* ================= Store ================= */
  const Store = {
    state: null,
    listeners: [],

    load() { this.state = App.DB.exportAll(); },
    commit() {
      this.state = App.DB.exportAll();
      this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    },
    on(fn) { this.listeners.push(fn); },

    personMap() {
      const m = {};
      this.state.people.forEach(p => { m[p.id] = p; });
      return m;
    },
    tasksOn(dateStr) {
      return this.state.tasks
        .filter(t => t.date === dateStr)
        .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt < b.createdAt ? -1 : 1));
    },
    /** 往日遗留未完成的任务数（导航角标：只提醒真正逾期的事项） */
    openCount() {
      const today = D.today();
      return this.state.tasks.filter(t => t.status !== 'done' && t.date < today).length;
    }
  };
  App.Store = Store;

  /* ================= 任务操作 ================= */
  const Tasks = {
    save(data) {
      const now = new Date().toISOString();
      if (data.id && App.DB.find('tasks', data.id)) {
        const patch = {
          title: data.title, module: data.module, personIds: data.personIds || [],
          status: data.status, result: data.result || '', date: data.date,
          updatedAt: now,
          completedAt: data.status === 'done' ? (App.DB.find('tasks', data.id).completedAt || now) : null
        };
        App.DB.update('tasks', data.id, patch);
      } else {
        const dayTasks = Store.state.tasks.filter(t => t.date === data.date);
        const maxOrder = dayTasks.reduce((m, t) => Math.max(m, t.order || 0), 0);
        const task = {
          id: data.id || D.uid('task'),
          date: data.date,
          module: data.module,
          title: data.title,
          personIds: data.personIds || [],
          status: data.status,
          result: data.result || '',
          templateId: data.templateId || null,
          order: data.order != null ? data.order : maxOrder + 10,
          createdAt: now,
          updatedAt: now,
          completedAt: data.status === 'done' ? now : null
        };
        App.DB.add('tasks', task);
      }
    },

    setStatus(id, status) {
      const t = App.DB.find('tasks', id);
      if (!t) return;
      const now = new Date().toISOString();
      App.DB.update('tasks', id, {
        status: status,
        updatedAt: now,
        completedAt: status === 'done' ? (t.completedAt || now) : null
      });
      if (status !== 'done') { App.UI.toast('已完成 ✓'); return; }

      // 固定任务（模板生成）今日完成时，自动关闭往日遗留的同模板未完成实例：
      // 这类工作是按日循环的，今天做完等于把前几天的欠账补齐。
      // 手动任务相互独立，不受此影响。
      if (t.templateId) {
        const today = D.today();
        const stale = App.DB.all('tasks').filter(x =>
          x.templateId === t.templateId
          && x.id !== t.id
          && x.date < today
          && x.status !== 'done'
        );
        if (stale.length) {
          const closedAt = new Date().toISOString();
          App.DB.bulkUpdate('tasks', stale.map(x => ({
            id: x.id,
            patch: { status: 'done', updatedAt: closedAt, completedAt: closedAt }
          })));
          App.UI.toast(`已完成 ✓（同步关闭 ${stale.length} 条往日遗留）`, 3500);
          return;
        }
      }
      App.UI.toast('已完成 ✓');
    },

    remove(id) { App.DB.remove('tasks', id); },

    duplicate(id) {
      const t = App.DB.find('tasks', id);
      if (!t) return;
      const now = new Date().toISOString();
      const dayTasks = Store.state.tasks.filter(x => x.date === t.date);
      const maxOrder = dayTasks.reduce((m, x) => Math.max(m, x.order || 0), 0);
      App.DB.add('tasks', {
        ...JSON.parse(JSON.stringify(t)),
        id: D.uid('task'),
        title: t.title.replace(/（副本\d*）$/, '') + '（副本）',
        status: 'pending',
        completedAt: null,
        templateId: null,
        order: maxOrder + 10,
        createdAt: now, updatedAt: now
      });
      App.UI.toast('已复制到当天');
    },

    /** 拖拽排序：ids 为当天未完成任务的新顺序 */
    reorder(dateStr, ids) {
      const patches = ids.map((id, i) => ({ id, patch: { order: (i + 1) * 10, updatedAt: new Date().toISOString() } }));
      App.DB.bulkUpdate('tasks', patches);
    }
  };
  App.Tasks = Tasks;

  /* ================= 重复任务模板：自动生成 ================= */
  const Templates = {
    shouldGenerate(tpl, dateStr) {
      if (!tpl.active) return false;
      if (tpl.freq === 'daily') return true;
      if (tpl.freq === 'weekdays') {
        const wd = D.weekday(dateStr);
        return wd >= 1 && wd <= 5;
      }
      if (tpl.freq === 'weekly') return (tpl.weekdays || []).indexOf(D.weekday(dateStr)) !== -1;
      return false;
    },

    /**
     * 确保某日的固定任务已生成（幂等：依据生成日志，同模板同天只生成一次）。
     * 已生成的任务即便被删除或改期，也不会在同一天被再次自动补建，
     * 避免与用户的手动操作冲突。
     */
    ensureFor(dateStr) {
      const all = App.DB.all('templates');
      const now = new Date().toISOString();
      const due = all.filter(tpl => this.shouldGenerate(tpl, dateStr) && !App.DB.isGenerated(tpl.id, dateStr));
      const fresh = due.map(tpl => ({
        id: D.uid('task'),
        date: dateStr,
        module: tpl.module,
        title: tpl.title,
        personIds: (tpl.personIds || []).slice(),
        status: 'pending',
        result: '',
        templateId: tpl.id,
        order: tpl.order || 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null
      }));
      if (fresh.length) {
        App.DB.bulkAdd('tasks', fresh);
        App.DB.markGenerated(due.map(tpl => ({ tplId: tpl.id, dateStr })));
      }
      return fresh.length;
    }
  };
  App.Templates = Templates;

  /* ================= 任务卡片统一事件绑定 =================
   * 注意：#view 根节点在路由切换间复用，必须随每次挂载终止上一轮监听，
   * 否则会在同一个根节点上累积重复 listener（一次双击弹多个框）。 */
  let mountController = null;
  App.startMount = function () {
    if (mountController) mountController.abort();
    mountController = new AbortController();
  };

  App.bindTaskActions = function (root, opts) {
    opts = opts || {};
    // persistent=true 用于路由 #view 之外的容器（如人员 Drawer），不随视图重挂载 abort
    const listenOpts = (!opts.persistent && mountController) ? { signal: mountController.signal } : undefined;
    root.addEventListener('click', async e => {
      const btn = e.target.closest('[data-task-action]');
      if (!btn) return;
      const card = btn.closest('[data-task-id]');
      if (!card) return;
      const id = card.dataset.taskId;
      const action = btn.dataset.taskAction;
      if (action === 'done') {
        Tasks.setStatus(id, 'done');
      } else if (action === 'reopen') {
        Tasks.setStatus(id, 'pending');
        App.UI.toast('已重新打开');
      } else if (action === 'edit') {
        const t = App.DB.find('tasks', id);
        if (t) App.TaskForm.open(t);
      } else if (action === 'copy') {
        Tasks.duplicate(id);
      } else if (action === 'delete') {
        const t = App.DB.find('tasks', id);
        if (!t) return;
        const ok = await App.UI.confirm(`确定删除任务「${t.title}」吗？`, { danger: true, confirmText: '删除' });
        if (ok) { Tasks.remove(id); App.UI.toast('已删除'); }
      } else if (action === 'quota') {
        App.QuotaPanel.open(D.today());
      } else if (action === 'quick-add-problem') {
        const t = App.DB.find('tasks', id);
        if (t) App.TaskForm.quickRecord('', t.date);
      }
    }, listenOpts);

    // 双击卡片任意位置 = 编辑
    root.addEventListener('dblclick', e => {
      const card = e.target.closest('.task-card');
      if (!card || e.target.closest('button, a, input, select')) return;
      const t = App.DB.find('tasks', card.dataset.taskId);
      if (t) App.TaskForm.open(t);
    }, listenOpts);
  };

  /* ================= 日报弹窗 ================= */
  App.Report.open = function (dateStr) {
    let date = dateStr || D.today();

    const body = document.createElement('div');
    function render() {
      const r = App.Report.build(date);
      body.innerHTML = D.html`
        <div class="report-date-row">
          <span style="font-size:13px;font-weight:600;color:var(--text-2)">日报日期</span>
          <input type="date" class="input" id="rpDate" value="${date}" />
          <span style="font-size:12px;color:var(--text-3)">共 ${r.counts.total} 条任务</span>
        </div>
        <textarea class="report-preview" id="rpText" spellcheck="false">${r.plain}</textarea>`;
      body.querySelector('#rpDate').addEventListener('change', e => {
        if (e.target.value) { date = e.target.value; render(); }
      });
    }
    render();

    const m = App.UI.modal({
      title: '一键生成日报',
      size: 'lg',
      bodyNode: body,
      buttons: [
        {
          label: '复制（可直接粘贴飞书）', variant: 'primary',
          onClick: async () => {
            const text = body.querySelector('#rpText').value;
            const ok = await D.copyText(text);
            App.UI.toast(ok ? '日报已复制，去飞书粘贴吧' : '复制失败，请手动全选复制');
          }
        },
        {
          label: '下载 .txt',
          onClick: () => D.download(App.Report.filename(date), body.querySelector('#rpText').value)
        },
        { label: '关闭', onClick: ({ close }) => close() }
      ]
    });
  };

  /* ================= 导航与路由 ================= */
  const NAV = [
    { hash: '#/today', view: 'today', label: '今日工作台', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
    { hash: '#/followups', view: 'followups', label: '待跟进', icon: 'M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3', badge: true },
    { hash: '#/history', view: 'history', label: '历史记录', icon: 'M3 5h18M3 12h18M3 19h12' },
    { group: '资源管理' },
    { hash: '#/accounts', view: 'accounts', label: '账号管理', icon: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1', soon: true },
    { hash: '#/people', view: 'people', label: '人员管理', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { hash: '#/stats', view: 'stats', label: '工作统计', icon: 'M18 20V10M12 20V4M6 20v-6', soon: true },
    { hash: '#/settings', view: 'settings', label: '设置', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z' }
  ];

  function navIcon(path) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
  }

  function renderNav(activeHash) {
    const openCount = Store.openCount();
    const nav = document.getElementById('nav');
    nav.innerHTML = NAV.map(item => {
      if (item.group) return D.html`<div class="nav-group-label">${item.group}</div>`;
      const badge = item.badge && openCount > 0 ? D.raw(D.html`<span class="nav-badge">${openCount}</span>`) : '';
      const soon = item.soon ? D.raw(D.html`<span class="tag tag-soon">二期</span>`) : '';
      return D.html`
        <button class="nav-item ${item.hash === activeHash ? 'active' : ''}" data-hash="${item.hash}">
          ${D.raw(navIcon(item.icon))}
          <span>${item.label}</span>
          ${soon}
          ${badge}
        </button>`;
    }).join('');
    nav.querySelectorAll('[data-hash]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (location.hash !== btn.dataset.hash) location.hash = btn.dataset.hash;
        else route();
        closeMobileSidebar();
      });
    });
  }

  function mountView(viewName) {
    const root = document.getElementById('view');
    root.innerHTML = '';
    App.startMount();           // 终止上一轮事件监听，避免重复绑定
    App.Views[viewName].mount(root);
  }

  /** 重新挂载当前视图（供页面内部筛选等场景使用，确保监听不累积） */
  App.refresh = function () {
    const hash = location.hash || '#/today';
    const conf = NAV.find(n => n.hash === hash);
    mountView(conf ? conf.view : 'today');
  };

  function route() {
    const hash = location.hash || '#/today';
    const conf = NAV.find(n => n.hash === hash);
    const viewName = conf ? conf.view : 'today';
    renderNav(conf ? hash : '#/today');
    mountView(viewName);
    window.scrollTo(0, 0);
  }

  /* ================= 移动端侧边栏 ================= */
  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarMask').classList.remove('show');
  }

  /* ================= 启动 ================= */
  function boot() {
    App.DB.init();
    Store.load();
    App.DB.onChange(() => Store.commit());
    Store.on(() => {
      const hash = location.hash || '#/today';
      renderNav(hash);
      const conf = NAV.find(n => n.hash === hash);
      const viewName = conf ? conf.view : 'today';
      const root = document.getElementById('view');
      // 输入框聚焦时不整体重绘，避免打断输入
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
          root.contains(active) && active.value !== undefined) {
        // 延迟到失焦后由下次事件刷新；此处仅更新角标已在 renderNav 中完成
        return;
      }
      mountView(viewName);
    });

    // 每天首次打开自动生成当天固定任务
    Templates.ensureFor(D.today());
    Store.commit();

    window.addEventListener('hashchange', route);
    route();

    // 点击任何人名标签 → 打开人员关联视图（全局委托，覆盖各页面和 Drawer）
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-person-view]');
      if (el) { e.preventDefault(); App.PersonView.open(el.dataset.personView); }
    });

    document.getElementById('menuBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebarMask').classList.add('show');
    });
    document.getElementById('sidebarMask').addEventListener('click', closeMobileSidebar);

    // 跨午夜简单处理：页面重新可见时检查日期
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const n = Templates.ensureFor(D.today());
        if (n) Store.commit();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
