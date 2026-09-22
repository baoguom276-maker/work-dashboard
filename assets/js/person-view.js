/* ============================================================
 * person-view.js — 人员关联视图（右侧 Drawer）
 *
 * 入口：点击任务卡上的人名标签、人员管理卡片的「查看任务」
 * 内容：人员档案 + 任务统计 + Quota 近况（如有）+ 名下全部任务
 * 任务行内可直接改状态 / 编辑 / 删除，数据变化自动刷新
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  let current = null; // 当前打开的视图（同时只允许一个），用于 DB 变更后局部刷新
  let activeDR = null;

  function open(personId) {
    // 从 Drawer 内再点其他人名：先关掉上一个，避免抽屉叠加
    if (activeDR) { activeDR.close(); activeDR = null; current = null; }
    const person = App.DB.find('people', personId);
    if (!person) { App.UI.toast('该人员已被删除'); return; }

    let filter = 'open'; // open | done | all

    const body = document.createElement('div');

    function tasksOf() {
      return App.Store.state.tasks
        .filter(t => (t.personIds || []).indexOf(personId) !== -1)
        .sort((a, b) => b.date.localeCompare(a.date) || (a.order || 0) - (b.order || 0));
    }

    function draw() {
      // 人员可能在 Drawer 打开期间被删除
      const p = App.DB.find('people', personId);
      if (!p) { dr.close(); App.UI.toast('该人员已被删除'); return; }

      const all = tasksOf();
      const openTasks = all.filter(t => t.status !== 'done');
      const doneTasks = all.filter(t => t.status === 'done');
      const show = filter === 'open' ? openTasks : filter === 'done' ? doneTasks : all;

      // 按日期分组
      const groups = {};
      show.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
      const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

      // Quota 近况（仅当该人员在 Quota 配置中）
      const qt = (App.Store.state.quotaTargets || []).find(x => x.personId === personId);
      let quotaHTML = '';
      if (qt) {
        const recs = (App.Store.state.quotaRecords || [])
          .filter(r => r.personId === personId)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 7);
        quotaHTML = D.html`
          <div class="pv-quota">
            <div class="pv-quota-head">
              <span>📊 每日 Quota 目标 <b>${qt.target}</b></span>
              <button class="btn btn-ghost btn-sm" id="pvOpenQuota">录入 / 查看今日</button>
            </div>
            ${recs.length ? D.raw(D.html`<div class="pv-quota-list">
              ${D.raw(recs.map(r => {
                const d = new Date(r.date + 'T00:00:00');
                const md = (d.getMonth() + 1) + '.' + d.getDate();
                const met = r.actual >= r.target;
                return D.html`
                  <span class="pv-q-item ${met ? 'is-met' : 'is-short'}" title="${r.date}">
                    ${md} <b>${r.actual}</b>/${r.target}
                    ${met ? '✓' : D.raw('⚠' + (r.target - r.actual))}
                  </span>`;
              }).join(''))}
            </div>`) : D.raw(D.html`<div class="pv-quota-empty">最近还没有 Quota 记录</div>`)}
          </div>`;
      }

      body.innerHTML = D.html`
        <div class="pv-head">
          <div class="pv-avatar">${(p.name || '?').slice(0, 1).toUpperCase()}</div>
          <div class="pv-head-main">
            <div class="pv-name">${p.name}</div>
            <div class="pv-platforms">
              ${D.raw(D.PLATFORMS.map(pl => D.html`<span class="tag ${(p.platforms || []).indexOf(pl) !== -1 ? 'tag-platform' : ''}" style="${(p.platforms || []).indexOf(pl) === -1 ? 'opacity:.35' : ''}">${pl}</span>`).join(''))}
            </div>
          </div>
          <button class="icon-btn" id="pvEdit" title="编辑人员信息">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
        ${D.accountLinksHTML(p.account) || ''}
        ${p.notes ? D.raw(D.html`<div class="pv-meta-row">${p.notes}</div>`) : ''}

        <div class="pv-stats">
          <button class="pv-stat ${filter === 'open' ? 'active' : ''}" data-pv-filter="open">
            <span class="pv-stat-n">${openTasks.length}</span><span class="pv-stat-l">未完成</span>
          </button>
          <button class="pv-stat ${filter === 'done' ? 'active' : ''}" data-pv-filter="done">
            <span class="pv-stat-n">${doneTasks.length}</span><span class="pv-stat-l">已完成</span>
          </button>
          <button class="pv-stat ${filter === 'all' ? 'active' : ''}" data-pv-filter="all">
            <span class="pv-stat-n">${all.length}</span><span class="pv-stat-l">全部</span>
          </button>
        </div>

        ${D.raw(quotaHTML)}

        <div class="pv-tasks">
          ${show.length === 0
            ? App.UI.emptyState(filter === 'done' ? '还没有已完成任务' : '名下没有未完成任务', '可以在新增 / 快速记录任务时关联该人员', '📭')
            : D.raw(dates.map(dateStr => D.html`
              <div class="day-group">
                <div class="day-head ${dateStr === D.today() ? 'is-today' : ''}">
                  <span class="day-label">${D.fmtCN(dateStr)}</span>
                  <span class="day-count">${groups[dateStr].length} 条</span>
                </div>
                <div class="task-list">${groups[dateStr].map(t => App.UI.taskCard(t, { draggable: false, showOrigin: false, showDate: false }))}</div>
              </div>`).join(''))}
        </div>
      `;

      body.querySelectorAll('[data-pv-filter]').forEach(btn =>
        btn.addEventListener('click', () => { filter = btn.dataset.pvFilter; draw(); }));
      body.querySelector('#pvEdit')?.addEventListener('click', () => {
        if (App.People && App.People.openForm) App.People.openForm(personId);
        else App.UI.toast('请到「人员管理」中编辑');
      });
      body.querySelector('#pvOpenQuota')?.addEventListener('click', () => App.QuotaPanel.open(D.today()));

      // 行内任务操作（不随视图路由 abort）
      App.bindTaskActions(body, { persistent: true });
    }

    const dr = App.UI.drawer({
      title: '人员档案',
      bodyNode: body,
      onClose: () => { current = null; activeDR = null; }
    });

    activeDR = dr;
    current = { personId, draw };
    draw();
  }

  // DB 变化时局部重绘当前 Drawer（完成 / 编辑任务后统计即时更新）
  App.DB.onChange(() => { if (current) current.draw(); });

  App.PersonView = { open };
})();
