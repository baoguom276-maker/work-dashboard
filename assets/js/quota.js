/* ============================================================
 * quota.js — 每日剪辑手 Quota 录入、复制、历史
 *
 * 数据模型：
 *   quotaTargets:  [{ personId, target, order }]  配置一次，每天读取
 *   quotaRecords:  [{ id, date, personId, actual, target, savedAt }]
 *
 * 复制格式严格固定（无 emoji / 无多余字符）：
 *   9.15剪辑手quota情况记录
 *   Nana：15/14
 *   ...
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  /* ---- 获取排序后的 quota 目标人员列表 ---- */
  function getTargets() {
    const state = App.Store.state;
    const targets = (state.quotaTargets || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const pm = App.Store.personMap();
    return targets.map(t => ({
      personId: t.personId,
      name: (pm[t.personId] || {}).name || '?',
      target: t.target
    }));
  }

  /* ---- 获取某日已保存的 quota 数据，按 personId 索引 ---- */
  function getDayData(dateStr) {
    const records = App.DB.quotaGetDay(dateStr);
    const map = {};
    records.forEach(r => { map[r.personId] = r; });
    return map;
  }

  /* ---- 获取上一个工作日的 quota 记录（用于欠量继承） ---- */
  function getPrevWorkday(dateStr) {
    let d = D.addDays(dateStr, -1);
    for (let i = 0; i < 14; i++) {
      const records = App.DB.quotaGetDay(d);
      if (records.length) return { date: d, records };
      d = D.addDays(d, -1);
    }
    return null;
  }

  /* ---- 计算某日之前的累计欠量（逐工作日递推：欠量结转 + 补量抵扣） ----
   * debt = max(0, 上期欠量 - 今日补量) + 今日差额
   * 只统计最近 14 个有记录的日期，足够回溯且避免全表扫描 */
  function getDebtBefore(personId, dateStr) {
    const byDate = {};
    (App.Store.state.quotaRecords || []).forEach(r => {
      if (r.personId === personId && r.date < dateStr) (byDate[r.date] = byDate[r.date] || []).push(r);
    });
    const dates = Object.keys(byDate).sort().slice(-14);
    let debt = 0;
    dates.forEach(d => {
      const rec = byDate[d][0];
      const target = rec.target || 0;
      const actual = rec.actual || 0;
      const madeUp = Math.max(0, actual - target);
      const shortfall = Math.max(0, target - actual);
      debt = Math.max(0, debt - madeUp) + shortfall;
    });
    return debt;
  }

  /* ---- 计算欠量/补量 ----
   * prevDebt:  截至上一个工作日累计未补清的欠量
   * remainDebt: 昨日欠量 - 今日补量（补量 = 超出今日目标的部分） */
  function calcDebt(personId, dateStr, actual, target) {
    const prevDebt = getDebtBefore(personId, dateStr);
    const madeUp = Math.max(0, (actual || 0) - (target || 0));
    const remain = Math.max(0, prevDebt - madeUp);
    return { prevDebt, remainDebt: remain };
  }

  /* ---- 获取当日备注 ---- */
  function getNote(dateStr) {
    const rec = App.DB.quotaGetNote(dateStr);
    return rec ? rec.text : '';
  }

  /* ---- 保存当日备注 ---- */
  function saveNote(dateStr, text) {
    App.DB.quotaSaveNote(dateStr, text);
  }

  /* ---- 构建纯文本复制内容（严格格式） ----
   * 首行固定为「M.D剪辑手quota情况记录」
   * 末行如有备注则追加「备注：<text>」 */
  function buildCopyText(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const head = (d.getMonth() + 1) + '.' + d.getDate() + '剪辑手quota情况记录';
    const targets = getTargets();
    const dayData = getDayData(dateStr);
    const lines = [head];
    targets.forEach(t => {
      const rec = dayData[t.personId];
      const actual = rec ? rec.actual : 0;
      lines.push(t.name + '：' + actual + '/' + t.target);
    });
    const note = (getNote(dateStr) || '').trim();
    if (note) lines.push('备注：' + note);
    return lines.join('\n');
  }

  /* ---- 复制今日 Quota ---- */
  async function copyQuota(dateStr) {
    const text = buildCopyText(dateStr || D.today());
    const ok = await D.copyText(text);
    App.UI.toast(ok ? '已复制今日Quota' : '复制失败，请手动复制');
    return ok;
  }

  /* ---- 保存今日 Quota + 自动标记审核任务完成 ---- */
  function saveDay(dateStr, entries) {
    App.DB.quotaSaveDay(dateStr, entries);
    // 自动标记「审核视频 + 检查 Quota」任务为已完成
    const todayTasks = App.Store.tasksOn(dateStr);
    const quotaTask = todayTasks.find(t => t.templateId === 'tpl_1' || /quota|Quota|审核视频/.test(t.title));
    if (quotaTask && quotaTask.status !== 'done') {
      App.Tasks.setStatus(quotaTask.id, 'done');
    }
    App.UI.toast('Quota 已保存');
  }

  /* ---- Quota 历史 ---- */
  function getHistory(filters) {
    filters = filters || {};
    let records = (App.Store.state.quotaRecords || []).slice();
    if (filters.from) records = records.filter(r => r.date >= filters.from);
    if (filters.to) records = records.filter(r => r.date <= filters.to);
    if (filters.personId) records = records.filter(r => r.personId === filters.personId);
    // 按日期降序分组
    const groups = {};
    records.forEach(r => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => ({
      date,
      entries: groups[date].sort((a, b) => {
        const ta = (App.Store.state.quotaTargets || []).find(t => t.personId === a.personId);
        const tb = (App.Store.state.quotaTargets || []).find(t => t.personId === b.personId);
        return (ta ? ta.order : 999) - (tb ? tb.order : 999);
      })
    }));
  }

  App.Quota = {
    getTargets,
    getDayData,
    getPrevWorkday,
    calcDebt,
    getNote,
    saveNote,
    buildCopyText,
    copyQuota,
    saveDay,
    getHistory
  };
})();
