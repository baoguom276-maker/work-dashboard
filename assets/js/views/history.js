/* ============================================================
 * views/history.js — 历史记录
 *   - 任务记录：快捷日期范围 / 模块 / 状态 / 对接人 / 关键词（含备注、对接人姓名）
 *   - Quota 记录：按日期、剪辑手筛选，支持复制某天的 Quota 文本
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  let tab = 'tasks'; // 'tasks' | 'quota'

  const now = new Date();
  function defaultFilters() {
    return {
      from: D.toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: D.toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      module: '', status: '', person: '', q: '',
      range: 'month' // '' | 'today' | '7d' | '30d' | 'month' | 'all'
    };
  }
  let filters = defaultFilters();
  let qFilters = { from: '', to: '', person: '' };

  /* ---------- 快捷日期范围 ---------- */
  const RANGES = [
    { key: 'today', label: '今天' },
    { key: '7d', label: '近7天' },
    { key: '30d', label: '近30天' },
    { key: 'month', label: '本月' },
    { key: 'all', label: '全部' }
  ];

  function applyRange(key) {
    const today = new Date();
    let from = '', to = D.today();
    if (key === 'today') from = D.today();
    else if (key === '7d') from = D.toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
    else if (key === '30d') from = D.toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
    else if (key === 'month') {
      from = D.toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
      to = D.toDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else { from = ''; to = ''; }
    filters.from = from; filters.to = to; filters.range = key;
  }

  /* ---------- 任务筛选 ---------- */
  function filteredTasks() {
    const f = filters;
    const pm = App.Store.personMap();
    return App.Store.state.tasks.filter(t => {
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.module && t.module !== f.module) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.person && (t.personIds || []).indexOf(f.person) === -1) return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        const personNames = (t.personIds || []).map(id => (pm[id] || {}).name || '').join(' ');
        const hay = [t.title, t.result, t.note, t.module, personNames].join(' ');
        if (hay.toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || (a.order || 0) - (b.order || 0));
  }

  App.Views.history = {
    title: '历史记录',

    mount(root) {
      const state = App.Store.state;

      root.innerHTML = D.html`
        <div class="page-head">
          <div class="page-title">🗂️ 历史记录</div>
          <div class="page-sub">按日期、模块、状态、对接人筛选，或直接搜索关键词；Quota 录入记录也可以在这里回溯。</div>
        </div>

        <div class="sub-tabs">
          <button class="sub-tab ${tab === 'tasks' ? 'active' : ''}" data-tab="tasks">📋 任务记录</button>
          <button class="sub-tab ${tab === 'quota' ? 'active' : ''}" data-tab="quota">📊 Quota 记录</button>
        </div>

        <div id="tabTasks" style="${tab === 'tasks' ? '' : 'display:none'}">${renderTasks(state)}</div>
        <div id="tabQuota" style="${tab === 'quota' ? '' : 'display:none'}">${renderQuota(state)}</div>
      `;

      root.querySelectorAll('.sub-tab').forEach(btn =>
        btn.addEventListener('click', () => { tab = btn.dataset.tab; App.refresh(); }));

      bindTaskControls(root);
      bindQuotaControls(root);
    }
  };

  /* ============================================================
   * 任务记录
   * ============================================================ */
  function renderTasks(state) {
    const html = renderTasksHTML(state);
    return D.raw(html);
  }

  function renderTasksHTML(state) {
    const list = filteredTasks();
    const groups = {};
    list.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
    const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    // 小记：共享日期范围 + 关键词筛选
    const tips = (state.tips || []).filter(tp => {
      if (filters.from && tp.date < filters.from) return false;
      if (filters.to && tp.date > filters.to) return false;
      if (filters.q && tp.text.toLowerCase().indexOf(filters.q.toLowerCase()) === -1) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || (a.createdAt < b.createdAt ? -1 : 1));

    // 活动筛选标签
    const chips = [];
    if (filters.from || filters.to) {
      const label = (filters.from || '最早') + ' ~ ' + (filters.to || '至今');
      chips.push({ key: 'range', label: '📅 ' + label });
    }
    if (filters.module) chips.push({ key: 'module', label: filters.module });
    if (filters.status) chips.push({ key: 'status', label: (D.STATUS_MAP[filters.status] || {}).label || filters.status });
    if (filters.person) chips.push({ key: 'person', label: '👤 ' + ((App.Store.personMap()[filters.person] || {}).name || '') });
    if (filters.q) chips.push({ key: 'q', label: '🔍 ' + filters.q });

    return D.html`
      <div class="filter-bar">
        <div class="range-row">
          ${D.raw(RANGES.map(r => D.html`<button class="range-btn ${filters.range === r.key ? 'active' : ''}" data-range="${r.key}">${r.label}</button>`).join(''))}
          <span class="range-sep">|</span>
          <input type="date" class="input input-date" id="fltFrom" value="${filters.from}" title="开始日期" />
          <span style="color:var(--text-3)">至</span>
          <input type="date" class="input input-date" id="fltTo" value="${filters.to}" title="结束日期" />
        </div>
        <div class="filter-row2">
          <select class="input" id="fltModule">
            <option value="">全部模块</option>
            ${D.raw(state.modules.map(m => D.html`<option value="${m}" ${filters.module === m ? 'selected' : ''}>${m}</option>`).join(''))}
          </select>
          <select class="input" id="fltStatus">
            <option value="">全部状态</option>
            ${D.raw(D.STATUSES.map(s => D.html`<option value="${s.key}" ${filters.status === s.key ? 'selected' : ''}>${s.label}</option>`).join(''))}
          </select>
          <select class="input" id="fltPerson">
            <option value="">全部对接人</option>
            ${D.raw(state.people.map(p => D.html`<option value="${p.id}" ${filters.person === p.id ? 'selected' : ''}>${p.name}</option>`).join(''))}
          </select>
          <input type="text" class="input grow" id="fltQ" value="${filters.q}" placeholder="关键词：事项 / 备注 / 对接人，例如 手机号验证、Ivan" />
          <button class="btn" id="btnExport">导出 CSV</button>
          <button class="btn btn-ghost" id="btnReset">重置</button>
        </div>
        ${chips.length ? D.raw(D.html`<div class="active-filters">
          ${D.raw(chips.map(c => D.html`<button class="filter-chip" data-clear="${c.key}">${c.label} <span class="filter-chip-x">×</span></button>`).join(''))}
          <button class="filter-clear-all" id="btnClearAll">清空全部筛选</button>
        </div>`) : ''}
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">筛选结果</span>
          <span class="section-count">${list.length} 条 · ${dates.length} 天</span>
        </div>
        ${list.length === 0
          ? App.UI.emptyState('没有符合条件的记录', '试试调整日期范围或其他筛选条件', '🔍')
          : D.raw(dates.map(dateStr => D.html`
            <div class="day-group">
              <div class="day-head ${dateStr === D.today() ? 'is-today' : ''}">
                <span class="day-label">${D.fmtCN(dateStr)}</span>
                <span class="day-count">${groups[dateStr].length} 条</span>
              </div>
              <div class="task-list">${groups[dateStr].map(t => App.UI.taskCard(t, { draggable: false }))}</div>
            </div>`).join(''))}
      </div>

      ${tips.length ? D.raw(D.html`
      <div class="section">
        <div class="section-head">
          <span class="section-title">💡 小记</span>
          <span class="section-count">${tips.length} 条</span>
        </div>
        <div class="history-tips">
          ${D.raw(tips.map(tp => {
            const d = new Date(tp.date + 'T00:00:00');
            const md = (d.getMonth() + 1) + '.' + d.getDate();
            return D.html`
            <div class="tip-item" data-tip-id="${tp.id}">
              <span class="tip-date">${md}</span>
              <span class="tip-text">${tp.text}</span>
              <button class="icon-btn tip-del" data-tip-del="${tp.id}" title="删除这条小记">×</button>
            </div>`;
          }).join(''))}
        </div>
      </div>`) : ''}
    `;
  }

  function bindTaskControls(root) {
    const box = root.querySelector('#tabTasks');
    if (!box) return;

    box.querySelectorAll('.range-btn').forEach(btn =>
      btn.addEventListener('click', () => { applyRange(btn.dataset.range); App.refresh(); }));
    box.querySelector('#fltFrom')?.addEventListener('change', e => { filters.from = e.target.value; filters.range = ''; App.refresh(); });
    box.querySelector('#fltTo')?.addEventListener('change', e => { filters.to = e.target.value; filters.range = ''; App.refresh(); });
    box.querySelector('#fltModule')?.addEventListener('change', e => { filters.module = e.target.value; App.refresh(); });
    box.querySelector('#fltStatus')?.addEventListener('change', e => { filters.status = e.target.value; App.refresh(); });
    box.querySelector('#fltPerson')?.addEventListener('change', e => { filters.person = e.target.value; App.refresh(); });

    const qInput = box.querySelector('#fltQ');
    qInput?.addEventListener('input', D.debounce(() => { filters.q = qInput.value.trim(); App.refresh(); }, 220));

    box.querySelector('#btnReset')?.addEventListener('click', () => { filters = defaultFilters(); App.refresh(); });
    box.querySelector('#btnClearAll')?.addEventListener('click', () => { filters = defaultFilters(); applyRange('all'); App.refresh(); });
    box.querySelectorAll('.filter-chip').forEach(chip =>
      chip.addEventListener('click', () => {
        const k = chip.dataset.clear;
        if (k === 'range') { filters.from = ''; filters.to = ''; filters.range = ''; }
        else filters[k] = '';
        App.refresh();
      }));
    box.querySelector('#btnExport')?.addEventListener('click', () => exportCSV(filteredTasks()));

    box.querySelectorAll('[data-tip-del]').forEach(btn =>
      btn.addEventListener('click', () => { App.DB.remove('tips', btn.dataset.tipDel); }));

    App.bindTaskActions(box);
  }

  /* ============================================================
   * Quota 记录
   * ============================================================ */
  function renderQuota(state) {
    return D.raw(renderQuotaHTML(state));
  }

  function renderQuotaHTML(state) {
    const targets = App.Quota.getTargets();
    const groups = App.Quota.getHistory({ from: qFilters.from || undefined, to: qFilters.to || undefined, personId: qFilters.person || undefined });

    const targetMap = {};
    targets.forEach(t => { targetMap[t.personId] = t; });

    return D.html`
      <div class="filter-bar">
        <div class="range-row">
          <input type="date" class="input input-date" id="qfltFrom" value="${qFilters.from}" title="开始日期" />
          <span style="color:var(--text-3)">至</span>
          <input type="date" class="input input-date" id="qfltTo" value="${qFilters.to}" title="结束日期" />
          <select class="input" id="qfltPerson" style="max-width:180px">
            <option value="">全部剪辑手</option>
            ${D.raw(targets.map(t => D.html`<option value="${t.personId}" ${qFilters.person === t.personId ? 'selected' : ''}>${t.name}</option>`).join(''))}
          </select>
          <button class="btn btn-ghost" id="qbtnReset">重置</button>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">Quota 历史</span>
          <span class="section-count">${groups.length} 天</span>
        </div>
        ${groups.length === 0
          ? App.UI.emptyState('还没有 Quota 记录', '在首页「审核视频 + 检查 Quota」里录入并保存后，这里可以按日期回溯', '📊')
          : D.raw(qFilters.person
            ? renderSinglePerson(groups, qFilters.person)
            : groups.map(g => renderDayMatrix(g, targets, targetMap)).join(''))}
      </div>
    `;
  }

  /* 单人视图：日期 / 实际 / 目标 / 状态 / 复制 */
  function renderSinglePerson(groups, personId) {
    const name = (App.Store.personMap()[personId] || {}).name || '?';
    return D.html`
      <div class="card quota-history-card">
        <div class="qh-person-title">👤 ${name} 的 Quota 历史</div>
        <table class="quota-history-table">
          <thead><tr><th>日期</th><th class="num">实际完成</th><th class="num">目标</th><th>状态</th></tr></thead>
          <tbody>
            ${D.raw(groups.map(g => {
              const rec = g.entries.find(e => e.personId === personId);
              if (!rec) return '';
              const met = rec.actual >= rec.target;
              const d = new Date(g.date + 'T00:00:00');
              const md = (d.getMonth() + 1) + '.' + d.getDate();
              return D.html`
                <tr>
                  <td>${md} <span class="qh-weekday">${D.weekdayCN(g.date)}</span></td>
                  <td class="num"><b>${rec.actual}</b></td>
                  <td class="num">${rec.target}</td>
                  <td>${met
                    ? D.raw(D.html`<span class="q-met">✓ 已达标</span>`)
                    : D.raw(D.html`<span class="q-short">⚠ 差${rec.target - rec.actual}</span>`)}</td>
                </tr>`;
            }).join(''))}
          </tbody>
        </table>
      </div>`;
  }

  /* 全员矩阵视图：每天一行，每人一格 actual/target */
  function renderDayMatrix(g, targets, targetMap) {
    const recMap = {};
    g.entries.forEach(e => { recMap[e.personId] = e; });
    const d = new Date(g.date + 'T00:00:00');
    const md = (d.getMonth() + 1) + '.' + d.getDate();
    return D.html`
      <div class="card quota-history-card">
        <div class="qh-day-head">
          <b>${md}</b> <span class="qh-weekday">${D.weekdayCN(g.date)}</span>
          <div class="spacer"></div>
          <button class="btn btn-ghost btn-sm" data-copy-quota-day="${g.date}">📋 复制当天文本</button>
        </div>
        <div class="qh-matrix">
          ${D.raw(targets.map(t => {
            const rec = recMap[t.personId];
            if (!rec) return '';
            const met = rec.actual >= rec.target;
            return D.html`
              <div class="qh-cell ${met ? 'is-met' : 'is-short'}">
                <span class="qh-cell-name">${t.name}</span>
                <span class="qh-cell-val"><b>${rec.actual}</b>/${rec.target}</span>
              </div>`;
          }).join(''))}
        </div>
      </div>`;
  }

  function bindQuotaControls(root) {
    const box = root.querySelector('#tabQuota');
    if (!box) return;
    box.querySelector('#qfltFrom')?.addEventListener('change', e => { qFilters.from = e.target.value; App.refresh(); });
    box.querySelector('#qfltTo')?.addEventListener('change', e => { qFilters.to = e.target.value; App.refresh(); });
    box.querySelector('#qfltPerson')?.addEventListener('change', e => { qFilters.person = e.target.value; App.refresh(); });
    box.querySelector('#qbtnReset')?.addEventListener('click', () => { qFilters = { from: '', to: '', person: '' }; App.refresh(); });
    box.querySelectorAll('[data-copy-quota-day]').forEach(btn =>
      btn.addEventListener('click', () => App.Quota.copyQuota(btn.dataset.copyQuotaDay)));
  }

  /* ---------- CSV 导出 ---------- */
  function csvCell(s) {
    return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  }

  function exportCSV(tasks) {
    if (!tasks.length) { App.UI.toast('当前没有可导出的记录'); return; }
    const pm = App.Store.personMap();
    const header = ['日期', '工作模块', '工作事项', '对接人', '状态', '结果/备注'];
    const lines = [header.map(csvCell).join(',')];
    tasks.forEach(t => {
      lines.push([
        t.date,
        t.module,
        t.title,
        (t.personIds || []).map(id => (pm[id] || {}).name || '').join('、'),
        (D.STATUS_MAP[t.status] || {}).label || t.status,
        (t.result || '').replace(/\n/g, '；')
      ].map(csvCell).join(','));
    });
    D.download('工作记录_' + D.today() + '.csv', '﻿' + lines.join('\n'), 'text/csv');
    App.UI.toast('已导出 ' + tasks.length + ' 条记录');
  }
})();
