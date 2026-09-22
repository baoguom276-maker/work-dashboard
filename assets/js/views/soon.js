/* ============================================================
 * views/soon.js — 第二阶段页面占位：账号管理、工作统计
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  function comingSoon(root, cfg) {
    root.innerHTML = D.html`
      <div class="soon-hero">
        <div class="es-icon">${cfg.icon}</div>
        <div class="page-title" style="justify-content:center">${cfg.title} <span class="tag tag-soon">第二阶段</span></div>
        <div class="page-sub" style="max-width:520px;margin:8px auto 0">${cfg.sub}</div>
        <div class="soon-features">
          ${D.raw(cfg.features.map(f => D.html`
            <div class="card soon-feature"><strong>${f[0]}</strong>${f[1]}</div>`).join(''))}
        </div>
      </div>`;
  }

  App.Views.accounts = {
    title: '账号管理',
    mount(root) {
      comingSoon(root, {
        icon: '🔗',
        title: '账号管理',
        sub: '第一阶段先跑通每日记录与待跟进闭环；账号库将在下一阶段接入，并与任务、人员自动关联。',
        features: [
          ['账号档案', '平台（IG/TK/YT）、账号名、链接、负责人、设备编号、状态、备注'],
          ['状态跟踪', '正常 / 观察中 / 受限 / 需验证 / 已失效 / 待创建'],
          ['任务关联', '选择对接人后自动列出其名下账号，任务直接挂到具体账号'],
          ['账号时间线', '打开账号即可查看历史问题、相关任务与处理记录'],
          ['问题速查', '直接回答「Ivan 哪个 IG 出问题了」']
        ]
      });
    }
  };

  App.Views.stats = {
    title: '工作统计',
    mount(root) {
      comingSoon(root, {
        icon: '📊',
        title: '工作统计',
        sub: '数据持续积累中，第二阶段提供可视化统计（柱状图 / 折线图 / 饼图）。',
        features: [
          ['完成趋势', '本周 / 本月完成任务数，按日折线展示'],
          ['模块占比', '不同工作模块的时间投入占比'],
          ['状态分布', '待处理 / 进行中 / 需跟进 / 已完成数量'],
          ['人员维度', '各剪辑手相关事项数量与问题分布'],
          ['专题统计', '问题处理数、账号搭建数等关键运营指标']
        ]
      });
    }
  };
})();
