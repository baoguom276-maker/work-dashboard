/* ============================================================
 * quota-panel.js — Quota 录入面板（Drawer 抽屉式）
 *
 * 功能：
 *   - 显示剪辑手表格（人员 / 实际完成 / 目标 / 状态 / 欠量）
 *   - 输入框支持 Tab 切换、Enter 保存、+/- 调整
 *   - 保存后自动标记「审核视频 + 检查 Quota」任务完成
 *   - 已保存数据自动回显
 *   - 一键复制纯文本（严格格式）
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  function open(dateStr) {
    dateStr = dateStr || D.today();
    const targets = App.Quota.getTargets();
    const dayData = App.Quota.getDayData(dateStr);
    let noteText = App.Quota.getNote(dateStr) || '';

    // 昨日欠量（每人每天固定，只取决于上一个工作日已保存的记录）
    const prevDebtMap = {};
    targets.forEach(t => {
      const rec = dayData[t.personId];
      prevDebtMap[t.personId] = App.Quota.calcDebt(t.personId, dateStr, rec ? rec.actual : 0, t.target).prevDebt;
    });

    // 构建表格 HTML
    const rows = targets.map((t, idx) => {
      const rec = dayData[t.personId];
      const actual = rec ? rec.actual : '';
      const debt = App.Quota.calcDebt(t.personId, dateStr, rec ? rec.actual : 0, t.target);
      const met = rec && rec.actual >= t.target;
      const short = rec ? Math.max(0, t.target - rec.actual) : t.target;
      return { ...t, actual, met, short, debt };
    });

    const body = document.createElement('div');

    function render() {
      const d = new Date(dateStr + 'T00:00:00');
      const dateLabel = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + D.weekdayCN(dateStr);

      body.innerHTML = D.html`
        <div class="quota-date-label">${dateLabel}</div>
        <table class="quota-table" id="quotaTable">
          <thead>
            <tr>
              <th>剪辑手</th>
              <th class="q-col-actual">实际完成</th>
              <th class="q-col-target">目标</th>
              <th class="q-col-status">状态</th>
              <th class="q-col-debt">欠量</th>
          </tr>
          </thead>
          <tbody>
            ${D.raw(targets.map((t, idx) => {
              const rec = dayData[t.personId];
              const actual = rec ? rec.actual : '';
              return D.html`
              <tr data-pid="${t.personId}" data-idx="${idx}">
                <td class="q-name">${t.name}</td>
                <td class="q-col-actual">
                  <div class="q-input-wrap">
                    <button class="q-step" data-step="-1" tabindex="-1">−</button>
                    <input type="text" class="q-input" data-pid="${t.personId}" value="${actual}" placeholder="0"
                      inputmode="numeric" data-idx="${idx}" />
                    <button class="q-step" data-step="1" tabindex="-1">+</button>
                  </div>
                </td>
                <td class="q-col-target">${t.target}</td>
                <td class="q-col-status" id="qStatus_${t.personId}"></td>
                <td class="q-col-debt" id="qDebt_${t.personId}"></td>
              </tr>`;
            }).join(''))}
          </tbody>
        </table>
        <div class="quota-note-wrap">
          <label class="quota-note-label">备注（可选，会附在复制文本末尾）</label>
          <textarea class="quota-note" id="quotaNote" rows="2" placeholder="例如：今日 X 账号申诉成功、某剪辑手请假等">${noteText}</textarea>
        </div>
        <div class="quota-foot">
          <button class="btn btn-primary" id="btnSaveQuota">💾 保存今日Quota</button>
          <button class="btn" id="btnCopyQuota">📋 复制今日Quota</button>
        </div>
        <div class="quota-hint" id="quotaHint">欠量 / 补量仅用于内部跟进，不会出现在复制的文本里；备注会附在复制末尾。</div>
      `;

      // 更新状态显示
      updateAllStatus();

      // 输入框事件
      const inputs = body.querySelectorAll('.q-input');
      inputs.forEach((inp, idx) => {
        // 全选
        inp.addEventListener('focus', () => { inp.select(); });
        // 输入限制数字
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/[^\d]/g, '');
          updateStatus(inp.dataset.pid);
        });
        // Enter → 下一个或保存
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (idx < inputs.length - 1) inputs[idx + 1].focus();
            else saveQuota();
          }
          if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            adjust(inp, 1);
          }
          if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            adjust(inp, -1);
          }
        });
      });

      // +/- 按钮
      body.querySelectorAll('.q-step').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('tr');
          const inp = row.querySelector('.q-input');
          adjust(inp, parseInt(btn.dataset.step));
          inp.focus();
        });
      });

      // 保存/复制
      body.querySelector('#btnSaveQuota').addEventListener('click', saveQuota);
      body.querySelector('#btnCopyQuota').addEventListener('click', () => App.Quota.copyQuota(dateStr));
    }

    function adjust(inp, delta) {
      let v = parseInt(inp.value || '0') || 0;
      v = Math.max(0, v + delta);
      inp.value = v;
      updateStatus(inp.dataset.pid);
    }

    function updateStatus(pid) {
      const inp = body.querySelector('.q-input[data-pid="' + pid + '"]');
      const row = inp.closest('tr');
      const target = parseInt(row.querySelector('.q-col-target').textContent) || 0;
      const actual = parseInt(inp.value || '0') || 0;
      const cell = body.querySelector('#qStatus_' + pid);
      if (!cell) return;
      if (actual === 0 && !inp.value) {
        cell.innerHTML = '';
        cell.className = 'q-col-status';
      } else if (actual >= target) {
        const extra = actual - target;
        cell.innerHTML = '<span class="q-met">✓ 已达标' + (extra > 0 ? ' (+' + extra + ')' : '') + '</span>';
        cell.className = 'q-col-status is-met';
      } else {
        cell.innerHTML = '<span class="q-short">⚠ 差' + (target - actual) + '</span>';
        cell.className = 'q-col-status is-short';
      }
      // 欠量列：昨日欠量 / 今日补量 / 剩余欠量（仅内部跟进，不进复制文本）
      const debtCell = body.querySelector('#qDebt_' + pid);
      if (debtCell) {
        const prevDebt = prevDebtMap[pid] || 0;
        const madeUp = Math.max(0, actual - target);
        const remain = Math.max(0, prevDebt - madeUp);
        const parts = [];
        if (prevDebt > 0) parts.push('<span class="q-debt-ow">欠' + prevDebt + '</span>');
        if (madeUp > 0) parts.push('<span class="q-debt-up">补' + madeUp + '</span>');
        if (remain > 0) parts.push('<span class="q-debt-remain">余' + remain + '</span>');
        debtCell.innerHTML = parts.join(' ');
      }
    }

    function updateAllStatus() {
      targets.forEach(t => updateStatus(t.personId));
    }

    function saveQuota() {
      const entries = targets.map(t => {
        const inp = body.querySelector('.q-input[data-pid="' + t.personId + '"]');
        const actual = parseInt(inp.value || '0') || 0;
        return { personId: t.personId, actual, target: t.target };
      });
      App.Quota.saveDay(dateStr, entries);
      // 同步保存备注
      const noteEl = body.querySelector('#quotaNote');
      noteText = noteEl ? noteEl.value : '';
      App.Quota.saveNote(dateStr, noteText);
      // 刷新已保存数据
      Object.assign(dayData, App.Quota.getDayData(dateStr));
      body.querySelector('#quotaHint').innerHTML = '<span style="color:#16794c">已保存，可点击「复制今日Quota」获取纯文本（含备注）</span>';
    }

    render();

    const dr = App.UI.drawer({
      title: '每日 Quota 录入',
      bodyNode: body
    });

    // 打开后自动聚焦第一个输入框
    setTimeout(() => {
      const first = body.querySelector('.q-input');
      if (first) first.focus();
    }, 300);
  }

  App.QuotaPanel = { open };
})();
