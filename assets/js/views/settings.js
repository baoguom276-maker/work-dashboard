/* ============================================================
 * views/settings.js — 设置
 * 工作模块维护 / 重复任务模板 / 历史导入 / 备份与清空 / AI 预留说明
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  App.Views.settings = {
    title: '设置',

    mount(root) {
      const info = App.DB.storageInfo();

      root.innerHTML = D.html`
        <div class="page-head">
          <div class="page-title">⚙️ 设置</div>
          <div class="page-sub">维护工作模块和每天的固定任务模板，以及本地数据。</div>
        </div>

        <!-- 工作模块 -->
        <div class="card setting-block">
          <div class="setting-head">
            <div>
              <div class="setting-title">工作模块</div>
              <div class="setting-desc">新增任务时可选择；改名会同步更新历史任务，删除不影响已有记录。</div>
            </div>
          </div>
          <div class="module-badge-row" id="moduleList">
            ${D.raw(App.Store.state.modules.map(m => D.html`
              <span class="module-badge" data-module="${m}">
                <span>${m}</span>
                <button data-module-rename="${m}" title="重命名"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
                <button data-module-del="${m}" title="删除"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
              </span>`).join(''))}
            <button class="chip chip-add" id="btnAddModule">+ 新增模块</button>
          </div>
        </div>

        <!-- 重复任务模板 -->
        <div class="card setting-block">
          <div class="setting-head">
            <div>
              <div class="setting-title">重复任务模板</div>
              <div class="setting-desc">每天打开工作台时按模板自动生成当天任务，不用每天重复录入。停用后不再生成，历史任务不受影响。</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnAddTpl">+ 新建模板</button>
          </div>
          <div class="mini-list">
            ${App.Store.state.templates.length === 0 ? D.raw(D.html`<div class="hint-text" style="padding:6px 2px">还没有模板，点击右上角新建，例如「审核视频 + 检查 Quota」。</div>`)
              : D.raw(App.Store.state.templates
                  .slice().sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map(t => tplRow(t)).join(''))}
          </div>
        </div>

        <!-- 剪辑手 Quota 配置 -->
        <div class="card setting-block">
          <div class="setting-head">
            <div>
              <div class="setting-title">剪辑手 Quota 配置</div>
              <div class="setting-desc">维护每日 Quota 录入人员、目标值和顺序。设置一次后每个工作日自动带入，无需重复输入。</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnAddQuota">+ 添加剪辑手</button>
          </div>
          <div class="mini-list" id="quotaList">
            ${(App.Store.state.quotaTargets || []).length === 0
              ? D.raw(D.html`<div class="hint-text" style="padding:6px 2px">还没有 Quota 剪辑手，点击右上角添加。</div>`)
              : D.raw((App.Store.state.quotaTargets || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(qRow).join(''))}
          </div>
        </div>

        <!-- 历史数据导入 -->
        <div class="card setting-block">
          <div class="setting-title">初始化历史数据</div>
          <div class="setting-desc">支持 CSV（Excel 另存为 CSV UTF-8）和 Markdown 表格，自动映射日期 / 模块 / 事项 / 对接人 / 状态 / 备注列，无需逐条手录。</div>
          <button class="btn" id="btnImportHistory">导入历史记录…</button>
        </div>

        <!-- 备份 -->
        <div class="card setting-block">
          <div class="setting-title">数据备份与恢复</div>
          <div class="setting-desc">
            数据目前仅保存在本浏览器（localStorage，约占 ${info.sizeKB} KB；任务 ${info.tasks} 条、人员 ${info.people} 位、模板 ${info.templates} 个、Quota 剪辑手 ${(App.Store.state.quotaTargets || []).length} 位）。
            清理浏览器缓存前请先导出 JSON 备份。
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="btnExportJson">导出全部数据（JSON）</button>
            <button class="btn" id="btnImportJson">导入备份（JSON）</button>
            <input type="file" id="jsonFile" accept=".json,application/json" style="display:none" />
            <button class="btn btn-danger" id="btnClear">清空全部数据</button>
          </div>
        </div>

        <!-- AI 预留 -->
        <div class="card setting-block">
          <div class="setting-title">AI 能力（第二阶段）</div>
          <div class="setting-desc">
            「快速记录」目前使用本地关键词规则识别，已可处理模块归类、对接人识别、备注拆分。
            代码中预留了 AI API 适配接口（<code>App.NLP.parseWithAI</code>），后续配置 API Key 即可升级为大模型解析，
            并将数据层切换到 Supabase 实现多设备同步。
          </div>
        </div>
      `;

      /* 模块增删改 */
      root.querySelector('#btnAddModule').addEventListener('click', () => renameModule(null));
      root.querySelectorAll('[data-module-rename]').forEach(b =>
        b.addEventListener('click', () => renameModule(b.dataset.moduleRename)));
      root.querySelectorAll('[data-module-del]').forEach(b =>
        b.addEventListener('click', () => removeModule(b.dataset.moduleDel)));

      /* 模板 */
      root.querySelector('#btnAddTpl').addEventListener('click', () => openTplForm(null, root));
      root.querySelectorAll('[data-tpl-edit]').forEach(b =>
        b.addEventListener('click', () => openTplForm(App.Store.state.templates.find(t => t.id === b.dataset.tplEdit), root)));
      root.querySelectorAll('[data-tpl-del]').forEach(b =>
        b.addEventListener('click', async () => {
          const t = App.Store.state.templates.find(x => x.id === b.dataset.tplDel);
          const ok = await App.UI.confirm(`删除模板「${t.title}」？已生成的历史任务不会被删除。`, { danger: true, confirmText: '删除' });
          if (ok) { App.DB.remove('templates', t.id); App.UI.toast('模板已删除'); }
        }));
      root.querySelectorAll('[data-tpl-toggle]').forEach(b =>
        b.addEventListener('click', () => {
          const t = App.Store.state.templates.find(x => x.id === b.dataset.tplToggle);
          App.DB.update('templates', t.id, { active: !t.active });
          App.Templates.ensureFor(D.today());
        }));

      /* Quota 剪辑手配置 */
      root.querySelector('#btnAddQuota').addEventListener('click', () => openQuotaForm(null));
      root.querySelectorAll('[data-q-up]').forEach(b =>
        b.addEventListener('click', () => moveQuota(b.dataset.qUp, -1)));
      root.querySelectorAll('[data-q-down]').forEach(b =>
        b.addEventListener('click', () => moveQuota(b.dataset.qDown, 1)));
      root.querySelectorAll('[data-q-del]').forEach(b =>
        b.addEventListener('click', async () => {
          const qt = (App.Store.state.quotaTargets || []).find(x => x.personId === b.dataset.qDel);
          const p = (App.Store.personMap()[qt.personId] || {}).name || '?';
          const ok = await App.UI.confirm(`从 Quota 列表移除「${p}」？历史 Quota 数据保留，只是不再每日带入。`, { danger: true, confirmText: '移除' });
          if (ok) {
            App.DB.replaceAll('quotaTargets', (App.Store.state.quotaTargets || []).filter(x => x.personId !== qt.personId));
            App.UI.toast('已从 Quota 列表移除');
          }
        }));
      root.querySelectorAll('.q-tpl-input').forEach(inp =>
        inp.addEventListener('change', () => {
          const v = Math.max(0, parseInt(inp.value || '0') || 0);
          inp.value = v;
          const pid = inp.dataset.qTarget;
          const list = (App.Store.state.quotaTargets || []).slice();
          const t = list.find(x => x.personId === pid);
          if (t) {
            App.DB.replaceAll('quotaTargets', list.map(x => x.personId === pid ? Object.assign({}, x, { target: v }) : x));
            App.UI.toast('目标已更新');
          }
        }));

      /* 数据 */
      root.querySelector('#btnImportHistory').addEventListener('click', () => App.Importer.open());
      root.querySelector('#btnExportJson').addEventListener('click', exportJSON);
      root.querySelector('#btnImportJson').addEventListener('click', () => root.querySelector('#jsonFile').click());
      root.querySelector('#jsonFile').addEventListener('change', importJSON);
      root.querySelector('#btnClear').addEventListener('click', clearAll);
    }
  };

  /* ---------------- 模块 ---------------- */
  function renameModule(oldName) {
    const name = prompt(oldName ? '将模块重命名为：' : '新模块名称：', oldName || '');
    if (name === null) return;
    const next = name.trim();
    if (!next) return;
    const modules = App.Store.state.modules;
    if (modules.some(m => m === next)) { App.UI.toast('模块已存在'); return; }

    if (oldName) {
      App.DB.replaceAll('modules', modules.map(m => m === oldName ? next : m));
      // 同步历史任务与模板
      App.Store.state.tasks.filter(t => t.module === oldName).forEach(t => App.DB.update('tasks', t.id, { module: next }));
      App.Store.state.templates.filter(t => t.module === oldName).forEach(t => App.DB.update('templates', t.id, { module: next }));
      App.UI.toast('已重命名并同步历史记录');
    } else {
      App.DB.replaceAll('modules', modules.concat(next));
      App.UI.toast('模块已添加');
    }
  }

  async function removeModule(name) {
    if (App.Store.state.modules.length <= 1) { App.UI.toast('至少保留一个模块'); return; }
    const ok = await App.UI.confirm(`删除模块「${name}」？已有任务会继续显示该模块名，只是新任务无法再选择它。`, {
      danger: true, confirmText: '删除'
    });
    if (!ok) return;
    App.DB.replaceAll('modules', App.Store.state.modules.filter(m => m !== name));
    App.UI.toast('模块已删除');
  }

  /* ---------------- 模板行 ---------------- */
  function tplRow(t) {
    const pm = App.Store.personMap();
    const names = (t.personIds || []).map(id => (pm[id] || {}).name).filter(Boolean).join('、');
    return D.html`
      <div class="mini-row">
        <button class="switch ${t.active ? 'on' : ''}" data-tpl-toggle="${t.id}" title="${t.active ? '点击停用' : '点击启用'}"></button>
        ${App.UI.moduleTag(t.module)}
        <span style="font-weight:550">${t.title}</span>
        <span style="color:var(--text-3);font-size:12px">${D.freqText(t)}</span>
        ${names ? D.raw(D.html`<span class="tag tag-person">${names}</span>`) : ''}
        <div class="spacer"></div>
        <div class="mini-actions">
          <button class="icon-btn" data-tpl-edit="${t.id}" title="编辑"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="icon-btn" data-tpl-del="${t.id}" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
        </div>
      </div>`;
  }

  /* ---------------- 模板表单 ---------------- */
  function openTplForm(tpl, root) {
    const isEdit = !!tpl;
    const state = App.Store.state;
    const data = tpl ? JSON.parse(JSON.stringify(tpl)) : {
      id: D.uid('tpl'),
      title: '', module: state.modules[0] || '其他',
      personIds: [],
      freq: 'weekdays', weekdays: [1, 2, 3, 4, 5],
      active: true,
      order: (state.templates.reduce((m, t) => Math.max(m, t.order || 0), 0) + 10)
    };

    const m = App.UI.modal({
      title: isEdit ? '编辑重复任务' : '新建重复任务',
      body: D.html`
        <div class="field">
          <label class="field-label">任务名称 <span style="color:var(--danger)">*</span></label>
          <input type="text" class="input" id="tplTitle" value="${data.title}" placeholder="例如：审核视频 + 检查 Quota" />
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">工作模块</label>
            <select class="input" id="tplModule">
              ${D.raw(state.modules.map(x => D.html`<option value="${x}" ${data.module === x ? 'selected' : ''}>${x}</option>`).join(''))}
            </select>
          </div>
          <div class="field">
            <label class="field-label">启用状态</label>
            <div><button type="button" class="switch ${data.active ? 'on' : ''}" id="tplActive"></button></div>
          </div>
        </div>
        <div class="field">
          <label class="field-label">重复频率</label>
          <div class="seg" id="tplFreq">
            <button type="button" data-freq="daily" class="${data.freq === 'daily' ? 'on' : ''}">每天</button>
            <button type="button" data-freq="weekdays" class="${data.freq === 'weekdays' ? 'on' : ''}">工作日</button>
            <button type="button" data-freq="weekly" class="${data.freq === 'weekly' ? 'on' : ''}">每周</button>
          </div>
          <div id="weekdayWrap" style="margin-top:8px;${data.freq === 'weekly' ? '' : 'display:none'}">
            <div class="weekday-picker">
              ${D.raw([1, 2, 3, 4, 5, 6, 7].map(n => D.html`
                <button type="button" data-wd="${n}" class="${data.weekdays.indexOf(n) !== -1 ? 'on' : ''}">${['一', '二', '三', '四', '五', '六', '日'][n - 1]}</button>`).join(''))}
            </div>
          </div>
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label">默认对接人（可多选）</label>
          <div class="chip-picker">
            ${D.raw(state.people.map(p => D.html`
              <button type="button" class="chip ${data.personIds.indexOf(p.id) !== -1 ? 'on' : ''}" data-person-id="${p.id}">${p.name}</button>`).join(''))}
          </div>
        </div>`,
      buttons: [
        { label: '取消', onClick: ({ close }) => close() },
        {
          label: isEdit ? '保存' : '创建', variant: 'primary',
          onClick: ({ close, bodyEl }) => {
            data.title = bodyEl.querySelector('#tplTitle').value.trim();
            if (!data.title) { App.UI.toast('请填写任务名称'); return; }
            if (data.freq === 'weekly' && data.weekdays.length === 0) { App.UI.toast('请至少选择一个星期'); return; }
            data.module = bodyEl.querySelector('#tplModule').value;
            if (isEdit) App.DB.update('templates', data.id, data);
            else App.DB.add('templates', data);
            App.Templates.ensureFor(D.today());
            App.UI.toast(isEdit ? '模板已保存' : '模板已创建，今日任务已生成');
            close();
          }
        }
      ]
    });

    m.bodyEl.addEventListener('click', e => {
      const person = e.target.closest('[data-person-id]');
      if (person) {
        const id = person.dataset.personId;
        const i = data.personIds.indexOf(id);
        if (i === -1) data.personIds.push(id); else data.personIds.splice(i, 1);
        person.classList.toggle('on');
        return;
      }
      const freq = e.target.closest('[data-freq]');
      if (freq) {
        data.freq = freq.dataset.freq;
        m.bodyEl.querySelectorAll('#tplFreq button').forEach(b => b.classList.toggle('on', b === freq));
        m.bodyEl.querySelector('#weekdayWrap').style.display = data.freq === 'weekly' ? '' : 'none';
        return;
      }
      const wd = e.target.closest('[data-wd]');
      if (wd) {
        const n = +wd.dataset.wd;
        const i = data.weekdays.indexOf(n);
        if (i === -1) data.weekdays.push(n); else data.weekdays.splice(i, 1);
        wd.classList.toggle('on');
        return;
      }
      if (e.target.closest('#tplActive')) {
        data.active = !data.active;
        m.bodyEl.querySelector('#tplActive').classList.toggle('on', data.active);
      }
    });
  }

  /* ---------------- Quota 剪辑手 ---------------- */
  function qRow(qt) {
    const p = (App.Store.personMap()[qt.personId] || {}).name || '?';
    return D.html`
      <div class="mini-row">
        <span class="q-order">${(App.Store.state.quotaTargets || []).filter(x => (x.order || 0) <= (qt.order || 0)).length}</span>
        <span class="tag tag-person">${p}</span>
        <span class="q-tpl-label">每日目标</span>
        <input type="number" class="input q-tpl-input" data-q-target="${qt.personId}" value="${qt.target}" min="0" step="1" style="width:64px" />
        <div class="spacer"></div>
        <div class="mini-actions">
          <button class="icon-btn" data-q-up="${qt.personId}" title="上移"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg></button>
          <button class="icon-btn" data-q-down="${qt.personId}" title="下移"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
          <button class="icon-btn" data-q-del="${qt.personId}" title="移除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
      </div>`;
  }

  function moveQuota(personId, dir) {
    const list = (App.Store.state.quotaTargets || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const i = list.findIndex(x => x.personId === personId);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    // 交换 order
    const a = list[i], b = list[j];
    const ao = a.order, bo = b.order;
    App.DB.replaceAll('quotaTargets', list.map(x => {
      if (x.personId === a.personId) return Object.assign({}, x, { order: bo });
      if (x.personId === b.personId) return Object.assign({}, x, { order: ao });
      return x;
    }));
  }

  function openQuotaForm() {
    const state = App.Store.state;
    const existing = new Set((state.quotaTargets || []).map(x => x.personId));
    const availablePeople = state.people.filter(p => !existing.has(p.id));

    if (availablePeople.length === 0) {
      // 没有可选人员，直接提示在「人员管理」中新增
      App.UI.toast('暂无可添加的人员。请先在「人员管理」中新增剪辑手，或当前所有人员都已在 Quota 列表中');
      return;
    }

    const sel = { personId: availablePeople[0].id, target: 14 };
    const m = App.UI.modal({
      title: '添加 Quota 剪辑手',
      body: D.html`
        <div class="field">
          <label class="field-label">选择人员</label>
          <select class="input" id="qfPerson">
            ${D.raw(availablePeople.map(p => D.html`<option value="${p.id}">${p.name}</option>`).join(''))}
          </select>
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label">每日目标值</label>
          <input type="number" class="input" id="qfTarget" value="${sel.target}" min="0" step="1" style="width:96px" />
        </div>`,
      buttons: [
        { label: '取消', onClick: ({ close }) => close() },
        {
          label: '添加', variant: 'primary',
          onClick: ({ close, bodyEl }) => {
            sel.personId = bodyEl.querySelector('#qfPerson').value;
            sel.target = Math.max(0, parseInt(bodyEl.querySelector('#qfTarget').value || '0') || 0);
            const list = (App.Store.state.quotaTargets || []).slice();
            const maxOrder = list.reduce((m, x) => Math.max(m, x.order || 0), 0);
            list.push({ personId: sel.personId, target: sel.target, order: maxOrder + 10 });
            App.DB.replaceAll('quotaTargets', list);
            App.UI.toast('已添加剪辑手');
            close();
          }
        }
      ]
    });
  }

  /* ---------------- 备份 / 清空 ---------------- */
  function exportJSON() {
    const data = App.DB.exportAll();
    D.download('工作记录备份_' + D.today() + '.json', JSON.stringify(data, null, 2), 'application/json');
    App.UI.toast('备份文件已下载');
  }

  function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.tasks)) throw new Error('格式不正确');
        const mode = await new Promise(resolve => {
          const m = App.UI.modal({
            title: '选择导入方式',
            body: D.html`
              <div class="radio-line" style="margin-bottom:10px">
                <label><input type="radio" name="jsonMode" value="merge" checked /> <strong>合并</strong>（保留现有数据，按 ID 去重，推荐）</label>
              </div>
              <div class="radio-line">
                <label><input type="radio" name="jsonMode" value="replace" /> <strong>覆盖</strong>（清空现有数据后完全替换，不可撤销）</label>
              </div>`,
            buttons: [
              { label: '取消', onClick: ({ close }) => { close(); resolve(null); } },
              { label: '开始导入', variant: 'primary', onClick: ({ close, bodyEl }) => {
                close(); resolve(bodyEl.querySelector('input[name=jsonMode]:checked').value);
              } }
            ]
          });
        });
        if (!mode) return;
        App.DB.importAll(data, mode);
        App.Templates.ensureFor(D.today());
        App.UI.toast(`导入完成（${mode === 'merge' ? '合并' : '覆盖'}）：任务 ${data.tasks.length} 条`);
      } catch (err) {
        App.UI.toast('文件解析失败：' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  }

  async function clearAll() {
    const ok1 = await App.UI.confirm('将清空本浏览器中的全部任务、人员、模板数据（模块恢复为默认）。建议先导出 JSON 备份。确定继续？', {
      danger: true, confirmText: '我已备份，继续'
    });
    if (!ok1) return;
    const ok2 = await App.UI.confirm('最后确认：真的要清空全部数据吗？此操作不可撤销。', { danger: true, confirmText: '确认清空' });
    if (!ok2) return;
    // 恢复出厂状态：默认 8 模块 / 9 位预设人员 / 4 个固定模板，并生成今日固定任务
    App.DB.resetAll();
    App.Templates.ensureFor(D.today());
    App.UI.toast('已恢复到初始状态');
  }
})();
