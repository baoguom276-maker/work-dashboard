/* ============================================================
 * nlp.js — 自然语言快速记录解析
 *
 * 第一阶段：本地关键词规则，无需任何 API、可离线使用。
 *
 * 后续接入 AI：
 *   实现 App.NLP.parseWithAI(text, people, modules)（见文件底部预留），
 *   在 parse() 内优先尝试 AI、失败/未配置时自动回退到规则解析，
 *   页面层无需改动。
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  /**
   * 模块关键词规则（按顺序匹配，先命中先生效）
   */
  const MODULE_RULES = [
    { module: '账号搭建', re: /(新建|新注册|注册|创建|开\s*\d*\s*个|搭建).*?(账号|IG|YT|TK|Instagram|TikTok|YouTube)|给.{0,12}?(新建|注册|创建)/ },
    { module: 'IG测试', re: /IG\s*测试|IG测试|测试.*?账号|实验/ },
    { module: '剪辑手管理', re: /审核|quota|Quota|QUOTA|剪辑手|剪辑|素材/ },
    { module: '问题处理', re: /异常|登出|掉线|登录不上|验证|限制|受限|封号|申诉|封了|人机|手机号验证|手机号|验证码|封禁|无法登录|出问题|刷机|VPN|设备/ },
    { module: '视频发布', re: /发布|上传.*?(视频|作品)|养号|链接登记|登记链接|检查链接/ },
    { module: '数据分析', re: /数据更新|更新数据|数据统计|拉数据|报表|数据分析/ },
    { module: '日常运营', re: /日常|巡检|检查|回复|私信|评论/ }
  ];

  const STATUS_RULES = [
    { status: 'done', re: /已完成|完成了|搞定|已处理|已发布|已注册|已创建/ },
    { status: 'doing', re: /正在|进行中|处理中|跟进中/ },
    // 注：待处理任务同样会自动进入待跟进；仅明确表达"明天/需要跟进"时才标记为需跟进
    { status: 'followup', re: /待跟进|需要跟进|明天再?跟进?|明日再?跟进?/ }
  ];

  /**
   * 解析入口
   * @param {string} text 原始输入
   * @param {{name:string,id:string}[]} people 当前人员列表
   * @param {string[]} modules 模块列表
   * @returns {{module:string|null,title:string,personIds:string[],status:string,result:string,tags:string[]}}
   */
  function parse(text, people, modules) {
    people = people || [];
    modules = modules || [];
    const raw = String(text || '').trim();

    const tags = [];
    let module = null;
    let status = 'pending';
    let personIds = [];
    let title = raw;
    let result = '';

    if (!raw) return { module: null, title: '', personIds: [], status: 'pending', result: '', tags: [] };

    /* 1. 对接人：按名字长度倒序匹配，并用字符区间去重，
     *    避免 "Angela Claro" 同时命中 "Angela" */
    const names = people.slice().sort((a, b) => b.name.length - a.name.length);
    const hitNames = new Set();
    const ranges = [];
    names.forEach(p => {
      if (!p.name) return;
      let idx = raw.indexOf(p.name);
      while (idx !== -1) {
        const end = idx + p.name.length;
        const inside = ranges.some(r => idx >= r[0] && end <= r[1]);
        if (!inside) {
          personIds.push(p.id);
          hitNames.add(p.name);
          ranges.push([idx, end]);
          break;
        }
        idx = raw.indexOf(p.name, idx + 1);
      }
    });
    if (personIds.length) tags.push('识别到对接人：' + Array.from(hitNames).join('、'));

    /* 2. 模块：优先在已存在模块名中找包含关系，再走关键词规则 */
    const direct = modules.find(m => raw.indexOf(m) !== -1);
    if (direct) {
      module = direct;
    } else {
      for (const rule of MODULE_RULES) {
        if (modules.length && modules.indexOf(rule.module) === -1) continue;
        if (rule.re.test(raw)) { module = rule.module; break; }
      }
    }
    if (module) tags.push('归类到「' + module + '」');
    if (!module) module = modules.indexOf('其他') !== -1 ? '其他' : (modules[0] || null);

    /* 3. 状态 */
    for (const rule of STATUS_RULES) {
      if (rule.re.test(raw)) { status = rule.status; break; }
    }

    /* 4. 标题 / 备注拆分：首个逗号（中英）之后视为补充说明
     *    “给Ivan新建2个IG，刷机之后处理” → 标题 + 备注 */
    const split = raw.split(/[，,。；;]\s*/);
    if (split.length > 1) {
      title = split[0].trim();
      result = split.slice(1).filter(Boolean).join('；').trim();
      // 备注里明确出现“跟进”信号时同步为需跟进
      if (/跟进/.test(result) && status === 'pending') status = 'followup';
      if (result) tags.push('已拆分备注');
    }

    if (status !== 'pending') tags.push('初始状态：' + ({
      done: '已完成', doing: '进行中', followup: '需跟进'
    })[status]);

    return { module, title, personIds, status, result, tags };
  }

  App.NLP = {
    parse: parse

    /* ----- AI 适配位（第二阶段）-----
     * settings 中配置 apiBase / apiKey / model 后启用：
     *
     * async parseWithAI(text, people, modules, aiConfig) {
     *   const prompt = `从工作记录提取 JSON：module/title/personNames/status/result...`;
     *   const res = await fetch(aiConfig.apiBase + '/chat/completions', {
     *     method: 'POST',
     *     headers: { Authorization: 'Bearer ' + aiConfig.apiKey, 'Content-Type': 'application/json' },
     *     body: JSON.stringify({ model: aiConfig.model, messages: [...], response_format: { type: 'json_object' } })
     *   });
     *   ...返回与 parse() 同构的对象
     * },
     *
     * async parseSmart(text, people, modules, aiConfig) {
     *   if (aiConfig && aiConfig.apiKey) {
     *     try { return await this.parseWithAI(...); } catch (e) { console.warn('AI 解析失败，回退规则', e); }
     *   }
     *   return this.parse(text, people, modules);
     * }
     */
  };
})();
