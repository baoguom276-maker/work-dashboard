/* ============================================================
 * views/today.js — 今日工作台（默认首页）
 *
 * 布局：日期+操作(日报/Quota/新增) → 智能输入条(任务/随手记/小记三合一)
 *       → 待整理列表 → 今日小记列表 → 紧凑统计栏 → 往日遗留 → 今日临时异常 → 今日固定工作 → 已完成
 * 快速记录回车直接入库（免弹窗），Toast 显示识别结果，可点「修改」再调整
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  // 当前筛选状态（点击统计栏数字时切换）
  let statFilter = ''; // '' | 'done' | 'doing' | 'pending' | 'followup'

  // 智能输入条当前模式（页面切换后保留）
  let captureMode = 'task'; // 'task' | 'inbox' | 'tip'
  const CAPTURE_PLACEHOLDERS = {
    task: '快速记录，例：给Ivan新建2个IG / Ivan两个YT人机了需要刷机（回车直接保存，不用填表）',
    inbox: '随手记：想到什么写什么，回车先存下来，有空再整理成任务',
    tip: '今日小记：记录结果结论，例：Ivan IG申诉成功（回车即存）'
  };
  const CAPTURE_BUTTONS = { task: '识别并保存', inbox: '存入待整理', tip: '记一笔' };

  App.Views.today = {
    title: '今日工作台',

    mount(root) {
      const today = D.today();
      const state = App.Store.state;
      const todays = App.Store.tasksOn(today);

      const counts = { total: todays.length, done: 0, doing: 0, pending: 0, followup: 0 };
      todays.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });

      // 往日遗留：仅昨天及更早未完成
      const inherited = state.tasks
        .filter(t => t.status !== 'done' && t.date < today)
        .sort((a, b) => a.date === b.date
          ? (a.order || 0) - (b.order || 0)
          : (a.date < b.date ? -1 : 1));

      // 进行中/待处理/需跟进的统计把往日遗留也算上，保证点状态筛选时数字和列表一致
      inherited.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });

      // 今日任务分区：固定任务 vs 临时任务
      const undone = todays.filter(t => t.status !== 'done')
        .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt < b.createdAt ? -1 : 1));
      const done = todays.filter(t => t.status === 'done')
        .sort((a, b) => (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || ''));

      // 固定任务 = 有 templateId 的
      const fixedUndone = undone.filter(t => t.templateId);
      const tempUndone = undone.filter(t => !t.templateId);

      // 如果有 statFilter，只显示对应状态的任务（往日遗留也一起过滤）
      const filterFn = t => !statFilter || t.status === statFilter;
      const fixedShow = fixedUndone.filter(filterFn);
      const tempShow = tempUndone.filter(filterFn);
      const inheritedShow = inherited.filter(filterFn);

      const pastCount = inherited.length;

      // 随手记 Inbox（无字段压力，先存下来再整理）
      const inboxItems = (state.inbox || []).slice().reverse(); // 新的在上

      // 今日小记（结果/结论类记录，例：Ivan IG申诉成功）
      const tips = (state.tips || []).filter(t => t.date === today).slice().reverse();

      root.innerHTML = D.html`
        <div class="page-head">
          <div class="page-head-row">
            <div>
              <div class="date-big">${D.fmtCN(today)}</div>
              <div class="date-sub">${pastCount ? `有 ${pastCount} 项往日遗留事项需要继续跟进` : '新的一天，从记录第一件工作开始'}</div>
            </div>
            <div class="head-actions">
              <button class="btn" id="btnQuota" title="打开每日剪辑手 Quota 面板">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15v3M12 9v9M17 5v13"/></svg>
                检查Quota
              </button>
              <button class="btn" id="btnReport">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>
                生成今日日报
              </button>
              <button class="btn btn-primary" id="btnAdd">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
                新增任务
              </button>
            </div>
          </div>
        </div>

        <form class="capture-bar" id="captureBar">
          <div class="capture-tabs">
            <button type="button" class="capture-tab ${captureMode === 'task' ? 'active' : ''}" data-cmode="task">⚡ 任务</button>
            <button type="button" class="capture-tab ${captureMode === 'inbox' ? 'active' : ''}" data-cmode="inbox">📥 随手记</button>
            <button type="button" class="capture-tab ${captureMode === 'tip' ? 'active' : ''}" data-cmode="tip">💡 小记</button>
          </div>
          <input id="captureInput" type="text" autocomplete="off" placeholder="${CAPTURE_PLACEHOLDERS[captureMode]}" />
          <button type="submit" class="btn btn-primary btn-sm" id="captureGo">${CAPTURE_BUTTONS[captureMode]}</button>
        </form>

        ${inboxItems.length ? D.raw(D.html`
        <div class="inbox-list" id="inboxList">
          <div class="inbox-head">📥 待整理 <b>${inboxItems.length}</b><span class="inbox-tip">转成任务或标记已处理后会从这里消失</span></div>
          ${D.raw(inboxItems.map(it => D.html`
          <div class="inbox-item" data-inbox-id="${it.id}">
            <span class="inbox-text">${it.text}</span>
            <div class="inbox-actions">
              <button class="btn btn-ghost btn-sm" data-inbox-task="${it.id}">→ 转任务</button>
              <button class="icon-btn" data-inbox-done="${it.id}" title="已处理，不用转任务">✓</button>
            </div>
          </div>`).join(''))}
        </div>`) : ''}

        ${tips.length ? D.raw(D.html`
        <div class="tips-list" id="tipsList">
          <div class="tips-head">💡 今日小记 <b>${tips.length}</b><span class="tips-tip">会自动写进今日日报的「今日小记」</span></div>
          ${D.raw(tips.map(t => {
            const tm = new Date(t.createdAt);
            const hhmm = String(tm.getHours()).padStart(2, '0') + ':' + String(tm.getMinutes()).padStart(2, '0');
            return D.html`
            <div class="tip-item" data-tip-id="${t.id}">
              <span class="tip-time">${hhmm}</span>
              <span class="tip-text">${t.text}</span>
              <button class="icon-btn tip-del" data-tip-del="${t.id}" title="删除这条小记">×</button>
            </div>`;
          }).join(''))}
        </div>`) : ''}

        <div class="stat-bar" id="statBar">
          <button class="stat-pill ${statFilter === '' ? 'active' : ''}" data-filter="">
            今日 <b>${counts.total}</b>
          </button>
          <button class="stat-pill ${statFilter === 'done' ? 'active' : ''}" data-filter="done">
            ✓ 已完成 <b>${counts.done}</b>
          </button>
          <button class="stat-pill ${statFilter === 'doing' ? 'active' : ''}" data-filter="doing">
            ◉ 进行中 <b>${counts.doing}</b>
          </button>
          <button class="stat-pill ${statFilter === 'pending' ? 'active' : ''}" data-filter="pending">
            ○ 待处理 <b>${counts.pending}</b>
          </button>
          <button class="stat-pill ${statFilter === 'followup' ? 'active' : ''}" data-filter="followup">
            ⚠ 需跟进 <b>${counts.followup}</b>
          </button>
        </div>

        ${inheritedShow.length ? D.raw(D.html`
        <div class="section">
          <div class="section-head">
            <span class="section-title">📌 往日遗留 · 待跟进</span>
            <span class="section-count">${inheritedShow.length}</span>
            <div class="spacer"></div>
            <a class="btn btn-ghost btn-sm" href="#/followups">查看全部 →</a>
          </div>
          <div class="task-list" id="inheritList">${inheritedShow.map(t => App.UI.taskCard(t, { showOrigin: true, draggable: false }))}</div>
        </div>`) : (statFilter ? '' : D.raw(D.html`<div class="inherit-empty">📌 往日遗留 · 待跟进 0　暂无待跟进事项</div>`))}

        ${tempShow.length ? D.raw(D.html`
        <div class="section">
          <div class="section-head">
            <span class="section-title">⚠️ 今日临时 / 异常事项</span>
            <span class="section-count">${tempShow.length}</span>
          </div>
          <div class="task-list" id="tempList">${tempShow.map(t => App.UI.taskCard(t))}</div>
        </div>`) : ''}

        ${fixedShow.length ? D.raw(D.html`
        <div class="section">
          <div class="section-head">
            <span class="section-title">📋 今日固定工作</span>
            <span class="section-count">${fixedShow.length}</span>
          </div>
          <div class="task-list" id="fixedList">${fixedShow.map(t => App.UI.taskCard(t, { fixedTask: true }))}</div>
        </div>`) : (fixedUndone.length === 0 && !statFilter ? '' : '')}

        ${statFilter && !fixedShow.length && !tempShow.length && !inheritedShow.length
          ? App.UI.emptyState('没有「' + ((D.STATUS_MAP[statFilter] || {}).label || statFilter) + '」状态的任务', '点击「今日」或再点一次状态标签可取消筛选', '🔍')
          : ''}
        ${!statFilter && undone.length === 0 && !done.length ? App.UI.emptyState('今天还没有任务', '固定任务会按模板自动生成，也可以手动新增', '✍️') : ''}

        ${done.length && (!statFilter || statFilter === 'done') ? D.raw(D.html`
        <div class="section">
          <div class="section-head">
            <span class="section-title">✅ 已完成</span>
            <span class="section-count">${done.length}</span>
          </div>
          <div class="task-list" id="doneList">${done.map(t => App.UI.taskCard(t, { draggable: false }))}</div>
        </div>`) : ''}
      `;

      root.querySelector('#btnAdd').addEventListener('click', () => App.TaskForm.open(null, { date: today }));
      root.querySelector('#btnReport').addEventListener('click', () => App.Report.open(today));
      root.querySelector('#btnQuota').addEventListener('click', () => App.QuotaPanel.open(today));

      /* ---------- 智能输入条（任务 / 随手记 / 小记 三合一） ---------- */
      // 切换模式：更新占位符和按钮文案，焦点回到输入框
      root.querySelectorAll('[data-cmode]').forEach(btn =>
        btn.addEventListener('click', () => {
          captureMode = btn.dataset.cmode;
          root.querySelectorAll('[data-cmode]').forEach(b => b.classList.toggle('active', b === btn));
          const input = root.querySelector('#captureInput');
          input.placeholder = CAPTURE_PLACEHOLDERS[captureMode];
          root.querySelector('#captureGo').textContent = CAPTURE_BUTTONS[captureMode];
          input.focus();
        }));

      // 回车提交：按当前模式分发
      root.querySelector('#captureBar').addEventListener('submit', e => {
        e.preventDefault();
        const input = root.querySelector('#captureInput');
        const text = input.value.trim();
        if (!text) return;

        if (captureMode === 'inbox') {
          App.DB.add('inbox', { id: D.uid('ib'), text: text, createdAt: new Date().toISOString() });
          App.UI.toast('已存入待整理');
        } else if (captureMode === 'tip') {
          App.DB.add('tips', { id: D.uid('tip'), date: today, text: text, createdAt: new Date().toISOString() });
          App.UI.toast('已记入今日小记');
        } else {
          // 快速记录：免弹窗直接入库，Toast 显示识别结果，「修改」可再调整
          const parsed = App.NLP.parse(text, state.people, state.modules);
          const task = {
            id: D.uid('task'),
            date: today,
            module: parsed.module || '其他',
            title: parsed.title || text,
            personIds: parsed.personIds || [],
            status: parsed.status || 'pending',
            result: parsed.result || '',
            templateId: null,
            createdAt: new Date().toISOString()
          };
          App.DB.add('tasks', task);
          const pm = App.Store.personMap();
          const names = (task.personIds || []).map(id => (pm[id] || {}).name).filter(Boolean).join(' / ');
          const statusLabel = (D.STATUS_MAP[task.status] || {}).label || task.status;
          App.UI.toast('✓ 已保存：' + task.module + (names ? '｜' + names : '') + '｜' + statusLabel, 6000, {
            label: '修改',
            onClick: () => App.TaskForm.open(task)
          });
        }

        // 连续录入：清空并把焦点放回（refresh 重建 DOM 后的新输入框）
        requestAnimationFrame(() => {
          const inp = document.getElementById('captureInput');
          if (inp) { inp.value = ''; inp.focus(); }
        });
      });

      root.querySelectorAll('[data-inbox-done]').forEach(btn =>
        btn.addEventListener('click', () => {
          App.DB.remove('inbox', btn.dataset.inboxDone);
          App.UI.toast('已处理');
        }));
      root.querySelectorAll('[data-inbox-task]').forEach(btn =>
        btn.addEventListener('click', () => {
          const it = App.DB.find('inbox', btn.dataset.inboxTask);
          if (!it) return;
          const parsed = App.NLP.parse(it.text, state.people, state.modules);
          App.TaskForm.open(null, {
            date: today,
            nlp: parsed,
            onSave: () => { App.DB.remove('inbox', it.id); }
          });
        }));

      root.querySelectorAll('[data-tip-del]').forEach(btn =>
        btn.addEventListener('click', () => {
          App.DB.remove('tips', btn.dataset.tipDel);
        }));

      // 统计栏点击筛选
      root.querySelectorAll('.stat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const f = pill.dataset.filter;
          statFilter = (statFilter === f) ? '' : f;
          App.refresh();
        });
      });

      App.bindTaskActions(root);
      bindReorder(root.querySelector('#fixedList') || root.querySelector('#tempList'), today);

      // 打开页面光标直接落在输入框，打完字回车就能存
      const capInput = root.querySelector('#captureInput');
      if (capInput && !document.querySelector('.modal, .drawer')) capInput.focus();
    }
  };

  /* ---------- 拖拽排序（今日未完成列表） ---------- */
  function bindReorder(list, date) {
    if (!list) return;
    let dragId = null;

    list.addEventListener('dragstart', e => {
      const card = e.target.closest('.task-card');
      if (!card) return;
      dragId = card.dataset.taskId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragend', () => {
      dragId = null;
      list.querySelectorAll('.task-card').forEach(c => c.classList.remove('dragging', 'drag-over'));
    });

    list.addEventListener('dragover', e => {
      e.preventDefault();
      const dragging = list.querySelector('.dragging');
      if (!dragging) return;
      const after = getAfter(list, e.clientY);
      const over = e.target.closest('.task-card');
      list.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (over && over !== dragging) over.classList.add('drag-over');
      if (after == null) list.appendChild(dragging);
      else if (after !== dragging) list.insertBefore(dragging, after);
    });

    list.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragId) return;
      const ids = Array.from(list.querySelectorAll('[data-task-id]')).map(c => c.dataset.taskId);
      App.Tasks.reorder(date, ids);
    });
  }

  function getAfter(list, y) {
    const cards = Array.from(list.querySelectorAll('.task-card:not(.dragging)'));
    let closest = { offset: -Infinity, node: null };
    cards.forEach(card => {
      const box = card.getBoundingClientRect();
      const center = box.top + box.height / 2;
      const offset = y - center;
      if (offset < 0 && offset > closest.offset) closest = { offset, node: card };
    });
    return closest.node;
  }
})();
