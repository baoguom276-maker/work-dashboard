/* ============================================================
 * report.js — 一键生成日报
 * 依据某日任务自动归类：今日完成 / 异常问题 / 账号搭建 / Quota / 进行中 / 明日待跟进
 * 跳过没有内容的分类，不输出空段
 * 输出纯文本（飞书可直接粘贴）
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  function taskLine(task, personMap, opts) {
    opts = opts || {};
    let line = task.title;
    const names = (task.personIds || []).map(id => (personMap[id] || {}).name).filter(Boolean);
    if (names.length) line += '（' + names.join(' / ') + '）';
    if (opts.markOrigin && task.date !== opts.dateStr) line += '（遗留自 ' + D.fmtCN(task.date) + '）';
    if (task.result && task.result.trim()) {
      line += '——' + String(task.result).trim();
    }
    return line;
  }

  function build(dateStr) {
    const tasks = App.Store.tasksOn(dateStr);
    const allTasks = App.Store.state.tasks;
    const personMap = App.Store.personMap();

    const done = tasks.filter(t => t.status === 'done');
    const problems = tasks.filter(t => t.status !== 'done' && t.module === '问题处理');
    const setup = tasks.filter(t => t.status !== 'done' && t.module === '账号搭建');
    const doing = tasks.filter(t => t.status === 'doing' && t.module !== '问题处理' && t.module !== '账号搭建');
    const follow = allTasks
      .filter(t => t.status !== 'done' && t.date <= dateStr)
      .sort((a, b) => a.date === b.date ? (a.order || 0) - (b.order || 0) : (a.date < b.date ? -1 : 1));

    // Quota 数据
    const quotaText = (App.Quota && App.Quota.buildCopyText) ? App.Quota.buildCopyText(dateStr) : '';
    // 只有真正录入过数据才显示 Quota 段
    const hasQuota = (App.DB.quotaGetDay(dateStr) || []).length > 0;

    // 今日小记
    const tips = (App.Store.state.tips || []).filter(t => t.date === dateStr);

    const d = new Date(dateStr + 'T00:00:00');
    const md = d.getMonth() + 1, dd = d.getDate();

    function section(title, list) {
      if (!list.length) return null;
      const body = list.map((t, i) => `${i + 1}. ${taskLine(t, personMap, { markOrigin: true, dateStr })}`).join('\n');
      return `${title}：\n${body}`;
    }

    const secs = [
      section('今日完成', done),
      section('异常/问题处理', problems),
      section('账号搭建', setup),
      hasQuota ? ('Quota情况：\n' + quotaText) : null,
      tips.length ? ('今日小记：\n' + tips.map(t => '· ' + t.text).join('\n')) : null,
      section('进行中', doing),
      section('明日待跟进', follow)
    ].filter(Boolean);

    const head = `【${md}月${dd}日工作日报】`;
    const plain = secs.length ? (head + '\n\n' + secs.join('\n\n')) : (head + '\n\n今天还没有记录的任务。');

    return { plain, counts: { done: done.length, problems: problems.length, setup: setup.length, doing: doing.length, follow: follow.length, total: tasks.length } };
  }

  App.Report = {
    build,
    filename(dateStr) {
      return '工作日报_' + dateStr + '.txt';
    }
  };
})();
