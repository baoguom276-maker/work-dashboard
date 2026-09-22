/* ============================================================
 * db.js — 数据访问层（Repository）
 *
 * 当前实现：localStorage（单 key 持久化，零依赖、可直接 file:// 运行）
 *
 * 后续切换 Supabase 时，只需让新适配器实现同样的接口：
 *   all(coll) / find(coll,id) / add(coll,obj)
 *   update(coll,id,patch) / remove(coll,id)
 *   replaceAll(coll,arr) / exportAll() / importAll(data)
 * 上层（App.Store / 页面视图）不直接接触 localStorage。
 *
 * 集合（对应未来 Supabase 表）：
 *   tasks     任务
 *   people    人员（对接人/剪辑手）
 *   modules   工作模块（字符串数组）
 *   templates 重复任务模板 task_templates
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  const STORAGE_KEY = 'dwd_dashboard_v1';

  /* ---------- 默认数据 ---------- */
  function seedData() {
    const names = ['Nana', 'Anna', 'Angela', 'Ivan', 'Angela Claro', 'Sofiia', 'Luca', 'Mariia', 'Irina'];
    const people = names.map((name, i) => ({
      id: 'p_' + (i + 1),
      name: name,
      // Nana、Ivan 示例为全平台，其他留空由你维护
      platforms: (name === 'Nana' || name === 'Ivan') ? ['IG', 'YT', 'TK'] : [],
      account: {},
      notes: ''
    }));
    const ids = Object.fromEntries(names.map((n, i) => [n, 'p_' + (i + 1)]));

    const modules = ['日常运营', '视频发布', '剪辑手管理', '账号搭建', '问题处理', 'IG测试', '数据分析', '其他'];

    // Quota 默认目标值（可在设置中修改）
    const quotaTargets = [
      { personId: ids.Nana,         target: 14, order: 10 },
      { personId: ids['Angela Claro'], target: 16, order: 20 },
      { personId: ids.Anna,         target: 20, order: 30 },
      { personId: ids.Angela,       target: 20, order: 40 },
      { personId: ids.Ivan,         target: 12, order: 50 },
      { personId: ids.Sofiia,       target: 16, order: 60 }
    ];

    // 每日固定任务模板（可在「设置」中增删改、停用、调整频率）
    const templates = [
      {
        id: 'tpl_1', title: '审核视频 + 检查 Quota', module: '剪辑手管理',
        personIds: [ids.Nana, ids.Anna, ids.Angela, ids.Ivan],
        freq: 'weekdays', weekdays: [1, 2, 3, 4, 5], active: true, order: 10
      },
      {
        id: 'tpl_2', title: '视频发布、养号及检查链接登记', module: '视频发布',
        personIds: [],
        freq: 'weekdays', weekdays: [1, 2, 3, 4, 5], active: true, order: 20
      }
    ];

    return {
      // generated: { [templateId]: ['2026-09-15', ...] } —— 模板每日生成日志，
      // 保证「已生成」与任务本身解耦：任务被改期/删除后不会被再次自动补建
      meta: { version: 1, createdAt: new Date().toISOString(), seeded: true, generated: {} },
      tasks: [],
      people: people,
      modules: modules,
      templates: templates,
      quotaTargets: quotaTargets,
      quotaRecords: [],
      quotaNotes: [],  // 每日 Quota 备注：{ id, date, text, savedAt }
      inbox: [],  // 随手记：{ id, text, createdAt }
      tips: []    // 今日小记：{ id, date, text, createdAt }
    };
  }

  /* ---------- localStorage 适配器 ---------- */
  const LocalAdapter = (function () {
    let cache = null;
    let listeners = [];

    function load() {
      if (cache) return cache;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          cache = JSON.parse(raw);
        } catch (e) {
          console.error('本地数据解析失败，将重建初始数据', e);
          cache = seedData();
          save();
        }
      } else {
        cache = seedData();
        save();
      }
      // 结构兜底
      cache.tasks = cache.tasks || [];
      cache.people = cache.people || [];
      cache.modules = cache.modules || [];
      cache.templates = cache.templates || [];
      cache.quotaRecords = cache.quotaRecords || [];
      cache.quotaNotes = cache.quotaNotes || [];
      cache.inbox = cache.inbox || [];
      cache.tips = cache.tips || [];
      // 迁移：移除已下线的 tpl_3（检查剪辑手/账号异常）和 tpl_4（数据更新）
      if (cache.templates && cache.templates.length) {
        cache.templates = cache.templates.filter(t => t.id !== 'tpl_3' && t.id !== 'tpl_4');
      }
      // 同时清掉这两个模板已生成、但还没完成的任务（包括今天的），
      // 让它们从工作台消失；已完成的历史记录保留不动
      if (cache.tasks && cache.tasks.length) {
        const before = cache.tasks.length;
        cache.tasks = cache.tasks.filter(t =>
          !(t.templateId === 'tpl_3' || t.templateId === 'tpl_4') || t.status === 'done'
        );
        if (cache.tasks.length !== before) setTimeout(() => { save(); }, 0);
      }
      cache.meta = cache.meta || { version: 1 };
      // 迁移：旧 account 字符串 → {ig, yt, tk} 对象（按 platforms[0] 推断）
      (cache.people || []).forEach(p => {
        if (p.account && typeof p.account === 'string') {
          p.account = D.normalizeAccount(p.account, p.platforms || []);
        } else if (!p.account || typeof p.account !== 'object') {
          p.account = { ig: '', yt: '', tk: '' };
        } else {
          if (!('ig' in p.account)) p.account.ig = '';
          if (!('yt' in p.account)) p.account.yt = '';
          if (!('tk' in p.account)) p.account.tk = '';
        }
      });
      // v=13 升级：旧版本缓存没有 quotaTargets，按当前人员播种默认值
      if (!Array.isArray(cache.quotaTargets) || cache.quotaTargets.length === 0) {
        const defaultTargets = seedData().quotaTargets;
        const peopleIds = new Set((cache.people || []).map(p => p.id));
        const matched = defaultTargets.filter(t => peopleIds.has(t.personId));
        cache.quotaTargets = matched.length ? matched : (cache.quotaTargets || []);
        if (matched.length) {
          // 立即落盘，避免下次 load 重复播种
          setTimeout(() => { save(); }, 0);
        }
      }
      return cache;
    }

    let saveTimer = null;
    function save() {
      // 微延迟合并连续写入
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        } catch (e) {
          console.error('写入 localStorage 失败（可能空间不足）', e);
        }
      }, 30);
    }
    function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

    return {
      init: load,
      onChange(fn) { listeners.push(fn); },

      raw() { return load(); },

      all(coll) { return load()[coll] || []; },

      find(coll, id) {
        return (load()[coll] || []).find(x => x.id === id) || null;
      },

      add(coll, obj) {
        load()[coll].push(obj);
        save(); notify();
        return obj;
      },

      update(coll, id, patch) {
        const row = this.find(coll, id);
        if (!row) return null;
        Object.assign(row, patch);
        save(); notify();
        return row;
      },

      remove(coll, id) {
        const arr = load()[coll];
        const idx = arr.findIndex(x => x.id === id);
        if (idx >= 0) { arr.splice(idx, 1); save(); notify(); }
      },

      replaceAll(coll, list) {
        load()[coll] = list;
        save(); notify();
      },

      /** 批量插入（不逐条 notify） */
      bulkAdd(coll, items) {
        const arr = load()[coll];
        items.forEach(it => arr.push(it));
        save(); notify();
        return items;
      },

      /** 批量更新：patches = [{id, patch}]，只 notify 一次 */
      bulkUpdate(coll, patches) {
        const arr = load()[coll];
        patches.forEach(({ id, patch }) => {
          const row = arr.find(x => x.id === id);
          if (row) Object.assign(row, patch);
        });
        save(); notify();
      },

      /* ---- 模板生成日志（幂等） ---- */
      isGenerated(tplId, dateStr) {
        const g = load().meta.generated || {};
        return (g[tplId] || []).indexOf(dateStr) !== -1;
      },
      markGenerated(pairs) {
        const meta = load().meta;
        meta.generated = meta.generated || {};
        pairs.forEach(({ tplId, dateStr }) => {
          meta.generated[tplId] = meta.generated[tplId] || [];
          if (meta.generated[tplId].indexOf(dateStr) === -1) meta.generated[tplId].push(dateStr);
        });
        save();
      },

      /* ---- Quota 查询 ---- */
      quotaGetDay(dateStr) {
        return (load().quotaRecords || []).filter(r => r.date === dateStr);
      },
      quotaSaveDay(dateStr, entries) {
        // entries: [{ personId, actual, target }]
        const arr = load().quotaRecords;
        // 删除当天旧记录（覆盖）
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].date === dateStr) arr.splice(i, 1);
        }
        const now = new Date().toISOString();
        entries.forEach(e => {
          arr.push({ id: D.uid('q'), date: dateStr, personId: e.personId, actual: e.actual, target: e.target, savedAt: now });
        });
        save(); notify();
      },
      quotaGetNote(dateStr) {
        const arr = load().quotaNotes || [];
        return arr.find(n => n.date === dateStr) || null;
      },
      quotaSaveNote(dateStr, text) {
        const arr = load().quotaNotes || (load().quotaNotes = []);
        const i = arr.findIndex(n => n.date === dateStr);
        const now = new Date().toISOString();
        if (text == null || String(text).trim() === '') {
          if (i >= 0) arr.splice(i, 1);
        } else if (i >= 0) {
          arr[i].text = String(text); arr[i].savedAt = now;
        } else {
          arr.push({ id: D.uid('qn'), date: dateStr, text: String(text), savedAt: now });
        }
        save(); notify();
      },

      exportAll() {
        return JSON.parse(JSON.stringify(load()));
      },

      importAll(data, mode) {
        const cur = load();
        if (mode === 'merge') {
          ['tasks', 'people', 'templates', 'quotaRecords', 'quotaNotes', 'quotaTargets', 'inbox', 'tips'].forEach(coll => {
            (data[coll] || []).forEach(row => {
              const idx = cur[coll].findIndex(x => x.id === row.id);
              if (idx >= 0) cur[coll][idx] = row; else cur[coll].push(row);
            });
          });
          (data.modules || []).forEach(m => { if (!cur.modules.includes(m)) cur.modules.push(m); });
        } else {
          cache = {
            meta: cur.meta,
            tasks: data.tasks || [],
            people: data.people || [],
            modules: data.modules && data.modules.length ? data.modules : seedData().modules,
            templates: data.templates || [],
            quotaTargets: data.quotaTargets || seedData().quotaTargets,
            quotaRecords: data.quotaRecords || [],
            quotaNotes: data.quotaNotes || [],
            inbox: data.inbox || [],
            tips: data.tips || []
          };
        }
        save(); notify();
      },

      resetAll() {
        cache = seedData();
        save(); notify();
      },

      clearAll() {
        cache = {
          meta: { version: 1, clearedAt: new Date().toISOString() },
          tasks: [], people: [], modules: seedData().modules, templates: [],
          quotaTargets: seedData().quotaTargets, quotaRecords: [], quotaNotes: [], inbox: [], tips: []
        };
        save(); notify();
      },

      storageInfo() {
        const bytes = (localStorage.getItem(STORAGE_KEY) || '').length;
        const d = load();
        return {
          bytes: bytes,
          sizeKB: (bytes / 1024).toFixed(1),
          tasks: d.tasks.length,
          people: d.people.length,
          templates: d.templates.length
        };
      }
    };
  })();

  /* ---------- 对外统一仓储接口（未来替换为 SupabaseAdapter） ----------
   * Supabase 示例（预留，未启用）：
   *
   *   const SupabaseAdapter = {
   *     async all(coll) { const { data } = await supabase.from(coll).select('*'); return data; },
   *     async add(coll, obj) { const { data } = await supabase.from(coll).insert(obj).select().single(); return data; },
   *     ...
   *   };
   * ------------------------------------------------------------------ */
  App.DB = LocalAdapter;
})();
