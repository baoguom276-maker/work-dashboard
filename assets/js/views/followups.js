/* ============================================================
 * views/followups.js — 待跟进（未完成事项自动继承，不丢失）
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  // 筛选状态在重渲染时保留
  let filters = { module: '', person: '', q: '' };

  App.Views.followups = {
    title: '待跟进',

    mount(root) {
      const today = D.today();
      const state = App.Store.state;

      let list = state.tasks.filter(t => t.status !== 'done' && t.date <= today);
      if (filters.module) list = list.filter(t => t.module === filters.module);
      if (filters.person) list = list.filter(t => (t.personIds || []).indexOf(filters.person) !== -1);
      if (filters.q) {
        const q = filters.q.toLowerCase();
        list = list.filter(t => t.title.toLowerCase().indexOf(q) !== -1 ||
          (t.result || '').toLowerCase().indexOf(q) !== -1);
      }
      // 最早的排最前，避免陈年遗留被淹没
      list.sort((a, b) => a.date === b.date ? (a.order || 0) - (b.order || 0) : (a.date < b.date ? -1 : 1));

      root.innerHTML = D.html`
        <div class="page-head">
          <div class="page-title">📌 待跟进</div>
          <div class="page-sub">状态为「待处理 / 进行中 / 需跟进」的任务会一直保留，直到标记完成；原始记录始终保留在历史中。</div>
        </div>

        <div class="filter-bar">
          <div class="field">
            <label class="field-label">工作模块</label>
            <select class="input" id="fltModule">
              <option value="">全部模块</option>
              ${D.raw(state.modules.map(m => D.html`<option value="${m}" ${filters.module === m ? 'selected' : ''}>${m}</option>`).join(''))}
            </select>
          </div>
          <div class="field">
            <label class="field-label">对接人</label>
            <select class="input" id="fltPerson">
              <option value="">全部人员</option>
              ${D.raw(state.people.map(p => D.html`<option value="${p.id}" ${filters.person === p.id ? 'selected' : ''}>${p.name}</option>`).join(''))}
            </select>
          </div>
          <div class="field grow">
            <label class="field-label">关键词</label>
            <input type="text" class="input" id="fltQ" value="${filters.q}" placeholder="搜索事项或备注，如 IG、登出、Nana" />
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <span class="section-title">待跟进事项</span>
            <span class="section-count">${list.length}</span>
          </div>
          ${list.length
            ? D.raw(D.html`<div class="task-list">${list.map(t => App.UI.taskCard(t, { showOrigin: true, draggable: false, badge: ageLabel(t, today) }))}</div>`)
            : App.UI.emptyState('没有符合条件的待跟进事项', '所有事情都处理完了', '🌤️')}
        </div>
      `;

      root.querySelector('#fltModule').addEventListener('change', e => { filters.module = e.target.value; App.refresh(); });
      root.querySelector('#fltPerson').addEventListener('change', e => { filters.person = e.target.value; App.refresh(); });
      const qInput = root.querySelector('#fltQ');
      qInput.addEventListener('input', D.debounce(() => { filters.q = qInput.value.trim(); App.refresh(); }, 220));

      App.bindTaskActions(root);
    },

    resetFilters() { filters = { module: '', person: '', q: '' }; }
  };

  function ageLabel(task, today) {
    const days = Math.abs(D.dayDiff(today, task.date));
    return days === 0 ? '今天产生' : (days === 1 ? '遗留 1 天' : `已遗留 ${days} 天`);
  }
})();
