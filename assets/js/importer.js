/* ============================================================
 * importer.js — 历史记录导入
 * 支持：CSV（Excel 可「另存为 CSV」）、Markdown 表格、直接粘贴文本
 * 流程：解析 → 自动识别列映射（可手动调整）→ 预览 → 导入
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  const FIELDS = [
    { key: 'ignore', label: '（忽略此列）' },
    { key: 'date', label: '日期' },
    { key: 'module', label: '工作模块' },
    { key: 'title', label: '工作事项' },
    { key: 'people', label: '对接人/账号' },
    { key: 'status', label: '状态' },
    { key: 'result', label: '结果/备注' },
    { key: 'followup', label: '待跟进/明日计划' }
  ];

  /* ---------- CSV 解析（支持引号、逗号、换行） ---------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    const s = String(text).replace(/\r\n?/g, '\n');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  /* ---------- Markdown 表格解析 ---------- */
  function parseMarkdown(text) {
    const lines = String(text).split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /^\|.*\|$/.test(l));
    if (lines.length < 2) return null;
    const split = line => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const headers = split(lines[0]);
    // 第二行通常是 |---|---|，跳过
    const rows = lines.slice(1).filter(l => !/^\|[\s:|-]+\|$/.test(l)).map(split);
    return { headers, rows };
  }

  function detect(text) {
    const t = String(text || '').trim();
    if (/^\|.*\|$/m.test(t) && /\|[\s:|-]+\|/.test(t)) return 'md';
    return 'csv';
  }

  /* ---------- 列名猜测 ---------- */
  function guessField(name) {
    const s = String(name || '').trim();
    if (/日期|时间|date|day/i.test(s)) return 'date';
    if (/模块|分类|类别|module|category|类型/i.test(s)) return 'module';
    if (/对接人|人员|联系人|负责人|剪辑手|相关人|账号|account|person|people/i.test(s)) return 'people';
    if (/事项|工作|内容|任务|标题|title|task|事情|描述|做了?什么/i.test(s)) return 'title';
    if (/状态|status/i.test(s)) return 'status';
    if (/跟进|明日|次日|待办|follow|next/i.test(s)) return 'followup';
    if (/备注|结果|记录|说明|result|note|comment/i.test(s)) return 'result';
    return 'ignore';
  }

  /* ---------- 人员文本 → personIds（自动识别 + 自动创建） ---------- */
  function resolvePeople(cell, people, autoCreate) {
    const ids = [];
    if (!cell || !String(cell).trim()) return { ids, created: [] };
    // 先按现有人员名字做包含匹配（长名字优先）
    const ordered = people.slice().sort((a, b) => b.name.length - a.name.length);
    let rest = String(cell);
    const created = [];
    ordered.forEach(p => {
      if (rest.indexOf(p.name) !== -1) {
        if (ids.indexOf(p.id) === -1) ids.push(p.id);
        rest = rest.split(p.name).join(' ');
      }
    });
    // 剩余按分隔符拆词，自动创建为新人员
    if (autoCreate) {
      rest.split(/[,，、\/;；\s]+/).map(x => x.trim()).filter(Boolean).forEach(name => {
        let p = people.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!p) {
          p = { id: D.uid('p'), name: name, platforms: [], account: { ig: '', yt: '', tk: '' }, notes: '' };
          App.DB.add('people', p);
          people.push(p);
          created.push(name);
        }
        if (ids.indexOf(p.id) === -1) ids.push(p.id);
      });
    }
    return { ids, created };
  }

  function matchModule(text, modules) {
    const s = String(text || '');
    const hit = modules.find(m => s.indexOf(m) !== -1);
    if (hit) return hit;
    return modules.indexOf('其他') !== -1 ? '其他' : (modules[0] || '未分类');
  }

  /* ---------- 行映射预览 / 正式导入 ---------- */
  function mapRows(headers, rows, mapping, opts) {
    const state = App.Store.state;
    const people = state.people.slice();
    const tasks = [];
    const createdPeople = [];
    let skipped = 0;

    rows.forEach(cells => {
      const get = f => {
        const idx = mapping.indexOf(f);
        return idx >= 0 ? String(cells[idx] || '').trim() : '';
      };
      const title = get('title');
      const dateStr = D.parseLooseDate(get('date')) || opts.defaultDate;
      if (!title || !dateStr) { skipped++; return; }

      const { ids, created } = resolvePeople(get('people'), people, opts.autoCreatePeople);
      created.forEach(n => createdPeople.indexOf(n) === -1 && createdPeople.push(n));

      let status = D.matchStatus(get('status')) || 'pending';
      let result = get('result');
      const follow = get('followup');
      if (follow) {
        result = result ? result + '\n【待跟进】' + follow : '【待跟进】' + follow;
        if (status === 'pending') status = 'followup';
      }

      tasks.push({
        id: D.uid('task'),
        date: dateStr,
        module: matchModule(get('module'), state.modules),
        title: title,
        personIds: ids,
        status: status,
        result: result,
        templateId: null,
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: status === 'done' ? new Date().toISOString() : null,
        imported: true
      });
    });

    return { tasks, skipped, createdPeople };
  }

  /* ---------- 导入向导 UI ---------- */
  function openImport() {
    let parsed = null;     // {headers, rows, format}
    let mapping = [];

    const body = document.createElement('div');

    function step1HTML() {
      return D.html`
        <div class="import-step">
          <div class="field">
            <label class="field-label">① 选择文件（.csv / .md / .txt）或直接粘贴表格内容</label>
            <input type="file" id="impFile" accept=".csv,.md,.markdown,.txt" class="input" />
            <div class="hint-text">Excel 请先「文件 → 另存为 → CSV UTF-8」；Markdown 表格需含表头行与 <code>|---|</code> 分隔行。</div>
          </div>
          <div class="field">
            <label class="field-label">粘贴内容</label>
            <textarea id="impText" class="input" rows="7" placeholder="日期,工作模块,工作事项,对接人,状态,备注&#10;2026-09-10,问题处理,IG账号登出,Angela Claro,需跟进,需要重新注册IG"></textarea>
          </div>
          <div class="field">
            <label class="field-label">无法识别日期时的默认日期</label>
            <input type="date" id="impDefaultDate" class="input" value="${D.today()}" />
          </div>
        </div>`;
    }

    function step2HTML() {
      const previewRows = parsed.rows.slice(0, 5);
      return D.html`
        <div class="import-step">
          <label class="field-label">② 确认列映射（已自动识别，可手动调整）· 共 ${parsed.rows.length} 行</label>
          <div class="table-wrap">
            <table class="map-table">
              <thead><tr>${D.raw(parsed.headers.map((h, i) => D.html`
                <th>
                  <div>${h || '第' + (i + 1) + '列'}</div>
                  <select class="input" data-map-col="${i}" style="margin-top:4px;min-width:110px">
                    ${D.raw(FIELDS.map(f => D.html`<option value="${f.key}" ${mapping[i] === f.key ? 'selected' : ''}>${f.label}</option>`).join(''))}
                  </select>
                </th>`).join(''))}</tr></thead>
              <tbody>
                ${D.raw(previewRows.map(r => D.html`<tr>${D.raw(parsed.headers.map((_, i) => D.html`<td title="${r[i]}">${r[i] || ''}</td>`).join(''))}</tr>`).join(''))}
              </tbody>
            </table>
          </div>
          <div class="field" style="margin-top:12px">
            <label class="radio-line">
              <input type="checkbox" id="impAutoPeople" checked />
              自动把不认识的对接人加入人员列表
            </label>
          </div>
        </div>`;
    }

    function renderStep(step) {
      body.innerHTML = step === 1 ? step1HTML() : step2HTML();
      if (step === 1) {
        body.querySelector('#impFile').addEventListener('change', e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => { body.querySelector('#impText').value = reader.result; };
          reader.readAsText(file, 'utf-8');
        });
        modal.setFoot([
          { label: '取消', onClick: close },
          { label: '解析内容 →', variant: 'primary', onClick: doParse }
        ]);
      } else {
        body.querySelectorAll('[data-map-col]').forEach(sel => {
          sel.addEventListener('change', () => {
            mapping[+sel.dataset.mapCol] = sel.value;
          });
        });
        modal.setFoot([
          { label: '← 返回', onClick: () => renderStep(1) },
          { label: '确认导入', variant: 'primary', onClick: doImport }
        ]);
      }
    }

    function doParse() {
      const text = body.querySelector('#impText').value;
      if (!text.trim()) { App.UI.toast('请先选择文件或粘贴内容'); return; }
      const fmt = detect(text);
      if (fmt === 'md') {
        const md = parseMarkdown(text);
        if (!md) { App.UI.toast('Markdown 表格格式无法识别'); return; }
        parsed = { headers: md.headers, rows: md.rows, format: 'md' };
      } else {
        const csv = parseCSV(text);
        if (csv.length < 2) { App.UI.toast('至少需要表头行 + 一行数据'); return; }
        parsed = { headers: csv[0], rows: csv.slice(1), format: 'csv' };
      }
      mapping = parsed.headers.map(guessField);
      if (mapping.indexOf('title') === -1) {
        // 退化：第二列当事项
        if (parsed.headers.length >= 2) mapping[1] = mapping[1] === 'ignore' ? 'title' : mapping[1];
      }
      renderStep(2);
    }

    function doImport() {
      const defaultDate = body.querySelector('#impDefaultDate') ?
        body.querySelector('#impDefaultDate').value : D.today();
      const autoCreate = body.querySelector('#impAutoPeople') ?
        body.querySelector('#impAutoPeople').checked : true;
      const { tasks, skipped, createdPeople } = mapRows(
        parsed.headers, parsed.rows, mapping,
        { defaultDate: defaultDate || D.today(), autoCreatePeople: autoCreate }
      );
      if (!tasks.length) { App.UI.toast('没有可导入的有效行（请检查日期与事项列）'); return; }
      App.DB.bulkAdd('tasks', tasks);
      App.Store.commit();
      let msg = `已导入 ${tasks.length} 条历史记录`;
      if (createdPeople.length) msg += `，新增人员 ${createdPeople.length} 位（${createdPeople.join('、')}）`;
      if (skipped) msg += `，跳过 ${skipped} 行`;
      App.UI.toast(msg);
      close();
      if (location.hash !== '#/history') location.hash = '#/history';
    }

    const modal = App.UI.modal({
      title: '导入历史记录（CSV / Excel / Markdown）',
      size: 'lg',
      bodyNode: body,
      buttons: []
    });
    function close() { modal.close(); }
    renderStep(1);
  }

  App.Importer = { open: openImport, parseCSV, parseMarkdown, detect, guessField, mapRows };
})();
