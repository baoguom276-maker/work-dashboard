/* ============================================================
 * views/people.js — 人员管理（对接人 / 剪辑手）
 * ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  App.Views.people = {
    title: '人员管理',

    mount(root) {
      const people = App.Store.state.people.slice();
      const tasks = App.Store.state.tasks;

      root.innerHTML = D.html`
        <div class="page-head">
          <div class="page-head-row">
            <div>
              <div class="page-title">👥 人员管理</div>
              <div class="page-sub">维护常用对接人 / 剪辑手，创建任务时可直接点选，无需重复输入名字。</div>
            </div>
            <div class="head-actions">
              <button class="btn btn-primary" id="btnAddPerson">+ 新增人员</button>
            </div>
          </div>
        </div>

        ${people.length === 0
          ? App.UI.emptyState('还没有人员', '点击右上角「新增人员」开始维护', '👥')
          : D.raw(D.html`<div class="grid-cards">
              ${people.map(p => {
                const count = tasks.filter(t => (t.personIds || []).indexOf(p.id) !== -1).length;
                return D.raw(D.html`
                <div class="card person-card">
                  <div class="card-actions">
                    <button class="icon-btn" data-person-edit="${p.id}" title="编辑"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
                    <button class="icon-btn" data-person-del="${p.id}" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
                  </div>
                  <div class="person-name">${p.name}</div>
                  <div class="person-meta">
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:5px">
                      ${D.raw(D.PLATFORMS.map(pl => D.html`<span class="tag ${(p.platforms || []).indexOf(pl) !== -1 ? 'tag-platform' : ''}" style="${(p.platforms || []).indexOf(pl) === -1 ? 'opacity:.35' : ''}">${pl}</span>`).join(''))}
                    </div>
                    ${D.accountLinksHTML(p.account) || ''}
                    ${p.notes ? D.raw(D.html`<div class="person-notes">${p.notes}</div>`) : ''}
                    <button type="button" class="btn btn-ghost btn-sm person-open-btn" data-person-view="${p.id}">
                      查看关联任务 ${count} 条 →
                    </button>
                  </div>
                </div>`);
              })}
            </div>`)}
      `;

      root.querySelector('#btnAddPerson').addEventListener('click', () => openForm(null, root));
      root.querySelectorAll('[data-person-edit]').forEach(btn => {
        btn.addEventListener('click', () => openForm(App.Store.state.people.find(p => p.id === btn.dataset.personEdit), root));
      });
      root.querySelectorAll('[data-person-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const p = App.Store.state.people.find(x => x.id === btn.dataset.personDel);
          const ok = await App.UI.confirm(
            `确定删除人员「${p.name}」吗？历史任务中的关联会保留（显示为已删除人员），不会删除任务本身。`,
            { danger: true, confirmText: '删除' }
          );
          if (ok) { App.DB.remove('people', p.id); App.UI.toast('已删除'); }
        });
      });
    }
  };

  function openForm(person, root) {
    const isEdit = !!person;
    const data = person ? JSON.parse(JSON.stringify(person)) :
      { id: D.uid('p'), name: '', platforms: [], account: { ig: '', yt: '', tk: '' }, notes: '' };
    // 兜底：旧数据 account 可能是字符串
    data.account = D.normalizeAccount(data.account, data.platforms || []);

    const m = App.UI.modal({
      title: isEdit ? '编辑人员' : '新增人员',
      body: D.html`
        <div class="field">
          <label class="field-label">姓名 <span style="color:var(--danger)">*</span></label>
          <input type="text" class="input" id="pfName" value="${data.name}" placeholder="例如：Nana" />
        </div>
        <div class="field">
          <label class="field-label">负责平台</label>
          <div class="chip-picker">
            ${D.raw(D.PLATFORMS.map(pl => D.html`
              <button type="button" class="chip ${data.platforms.indexOf(pl) !== -1 ? 'on' : ''}" data-pl="${pl}">${pl}</button>`).join(''))}
          </div>
        </div>
        <div class="field">
          <label class="field-label">账号（可选，点击即跳转主页）</label>
          <div class="acc-input-row">
            ${D.raw(D.PLATFORMS.map(pl => D.html`
              <div class="acc-input-item">
                <span class="acc-pl acc-pl-${pl.toLowerCase()}">${pl}</span>
                <input type="text" class="input" id="pfAcc_${pl}" value="${(data.account && data.account[pl.toLowerCase()]) || ''}" placeholder="${pl} 用户名" />
              </div>`).join(''))}
          </div>
          <div class="hint-text" style="margin-top:4px">填用户名即可，自动生成主页链接（IG/YT/TK 各一）</div>
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label">备注（可选）</label>
          <textarea class="input" id="pfNotes">${data.notes || ''}</textarea>
        </div>`,
      buttons: [
        { label: '取消', onClick: ({ close }) => close() },
        {
          label: isEdit ? '保存' : '添加', variant: 'primary',
          onClick: ({ close, bodyEl }) => {
            data.name = bodyEl.querySelector('#pfName').value.trim();
            if (!data.name) { App.UI.toast('请填写姓名'); return; }
            const dup = App.Store.state.people.find(p => p.name.toLowerCase() === data.name.toLowerCase() && p.id !== data.id);
            if (dup) { App.UI.toast('已存在同名人员'); return; }
            data.account = {
              ig: bodyEl.querySelector('#pfAcc_IG').value.trim(),
              yt: bodyEl.querySelector('#pfAcc_YT').value.trim(),
              tk: bodyEl.querySelector('#pfAcc_TK').value.trim()
            };
            data.notes = bodyEl.querySelector('#pfNotes').value.trim();
            if (isEdit) App.DB.update('people', data.id, data);
            else App.DB.add('people', data);
            App.UI.toast(isEdit ? '已保存' : '已添加');
            close();
          }
        }
      ]
    });

    m.bodyEl.addEventListener('click', e => {
      const chip = e.target.closest('[data-pl]');
      if (!chip) return;
      const pl = chip.dataset.pl;
      const i = data.platforms.indexOf(pl);
      if (i === -1) data.platforms.push(pl); else data.platforms.splice(i, 1);
      chip.classList.toggle('on');
    });
  }

  // 供人员档案 Drawer 复用：传人员 id 或人员对象
  App.People = App.People || {};
  App.People.openForm = function (idOrPerson) {
    const person = typeof idOrPerson === 'string'
      ? App.DB.find('people', idOrPerson)
      : idOrPerson;
    if (idOrPerson && !person) { App.UI.toast('人员不存在'); return; }
    openForm(person, null);
  };
})();
