/* ============================================================
 * task-form.js — 任务新增 / 编辑弹窗；自然语言快速记录入口
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};

  function personChipsHTML(people, selected) {
    return people.map(p => D.html`
      <button type="button" class="chip ${selected.indexOf(p.id) !== -1 ? 'on' : ''}" data-person-id="${p.id}">${p.name}</button>
    `).join('');
  }

  function bodyHTML(data, modules, people, nlpTags) {
    const tags = (nlpTags && nlpTags.length)
      ? D.raw(D.html`<div class="nlp-banner">⚡ 已自动识别：${D.raw(nlpTags.map(t => D.html`· ${t} `).join(' '))}<br>确认无误直接保存，也可以手动修改。</div>`)
      : '';
    return D.html`
      ${tags}
      <div class="field">
        <label class="field-label">工作事项 <span style="color:var(--danger)">*</span></label>
        <input type="text" class="input" id="fTitle" placeholder="例如：给 Ivan 新建 2 个 IG" value="${data.title}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">工作模块</label>
          <select class="input" id="fModule">
            ${D.raw(modules.map(m => D.html`<option value="${m}" ${data.module === m ? 'selected' : ''}>${m}</option>`).join(''))}
          </select>
        </div>
        <div class="field">
          <label class="field-label">状态</label>
          <select class="input" id="fStatus">
            ${D.raw(D.STATUSES.map(s => D.html`<option value="${s.key}" ${data.status === s.key ? 'selected' : ''}>${s.label}</option>`).join(''))}
          </select>
        </div>
        <div class="field">
          <label class="field-label">日期</label>
          <input type="date" class="input" id="fDate" value="${data.date}" />
        </div>
      </div>
      <div class="field">
        <label class="field-label">对接人 / 剪辑手（可多选）</label>
        <div class="chip-picker" id="fPeople">
          ${D.raw(personChipsHTML(people, data.personIds))}
          <button type="button" class="chip chip-add" id="fAddPerson" title="新增人员">+ 新增</button>
        </div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label class="field-label">结果 / 备注</label>
        <textarea class="input" id="fResult" placeholder="处理结果、备注说明；需要明天继续跟进的内容也可以写在这里">${data.result}</textarea>
      </div>`;
  }

  /**
   * 打开任务表单
   * @param {object|null} task 编辑传任务对象，新增传 null
   * @param {object} opts {date, nlp}
   */
  function openTaskForm(task, opts) {
    opts = opts || {};
    const state = App.Store.state;
    const isEdit = !!task;
    const data = task ? JSON.parse(JSON.stringify(task)) : {
      id: null,
      date: opts.date || D.today(),
      module: (opts.nlp && opts.nlp.module) || state.modules[0] || '其他',
      title: (opts.nlp && opts.nlp.title) || '',
      personIds: (opts.nlp && opts.nlp.personIds.slice()) || [],
      status: (opts.nlp && opts.nlp.status) || 'pending',
      result: (opts.nlp && opts.nlp.result) || '',
      templateId: null
    };

    let people = state.people.slice();

    const footer = [
      ...(isEdit ? [{
        label: '删除', variant: 'danger',
        onClick: async ({ close }) => {
          const ok = await App.UI.confirm(`确定删除任务「${data.title}」吗？删除后可在历史中无法找回。`, {
            danger: true, confirmText: '删除'
          });
          if (ok) { App.Tasks.remove(data.id); close(); }
        }
      }, { spacer: true }] : []),
      { label: '取消', onClick: ({ close }) => close() },
      {
        label: isEdit ? '保存修改' : '保存任务', variant: 'primary',
        onClick: ({ close, bodyEl }) => {
          data.title = bodyEl.querySelector('#fTitle').value.trim();
          if (!data.title) { App.UI.toast('请填写工作事项'); bodyEl.querySelector('#fTitle').focus(); return; }
          data.module = bodyEl.querySelector('#fModule').value;
          data.status = bodyEl.querySelector('#fStatus').value;
          data.date = bodyEl.querySelector('#fDate').value || D.today();
          data.result = bodyEl.querySelector('#fResult').value.trim();
          App.Tasks.save(data);
          App.UI.toast(isEdit ? '任务已更新' : '任务已添加');
          if (opts.onSave) opts.onSave(data);
          close();
        }
      }
    ];

    const m = App.UI.modal({
      title: isEdit ? '编辑任务' : (opts.nlp ? '确认快速记录' : '新增任务'),
      body: bodyHTML(data, state.modules, people, opts.nlp && opts.nlp.tags),
      buttons: footer
    });

    /* 人员多选 */
    m.bodyEl.addEventListener('click', e => {
      const chip = e.target.closest('[data-person-id]');
      if (chip) {
        const id = chip.dataset.personId;
        const idx = data.personIds.indexOf(id);
        if (idx === -1) data.personIds.push(id); else data.personIds.splice(idx, 1);
        chip.classList.toggle('on');
        return;
      }
      if (e.target.closest('#fAddPerson')) {
        const name = prompt('新增人员姓名：');
        if (!name || !name.trim()) return;
        if (people.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
          App.UI.toast('该人员已存在');
          return;
        }
        const p = { id: D.uid('p'), name: name.trim(), platforms: [], account: { ig: '', yt: '', tk: '' }, notes: '' };
        App.DB.add('people', p);
        people = App.Store.state.people.slice();
        data.personIds.push(p.id);
        m.bodyEl.querySelector('#fPeople').innerHTML = personChipsHTML(people, data.personIds) +
          '<button type="button" class="chip chip-add" id="fAddPerson" title="新增人员">+ 新增</button>';
      }
    });
  }

  /** 快速记录：规则解析 → 表单确认 */
  function quickRecord(text, date) {
    const state = App.Store.state;
    const parsed = App.NLP.parse(text, state.people, state.modules);
    openTaskForm(null, { date: date || D.today(), nlp: parsed });
  }

  App.TaskForm = { open: openTaskForm, quickRecord };
})();
