/* ============================================================
 * util.js — 通用工具：ID、转义、HTML 模板、日期、下载等
 * 零依赖，挂载到 window.D
 * ============================================================ */
(function () {
  'use strict';

  const D = {};

  /* ---------- 唯一 ID ---------- */
  D.uid = function (prefix) {
    const s = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '')
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return (prefix || 'id') + '_' + s;
  };

  /* ---------- HTML 转义 ---------- */
  D.esc = function (val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * html 标签模板：自动转义所有插值
   *   D.html`<div>${name}</div>`
   * - 数组：逐项拼接（元素应为已转义字符串或 Raw）
   * - Raw（D.raw(...)）：标记为可信 HTML 片段，直接拼接
   * - false/null/undefined：输出空串
   */
  class RawHTML { constructor(s) { this.s = s; } }
  D.raw = (s) => new RawHTML(s);
  function renderVal(v) {
    if (v instanceof RawHTML) return v.s;
    if (Array.isArray(v)) return v.map(renderVal).join('');
    if (v === false || v === null || v === undefined) return '';
    return D.esc(v);
  }
  D.html = function (strings, ...vals) {
    let out = '';
    strings.forEach((s, i) => {
      out += s;
      if (i < vals.length) out += renderVal(vals[i]);
    });
    return out;
  };

  /* ---------- 日期（统一 YYYY-MM-DD，本地时区） ---------- */
  D.pad2 = (n) => String(n).padStart(2, '0');

  D.toDateStr = function (d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + D.pad2(d.getMonth() + 1) + '-' + D.pad2(d.getDate());
  };

  D.today = function () { return D.toDateStr(new Date()); };

  D.addDays = function (dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return D.toDateStr(d);
  };

  /** 中文星期：1..7（周一=1） */
  D.weekday = function (dateStr) {
    const day = new Date(dateStr + 'T00:00:00').getDay(); // 0=周日
    return day === 0 ? 7 : day;
  };

  const WEEK_CN = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  D.weekdayCN = (dateStr) => WEEK_CN[D.weekday(dateStr)];

  /** 9月15日 周一 */
  D.fmtCN = function (dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + D.weekdayCN(dateStr);
  };

  /** 相对日期标签：今天/昨天/前天/具体日期 */
  D.relLabel = function (dateStr) {
    const today = D.today();
    if (dateStr === today) return '今天';
    if (dateStr === D.addDays(today, -1)) return '昨天';
    if (dateStr === D.addDays(today, -2)) return '前天';
    return D.fmtCN(dateStr);
  };

  D.dayDiff = function (a, b) {
    const da = new Date(a + 'T00:00:00').getTime();
    const db = new Date(b + 'T00:00:00').getTime();
    return Math.round((da - db) / 86400000);
  };

  /**
   * 宽松解析中文/英文日期：
   *   2026-09-01 / 2026/9/1 / 2026年9月1日 / 9月1日(补当年) / 09-01(补当年)
   * 解析失败返回 null
   */
  D.parseLooseDate = function (text) {
    if (!text) return null;
    const s = String(text).trim();
    let m = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    if (m) return D.toDateStr(new Date(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/(?:(\d{1,2})\s*月\s*(\d{1,2})\s*日?)/);
    if (m) return D.toDateStr(new Date(new Date().getFullYear(), +m[1] - 1, +m[2]));
    m = s.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})$/);
    if (m) return D.toDateStr(new Date(new Date().getFullYear(), +m[1] - 1, +m[2]));
    return null;
  };

  /* ---------- 状态元数据 ---------- */
  D.STATUSES = [
    { key: 'pending', label: '待处理', cls: 'tag-pending', dot: '#8f959e' },
    { key: 'doing', label: '进行中', cls: 'tag-doing', dot: '#1f6feb' },
    { key: 'followup', label: '需跟进', cls: 'tag-followup', dot: '#e8920c' },
    { key: 'done', label: '已完成', cls: 'tag-done', dot: '#20a064' }
  ];
  D.STATUS_MAP = D.STATUSES.reduce((o, s) => { o[s.key] = s; return o; }, {});
  /** 宽松识别历史数据里的状态文字 */
  D.matchStatus = function (text) {
    const s = String(text || '');
    if (/完成|搞定|已做|已结束|done|finished|complete/i.test(s)) return 'done';
    if (/跟进|待办|未完成|遗留|待处理|blocked|waiting/i.test(s)) return 'followup';
    if (/进行|处理中|doing|ongoing/i.test(s)) return 'doing';
    return null;
  };

  /* ---------- 模块颜色（按名称稳定哈希浅色） ---------- */
  const MOD_HUES = [215, 152, 27, 280, 350, 190, 110, 20];
  D.moduleColor = function (name) {
    let h = 0;
    for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const hue = MOD_HUES[h % MOD_HUES.length];
    return {
      bg: `hsl(${hue} 45% 95%)`,
      color: `hsl(${hue} 45% 34%)`,
      border: `hsl(${hue} 40% 86%)`
    };
  };

  /* ---------- 频率 / 平台 文案 ---------- */
  D.freqText = function (tpl) {
    if (!tpl.active) return '已停用';
    if (tpl.freq === 'daily') return '每天';
    if (tpl.freq === 'weekdays') return '工作日（周一至周五）';
    if (tpl.freq === 'weekly' && tpl.weekdays && tpl.weekdays.length) {
      return '每周 ' + tpl.weekdays.slice().sort().map(n => WEEK_CN[n]).join('、');
    }
    return '未设置';
  };
  D.PLATFORMS = ['IG', 'YT', 'TK'];

  /* ---------- 账号主页 URL ----------
   * 输入平台缩写(IG/YT/TK) + 用户名，返回该平台主页 URL
   * 用户名自动去除前导 @，YT/TK 自动补 @
   * 空用户名返回 null（不渲染链接）
   */
  D.accountURL = function (platform, username) {
    if (!username) return null;
    const name = String(username).replace(/^@+/, '').trim();
    if (!name) return null;
    if (platform === 'IG') return 'https://www.instagram.com/' + name + '/';
    if (platform === 'YT') return 'https://www.youtube.com/@' + name;
    if (platform === 'TK') return 'https://www.tiktok.com/@' + name;
    return null;
  };

  // 规范化 account 字段：旧字符串 → {ig, yt, tk} 对象
  // 旧值按 platforms[0] 推断塞入；platforms 空则默认 ig
  D.normalizeAccount = function (oldAccount, platforms) {
    const obj = { ig: '', yt: '', tk: '' };
    if (oldAccount && typeof oldAccount === 'object') {
      obj.ig = oldAccount.ig || '';
      obj.yt = oldAccount.yt || '';
      obj.tk = oldAccount.tk || '';
      return obj;
    }
    if (typeof oldAccount === 'string' && oldAccount.trim()) {
      const pl = (platforms && platforms[0]) || 'IG';
      if (pl === 'IG') obj.ig = oldAccount.trim();
      else if (pl === 'YT') obj.yt = oldAccount.trim();
      else if (pl === 'TK') obj.tk = oldAccount.trim();
      else obj.ig = oldAccount.trim();
    }
    return obj;
  };

  // 渲染账号链接（返回 RawHTML，可安全插入 D.html 模板）
  D.accountLinksHTML = function (account) {
    const acc = D.normalizeAccount(account, []);
    const links = [];
    D.PLATFORMS.forEach(pl => {
      const name = acc[pl.toLowerCase()];
      if (name) {
        const url = D.accountURL(pl, name);
        if (url) {
          const display = name.replace(/^@+/, '');
          links.push('<a class="acc-link" href="' + url + '" target="_blank" rel="noopener" title="打开 ' + pl + ' 主页"><span class="acc-pl acc-pl-' + pl.toLowerCase() + '">' + pl + '</span>' + D.esc(display) + '</a>');
        }
      }
    });
    return links.length ? D.raw('<span class="acc-links">' + links.join('') + '</span>') : null;
  };

  /* ---------- 文件下载 ---------- */
  D.download = function (filename, content, mime) {
    const blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  D.copyText = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // file:// 等场景降级
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      return ok;
    }
  };

  D.debounce = function (fn, wait) {
    let timer = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(self, args), wait || 200);
    };
  };

  window.D = D;
})();
