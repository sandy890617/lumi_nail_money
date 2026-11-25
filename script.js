// ==========================================
// 1. 常數與美甲工作室預設分類設定
// ==========================================
const STORAGE_KEY = 'nail_studio_ops_crm_inv_v3';
const GAS_URL_KEY = 'nail_studio_gas_webhook_url';
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyxYkXtr4V_EJFvEL5-3mHXwvydnD_zzA84Bi9wYsgmTAXVZhzdavLJhkyO9jRsmmSfww/exec';

const GEL_CATEGORIES = ['色膠', '貓眼膠', '功能膠（底膠/建構/上層）', '亮片膠/點綴膠'];

const CATEGORIES = {
  income: [
    '單色凝膠',
    '貓眼',
    '漸層',
    '法式',
    '不挑款設計',
    '造型設計款',
    '延甲 / 矯正',
    '卸甲續作 / 純卸甲',
    '穿戴甲訂製',
    '手模',
    '其他服務收入'
  ],
  expense: [
    '色膠 / 功能膠進貨',
    '飾品 / 貼紙 / 粉類',
    '耗材（磨棒/棉片/磨頭）',
    '工具（磨甲機/凝膠燈/筆）',
    '工作室設備/擺設',
    '工作室租金 / 水電網路',
    '進修課程 / 檢定報名',
    '包材 / 拍攝道具 / 行銷',
    '其他營運雜支'
  ]
};

function getSampleData() {
  return {
    clients: [],
    inventory: [],
    entries: []
  };
}

// ==========================================
// 2. 狀態管理與自動雲端同步排程
// ==========================================
let appData = {
  entries: [],
  clients: [],
  inventory: []
};
let selectedClientId = null;
let autoSyncTimer = null;
let selectedVisitGelIds = new Set();

let charts = {
  trend: null,
  incomeCat: null,
  expenseCat: null
};

function getGasUrl() {
  const savedUrl = localStorage.getItem(GAS_URL_KEY);
  if (savedUrl && savedUrl !== DEFAULT_GAS_URL && savedUrl.includes('AKfycbznX7zI35ImIDI8c7LcphI8XNgJgpv5FBbE2yPH6I_LcpNawRh-SB0V3b-V-7GHes0cUA')) {
    localStorage.removeItem(GAS_URL_KEY);
    return DEFAULT_GAS_URL;
  }
  return savedUrl || DEFAULT_GAS_URL;
}

function isGelItem(category) {
  return category.includes('膠') || GEL_CATEGORIES.includes(category);
}

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  loadData();
  initNavigation();
  initLedgerForm();
  initCRM();
  initInventory();
  initCalculator();
  initExportImport();
  initCloudSync();
  refreshAllViews();

  await pullFromCloud(true);
});

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      appData.entries = Array.isArray(parsed.entries)
        ? parsed.entries.map(e => ({ ...e, date: formatDateStr(e.date) }))
        : [];
      appData.clients = Array.isArray(parsed.clients) ? parsed.clients : [];
      appData.inventory = Array.isArray(parsed.inventory) ? parsed.inventory : [];
    } catch (e) {
      appData = getSampleData();
    }
  } else {
    appData = getSampleData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  }
}

function saveData(skipCloudSync = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));

  if (!skipCloudSync && getGasUrl()) {
    const statusText = document.getElementById('syncStatusText');
    if (statusText) {
      statusText.textContent = '偵測到資料變更，準備自動同步至雲端...';
    }
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
      pushToCloud(true);
    }, 1200);
  }
}

function refreshAllViews() {
  populateMonthFilter();
  populateClientDropdowns();
  updateDashboard();
  renderLedgerTable();
  renderClientList();
  renderInventoryTable();
  renderVisitGelSelector();
  if (selectedClientId) {
    renderClientDetail(selectedClientId);
  }
}

function getClientNameById(clientId) {
  if (!clientId) return '';
  const client = appData.clients.find(c => c.id === clientId);
  return client ? client.name : '';
}

// ==========================================
// 3. 分頁切換導覽
// ==========================================
function initNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

window.switchTab = function (tabName) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));

  if (tabName === 'dashboard') updateDashboard();
};

window.jumpToClient = function (clientId) {
  switchTab('clients');
  selectClient(clientId);
};

// ==========================================
// 4. 日常記帳功能
// ==========================================
function initLedgerForm() {
  const entryDate = document.getElementById('entryDate');
  const entryType = document.getElementById('entryType');
  const entryClientGroup = document.getElementById('entryClientGroup');
  const entryRemovalGroup = document.getElementById('entryRemovalGroup');
  const syncExpenseInvBox = document.getElementById('syncExpenseInvBox');
  const syncExpenseToInvCheck = document.getElementById('syncExpenseToInvCheck');
  const syncExpenseInvFields = document.getElementById('syncExpenseInvFields');
  const typeBtns = document.querySelectorAll('.type-btn');
  const ledgerForm = document.getElementById('ledgerForm');
  const ledgerTypeFilter = document.getElementById('ledgerTypeFilter');
  const resetDemoBtn = document.getElementById('resetDemoBtn');

  let selectedRemovalName = 'none';

  function resetLedgerPills() {
    selectedRemovalName = 'none';
    document.querySelectorAll('#ledgerRemovalPills .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.name === 'none');
    });
  }

  entryDate.value = new Date().toISOString().split('T')[0];
  updateCategoryDropdown('income', 'entryCategory');

  document.querySelectorAll('#ledgerRemovalPills .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ledgerRemovalPills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRemovalName = btn.dataset.name;
    });
  });

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const selectedType = btn.dataset.type;
      entryType.value = selectedType;
      updateCategoryDropdown(selectedType, 'entryCategory');

      if (selectedType === 'income') {
        entryClientGroup.classList.remove('hidden');
        if (entryRemovalGroup) entryRemovalGroup.classList.remove('hidden');
        syncExpenseInvBox.classList.add('hidden');
        syncExpenseToInvCheck.checked = false;
        syncExpenseInvFields.classList.add('hidden');
        resetLedgerPills();
      } else {
        entryClientGroup.classList.add('hidden');
        if (entryRemovalGroup) entryRemovalGroup.classList.add('hidden');
        document.getElementById('entryClient').value = '';
        resetLedgerPills();
        syncExpenseInvBox.classList.remove('hidden');
      }
    });
  });

  syncExpenseToInvCheck.addEventListener('change', () => {
    syncExpenseInvFields.classList.toggle('hidden', !syncExpenseToInvCheck.checked);
  });

  ledgerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = entryType.value;
    const category = document.getElementById('entryCategory').value;
    const amount = Number(document.getElementById('entryAmount').value);
    let note = document.getElementById('entryNote').value.trim();

    if (type === 'income' && selectedRemovalName !== 'none') {
      const remTag = `[${selectedRemovalName}]`;
      note = note ? `${remTag} ${note}` : remTag;
    }

    const newEntry = {
      id: Date.now().toString(),
      date: document.getElementById('entryDate').value,
      type: type,
      category: category,
      amount: amount,
      clientId: type === 'income' ? document.getElementById('entryClient').value : '',
      note: note
    };

    appData.entries.push(newEntry);

    if (type === 'expense' && syncExpenseToInvCheck.checked) {
      const brand = document.getElementById('quickInvBrand').value.trim() || '工作室採購';
      const code = document.getElementById('quickInvCode').value.trim() || '-';
      const invName = document.getElementById('quickInvName').value.trim() || note || category;
      const qty = Math.max(1, Number(document.getElementById('quickInvQty').value) || 1);
      const unit = document.getElementById('quickInvUnit').value;
      const unitPrice = Math.round(amount / qty);

      let mappedInvCat = '拋棄式耗材';
      if (category.includes('色膠')) mappedInvCat = '色膠';
      else if (category.includes('飾品')) mappedInvCat = '飾品 / 貼紙 / 粉類';
      else if (category.includes('工具') || category.includes('設備') || category.includes('儀器')) mappedInvCat = '工具 / 磨頭 / 設備';

      const existing = appData.inventory.find(i =>
        i.brand.toLowerCase() === brand.toLowerCase() &&
        i.code.toLowerCase() === code.toLowerCase() &&
        i.name.toLowerCase() === invName.toLowerCase()
      );

      if (existing) {
        existing.stock += qty;
        if (unitPrice > 0) existing.unitPrice = unitPrice;
      } else {
        appData.inventory.unshift({
          id: 'inv_' + Date.now(),
          brand: brand,
          code: code,
          colorHex: '#D5B89E',
          name: invName,
          category: mappedInvCat,
          unit: unit,
          stock: qty,
          remainingPct: isGelItem(mappedInvCat) ? 100 : 0,
          lowThreshold: 1,
          unitPrice: unitPrice
        });
      }

      document.getElementById('quickInvBrand').value = '';
      document.getElementById('quickInvCode').value = '';
      document.getElementById('quickInvName').value = '';
      document.getElementById('quickInvQty').value = '1';
      syncExpenseToInvCheck.checked = false;
      syncExpenseInvFields.classList.add('hidden');
    }

    saveData();

    document.getElementById('entryAmount').value = '';
    document.getElementById('entryNote').value = '';
    resetLedgerPills();
    refreshAllViews();
  });

  ledgerTypeFilter.addEventListener('change', renderLedgerTable);
  resetDemoBtn.addEventListener('click', () => {
    if (confirm('確定要清空重置所有資料嗎？目前的收支、顧客與庫存紀錄將會被清除並同步至雲端。')) {
      appData = getSampleData();
      selectedClientId = null;
      selectedVisitGelIds.clear();
      saveData();
      refreshAllViews();
      document.getElementById('noClientSelected').classList.remove('hidden');
      document.getElementById('clientDetailContent').classList.add('hidden');
    }
  });
}

function updateCategoryDropdown(type, selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = CATEGORIES[type]
    .map(cat => `<option value="${cat}">${cat}</option>`)
    .join('');
}

function populateClientDropdowns() {
  const select = document.getElementById('entryClient');
  const currentVal = select.value;
  select.innerHTML = `<option value="">-- 不指定客人（散客） --</option>` +
    appData.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  if (appData.clients.some(c => c.id === currentVal)) {
    select.value = currentVal;
  }
}

function renderLedgerTable() {
  const tbody = document.getElementById('ledgerTableBody');
  const emptyMsg = document.getElementById('emptyLedgerMsg');
  const filterType = document.getElementById('ledgerTypeFilter').value;

  const sorted = [...appData.entries]
    .filter(item => filterType === 'all' || item.type === filterType)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  tbody.innerHTML = sorted.map(item => {
    const isIncome = item.type === 'income';
    const clientName = getClientNameById(item.clientId);
    const clientBadge = clientName
      ? `<span class="tag tag-client" onclick="jumpToClient('${item.clientId}')" title="點擊查看顧客檔案">${escapeHtml(clientName)}</span>`
      : '-';

    return `
      <tr>
        <td>${item.date}</td>
        <td><span class="tag ${isIncome ? 'tag-income' : 'tag-expense'}">${isIncome ? '收入' : '支出'}</span></td>
        <td>${escapeHtml(item.category)}</td>
        <td>${clientBadge}</td>
        <td>${escapeHtml(item.note || '-')}</td>
        <td class="text-right ${isIncome ? 'amount-income' : 'amount-expense'}">
          ${isIncome ? '+' : '-'}$${item.amount.toLocaleString()}
        </td>
        <td class="text-center">
          <button class="delete-btn" onclick="deleteEntry('${item.id}')" title="刪除此筆紀錄">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteEntry = function (id) {
  if (confirm('確定要刪除這筆紀錄嗎？')) {
    const editInput = document.getElementById('visitEditId');
    if (editInput && editInput.value === id) {
      resetVisitFormMode();
    }
    appData.entries = appData.entries.filter(item => item.id !== id);
    saveData();
    refreshAllViews();
  }
};

// ==========================================
// 5. 顧客管理 CRM 功能
// ==========================================
function renderVisitGelSelector() {
  const tagsContainer = document.getElementById('selectedGelTags');
  const dropdown = document.getElementById('visitGelDropdown');
  const searchInput = document.getElementById('visitGelSearch');
  if (!tagsContainer || !dropdown || !searchInput) return;

  const gelItems = appData.inventory.filter(item => isGelItem(item.category));

  tagsContainer.innerHTML = Array.from(selectedVisitGelIds).map(id => {
    const item = gelItems.find(g => g.id === id);
    if (!item) return '';
    return `
      <span class="selected-gel-pill">
        <span class="gel-chip-dot" style="background-color: ${escapeHtml(item.colorHex || '#D5B89E')}; margin-right: 0;"></span>
        ${escapeHtml(item.brand)} ${escapeHtml(item.code)}
        <button type="button" onclick="removeVisitGel('${item.id}')" title="移除">✕</button>
      </span>
    `;
  }).join('');

  const rawKeyword = searchInput.value.trim().toLowerCase();
  const isFocused = document.activeElement === searchInput;

  if (!rawKeyword && !isFocused) {
    dropdown.classList.add('hidden');
    return;
  }

  let matched = [];
  if (rawKeyword) {
    const terms = rawKeyword.split(/\s+/);
    matched = gelItems.filter(item => {
      if (selectedVisitGelIds.has(item.id)) return false;
      const haystack = `${item.brand} ${item.code} ${item.name} ${item.category}`.toLowerCase();
      return terms.every(t => haystack.includes(t));
    }).slice(0, 15);
  } else {
    matched = gelItems.filter(item =>
      !selectedVisitGelIds.has(item.id) &&
      item.category.includes('功能膠')
    ).slice(0, 10);
  }

  if (matched.length === 0) {
    dropdown.classList.remove('hidden');
    dropdown.innerHTML = rawKeyword
      ? `<div style="font-size: 12px; color: var(--text-secondary); padding: 4px 8px;">找不到符合「${escapeHtml(rawKeyword)}」的未選色膠</div>`
      : `<div style="font-size: 12px; color: var(--text-secondary); padding: 4px 8px;">請直接輸入品牌或色號搜尋（共 ${gelItems.length} 罐）</div>`;
    return;
  }

  dropdown.classList.remove('hidden');
  dropdown.innerHTML = matched.map(item => `
    <div class="gel-result-row" onmousedown="addVisitGel('${item.id}')">
      <div>
        <span class="gel-chip-dot" style="background-color: ${escapeHtml(item.colorHex || '#D5B89E')};"></span>
        <strong>${escapeHtml(item.brand)} ${escapeHtml(item.code)}</strong>
        <span style="color: var(--text-secondary); font-size: 12px; margin-left: 4px;">${escapeHtml(item.name)}</span>
      </div>
      <span style="font-size: 12px; color: var(--accent-hover);">餘 ${item.remainingPct || 0}% ＋</span>
    </div>
  `).join('');
}

window.addVisitGel = function (gelId) {
  selectedVisitGelIds.add(gelId);
  const searchInput = document.getElementById('visitGelSearch');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  renderVisitGelSelector();
};

window.removeVisitGel = function (gelId) {
  selectedVisitGelIds.delete(gelId);
  renderVisitGelSelector();
};

function deductGelInventoryPct(gelIds, pctToDeduct = 2) {
  const usedLabels = [];
  gelIds.forEach(id => {
    const item = appData.inventory.find(i => i.id === id);
    if (!item) return;

    usedLabels.push(`${item.brand} ${item.code}`);

    const currentPct = Number(item.remainingPct) || 0;
    if (currentPct > pctToDeduct) {
      item.remainingPct = currentPct - pctToDeduct;
    } else if (currentPct > 0) {
      if (item.stock > 0) {
        item.stock -= 1;
        item.remainingPct = 100 - (pctToDeduct - currentPct);
      } else {
        item.remainingPct = 0;
      }
    } else if (item.stock > 0) {
      item.stock -= 1;
      item.remainingPct = 100 - pctToDeduct;
    }
  });
  return usedLabels;
}

window.editVisitRecord = function (entryId) {
  const entry = appData.entries.find(e => e.id === entryId);
  if (!entry) return;

  const editInput = document.getElementById('visitEditId');
  if (editInput) editInput.value = entry.id;

  document.getElementById('visitDate').value = formatDateStr(entry.date);
  document.getElementById('visitCategory').value = entry.category;
  document.getElementById('visitAmount').value = entry.amount;

  let noteText = entry.note || '';
  let matchedRemoval = 'none';
  const remMatch = noteText.match(/^\[(本店卸甲|他店卸甲|本家卸甲續作|他家卸甲續作)\]\s*/);
  if (remMatch) {
    matchedRemoval = remMatch[1];
    noteText = noteText.replace(remMatch[0], '');
  }
  noteText = noteText.replace(/（建議\s*\d{4}-\d{2}-\d{2}\s*回補）$/, '').trim();
  document.getElementById('visitFormula').value = noteText;

  document.querySelectorAll('#visitRemovalPills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.name === matchedRemoval);
  });

  selectedVisitGelIds.clear();
  const visitGelSearch = document.getElementById('visitGelSearch');
  if (visitGelSearch) visitGelSearch.value = '';
  renderVisitGelSelector();

  const previewWrap = document.getElementById('visitPhotoPreviewWrap');
  const previewImg = document.getElementById('visitPhotoPreview');
  const visitPhotoInput = document.getElementById('visitPhotoInput');
  if (visitPhotoInput) visitPhotoInput.value = '';

  if (entry.photoUrl && previewWrap && previewImg) {
    previewImg.src = formatDriveImageUrl(entry.photoUrl);
    previewImg.dataset.existingUrl = entry.photoUrl;
    previewWrap.classList.remove('hidden');
  } else if (previewWrap && previewImg) {
    previewImg.src = '';
    delete previewImg.dataset.existingUrl;
    previewWrap.classList.add('hidden');
  }

  const submitBtn = document.getElementById('visitSubmitBtn') || document.querySelector('#visitForm button[type="submit"]');
  if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check"></i> 儲存修改';
  const cancelBtn = document.getElementById('cancelEditVisitBtn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  lucide.createIcons();
  document.getElementById('visitForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function resetVisitFormMode() {
  const editInput = document.getElementById('visitEditId');
  if (editInput) editInput.value = '';

  document.getElementById('visitDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('visitAmount').value = '';
  document.getElementById('visitFormula').value = '';
  const nextWeeksEl = document.getElementById('visitNextWeeks');
  if (nextWeeksEl) nextWeeksEl.value = '4';

  document.querySelectorAll('#visitRemovalPills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.name === 'none');
  });

  selectedVisitGelIds.clear();
  const visitGelSearch = document.getElementById('visitGelSearch');
  if (visitGelSearch) visitGelSearch.value = '';
  renderVisitGelSelector();

  const visitPhotoInput = document.getElementById('visitPhotoInput');
  const visitPhotoPreview = document.getElementById('visitPhotoPreview');
  const visitPhotoPreviewWrap = document.getElementById('visitPhotoPreviewWrap');
  if (visitPhotoInput) visitPhotoInput.value = '';
  if (visitPhotoPreview) {
    visitPhotoPreview.src = '';
    delete visitPhotoPreview.dataset.existingUrl;
  }
  if (visitPhotoPreviewWrap) visitPhotoPreviewWrap.classList.add('hidden');

  const submitBtn = document.getElementById('visitSubmitBtn') || document.querySelector('#visitForm button[type="submit"]');
  if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check-circle"></i> 儲存來店紀錄';
  const cancelBtn = document.getElementById('cancelEditVisitBtn');
  if (cancelBtn) cancelBtn.classList.add('hidden');
  lucide.createIcons();
}

function initCRM() {
  const clientForm = document.getElementById('clientForm');
  const clientSearchInput = document.getElementById('clientSearchInput');
  const visitForm = document.getElementById('visitForm');
  const saveClientNoteBtn = document.getElementById('saveClientNoteBtn');
  const deleteClientBtn = document.getElementById('deleteClientBtn');
  const cancelEditVisitBtn = document.getElementById('cancelEditVisitBtn');

  document.getElementById('visitDate').value = new Date().toISOString().split('T')[0];
  updateCategoryDropdown('income', 'visitCategory');

  const editClientInfoBtn = document.getElementById('editClientInfoBtn');
  const saveClientInfoBtn = document.getElementById('saveClientInfoBtn');
  const cancelEditClientInfoBtn = document.getElementById('cancelEditClientInfoBtn');

  function toggleClientInfoEditMode(isEditing) {
    const viewMode = document.getElementById('clientInfoViewMode');
    const editMode = document.getElementById('clientInfoEditMode');
    const actions = document.getElementById('clientHeaderActions');
    if (!viewMode || !editMode || !actions) return;

    viewMode.classList.toggle('hidden', isEditing);
    actions.classList.toggle('hidden', isEditing);
    editMode.classList.toggle('hidden', !isEditing);
  }

  if (editClientInfoBtn) {
    editClientInfoBtn.addEventListener('click', () => {
      if (!selectedClientId) return;
      const client = appData.clients.find(c => c.id === selectedClientId);
      if (!client) return;

      document.getElementById('editClientNameInput').value = client.name || '';
      document.getElementById('editClientSocialInput').value = client.social || '';
      toggleClientInfoEditMode(true);
      document.getElementById('editClientNameInput').focus();
    });
  }

  if (cancelEditClientInfoBtn) {
    cancelEditClientInfoBtn.addEventListener('click', () => {
      toggleClientInfoEditMode(false);
    });
  }

  if (saveClientInfoBtn) {
    saveClientInfoBtn.addEventListener('click', () => {
      if (!selectedClientId) return;
      const newName = document.getElementById('editClientNameInput').value.trim();
      const newSocial = document.getElementById('editClientSocialInput').value.trim();
      if (!newName) {
        alert('客人姓名 / 暱稱不能為空白！');
        return;
      }

      const client = appData.clients.find(c => c.id === selectedClientId);
      if (client) {
        client.name = newName;
        client.social = newSocial;
        saveData();
        toggleClientInfoEditMode(false);
        refreshAllViews();
      }
    });
  }

  if (cancelEditVisitBtn) {
    cancelEditVisitBtn.addEventListener('click', resetVisitFormMode);
  }

  document.querySelectorAll('#visitRemovalPills .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#visitRemovalPills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const visitGelSearch = document.getElementById('visitGelSearch');
  if (visitGelSearch) {
    visitGelSearch.addEventListener('input', renderVisitGelSelector);
    visitGelSearch.addEventListener('focus', renderVisitGelSelector);
    visitGelSearch.addEventListener('blur', () => {
      setTimeout(() => {
        const dropdown = document.getElementById('visitGelDropdown');
        if (dropdown) dropdown.classList.add('hidden');
      }, 150);
    });
  }

  const visitPhotoInput = document.getElementById('visitPhotoInput');
  const visitPhotoPreviewWrap = document.getElementById('visitPhotoPreviewWrap');
  const visitPhotoPreview = document.getElementById('visitPhotoPreview');
  const clearVisitPhotoBtn = document.getElementById('clearVisitPhotoBtn');

  if (visitPhotoInput && visitPhotoPreviewWrap && visitPhotoPreview) {
    visitPhotoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const base64 = await compressImageToBase64(file);
      visitPhotoPreview.src = base64;
      delete visitPhotoPreview.dataset.existingUrl;
      visitPhotoPreviewWrap.classList.remove('hidden');
    });

    if (clearVisitPhotoBtn) {
      clearVisitPhotoBtn.addEventListener('click', () => {
        visitPhotoInput.value = '';
        visitPhotoPreview.src = '';
        delete visitPhotoPreview.dataset.existingUrl;
        visitPhotoPreviewWrap.classList.add('hidden');
      });
    }
  }

  clientForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newClient = {
      id: 'c_' + Date.now(),
      name: document.getElementById('clientName').value.trim(),
      social: document.getElementById('clientSocial').value.trim(),
      nailNote: document.getElementById('clientNailNote').value.trim()
    };

    appData.clients.unshift(newClient);
    saveData();

    clientForm.reset();
    refreshAllViews();
    selectClient(newClient.id);
  });

  clientSearchInput.addEventListener('input', renderClientList);

  saveClientNoteBtn.addEventListener('click', () => {
    if (!selectedClientId) return;
    const client = appData.clients.find(c => c.id === selectedClientId);
    if (client) {
      client.nailNote = document.getElementById('detailNailNoteInput').value.trim();
      saveData();
      renderClientList();
      alert('已更新顧客甲況與偏好筆記並自動同步！');
    }
  });

  deleteClientBtn.addEventListener('click', () => {
    if (!selectedClientId) return;
    if (confirm('確定要刪除此顧客檔案嗎？（原有的記帳金額仍會保留，僅解除顧客關聯）')) {
      appData.clients = appData.clients.filter(c => c.id !== selectedClientId);
      appData.entries.forEach(e => {
        if (e.clientId === selectedClientId) e.clientId = '';
      });
      selectedClientId = null;
      resetVisitFormMode();
      saveData();
      refreshAllViews();
      document.getElementById('noClientSelected').classList.remove('hidden');
      document.getElementById('clientDetailContent').classList.add('hidden');
    }
  });

  visitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedClientId) return;

    const submitBtn = document.getElementById('visitSubmitBtn') || visitForm.querySelector('button[type="submit"]');
    const origBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.textContent = '儲存紀錄中...';

    try {
      const editId = document.getElementById('visitEditId') ? document.getElementById('visitEditId').value : '';
      const date = document.getElementById('visitDate').value;
      const category = document.getElementById('visitCategory').value;
      const amount = Number(document.getElementById('visitAmount').value);
      const nextWeeks = Number(document.getElementById('visitNextWeeks').value);
      const formula = document.getElementById('visitFormula').value.trim();
      const syncToLedger = document.getElementById('syncToLedgerCheck').checked;

      const activeRemovalBtn = document.querySelector('#visitRemovalPills .pill-btn.active');
      const finalRemovalName = activeRemovalBtn ? activeRemovalBtn.dataset.name : 'none';

      const usedGelLabels = deductGelInventoryPct(selectedVisitGelIds, 2);

      let photoUrl = '';
      const previewImg = document.getElementById('visitPhotoPreview');
      const previewSrc = previewImg ? previewImg.src : '';
      const existingUrl = previewImg && previewImg.dataset.existingUrl ? previewImg.dataset.existingUrl : '';

      if (previewSrc && previewSrc.startsWith('data:image/') && getGasUrl()) {
        submitBtn.textContent = '上傳成品照片中...';
        const clientName = getClientNameById(selectedClientId) || 'client';
        const res = await fetch(getGasUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'upload_photo',
            filename: `${date}_${clientName}_${Date.now()}.jpg`,
            base64: previewSrc
          })
        });
        const uploadRes = await res.json();
        if (uploadRes.status === 'ok' && uploadRes.url) {
          photoUrl = uploadRes.url;
        } else {
          alert('照片上傳失敗（GAS 回傳）：' + JSON.stringify(uploadRes));
        }
      } else if (existingUrl) {
        photoUrl = existingUrl;
      }

      let fullNote = formula;
      if (usedGelLabels.length > 0) {
        const gelStr = `用膠：${usedGelLabels.join(' + ')}`;
        fullNote = fullNote ? `${gelStr}｜${fullNote}` : gelStr;
      }
      if (finalRemovalName !== 'none') {
        const remTag = `[${finalRemovalName}]`;
        fullNote = fullNote ? `${remTag} ${fullNote}` : remTag;
      }
      if (nextWeeks > 0) {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + nextWeeks * 7);
        const nextStr = nextDate.toISOString().split('T')[0];
        fullNote += `（建議 ${nextStr} 回補）`;
      }

      if (editId) {
        const idx = appData.entries.findIndex(item => item.id === editId);
        if (idx !== -1) {
          appData.entries[idx] = {
            ...appData.entries[idx],
            date: date,
            category: category,
            amount: syncToLedger ? amount : appData.entries[idx].amount,
            note: fullNote,
            photoUrl: photoUrl
          };
          saveData();
        }
      } else if (syncToLedger || photoUrl || usedGelLabels.length > 0) {
        appData.entries.push({
          id: Date.now().toString(),
          date: date,
          type: 'income',
          category: category,
          amount: syncToLedger ? amount : 0,
          clientId: selectedClientId,
          note: fullNote,
          photoUrl: photoUrl
        });
        saveData();
      }

      resetVisitFormMode();
      refreshAllViews();
    } catch (err) {
      alert('儲存或上傳照片時發生錯誤：' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnHtml;
      lucide.createIcons();
    }
  });
}

function renderClientList() {
  const container = document.getElementById('clientListContainer');
  const countEl = document.getElementById('clientTotalCount');
  const keyword = document.getElementById('clientSearchInput').value.trim().toLowerCase();

  const filteredClients = appData.clients.filter(c =>
    c.name.toLowerCase().includes(keyword) ||
    (c.social && c.social.toLowerCase().includes(keyword)) ||
    (c.nailNote && c.nailNote.toLowerCase().includes(keyword))
  );

  countEl.textContent = filteredClients.length;

  if (filteredClients.length === 0) {
    container.innerHTML = `<div class="empty-state">找不到符合條件的顧客資料</div>`;
    return;
  }

  container.innerHTML = filteredClients.map(client => {
    const visits = appData.entries.filter(e => e.type === 'income' && e.clientId === client.id);
    const totalSpent = visits.reduce((sum, v) => sum + v.amount, 0);
    const isActive = client.id === selectedClientId;

    return `
      <div class="client-item ${isActive ? 'active' : ''}" onclick="selectClient('${client.id}')">
        <div class="client-item-top">
          <span class="client-item-name">${escapeHtml(client.name)}</span>
          <span class="client-item-badge">來店 ${visits.length} 次 · $${totalSpent.toLocaleString()}</span>
        </div>
        <div class="client-item-meta">
          ${client.social ? escapeHtml(client.social) + ' ｜ ' : ''}${escapeHtml(client.nailNote || '尚無甲況備註')}
        </div>
      </div>
    `;
  }).join('');
}

window.selectClient = function (clientId) {
  selectedClientId = clientId;
  const viewMode = document.getElementById('clientInfoViewMode');
  const editMode = document.getElementById('clientInfoEditMode');
  const actions = document.getElementById('clientHeaderActions');
  if (viewMode && editMode && actions) {
    viewMode.classList.remove('hidden');
    actions.classList.remove('hidden');
    editMode.classList.add('hidden');
  }
  resetVisitFormMode();
  renderClientList();
  renderClientDetail(clientId);
};

window.toggleVisitCard = function (cardEl) {
  cardEl.classList.toggle('is-expanded');
  const badge = cardEl.querySelector('.visit-expand-hint');
  if (badge) {
    badge.textContent = cardEl.classList.contains('is-expanded')
      ? '▲ 收合紀錄'
      : '▼ 點擊查看配方';
  }
};

function renderClientDetail(clientId) {
  const client = appData.clients.find(c => c.id === clientId);
  if (!client) return;

  document.getElementById('noClientSelected').classList.add('hidden');
  document.getElementById('clientDetailContent').classList.remove('hidden');

  document.getElementById('detailClientName').textContent = client.name;
  document.getElementById('detailClientSocial').textContent = client.social || '未填寫社群/聯絡方式';
  document.getElementById('detailNailNoteInput').value = client.nailNote || '';

  const visits = appData.entries
    .filter(e => e.type === 'income' && e.clientId === client.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalSpent = visits.reduce((sum, v) => sum + v.amount, 0);
  document.getElementById('detailVisitCount').textContent = `${visits.length} 次`;
  document.getElementById('detailTotalSpent').textContent = `$${totalSpent.toLocaleString()}`;
  document.getElementById('detailLastVisit').textContent = visits.length > 0 ? visits[0].date : '尚無紀錄';

  const timeline = document.getElementById('visitTimeline');
  if (visits.length === 0) {
    timeline.innerHTML = `<div class="empty-state">這位客人尚無來店施作紀錄，可在上方表單新增。</div>`;
    return;
  }

  timeline.innerHTML = visits.map(v => {
    let rawNote = v.note || '';
    let summaryParts = [];

    const remMatch = rawNote.match(/^\[(本店卸甲|他店卸甲|本家卸甲續作|他家卸甲續作)\]\s*/);
    if (remMatch) {
      summaryParts.push(`[${remMatch[1]}]`);
      rawNote = rawNote.replace(remMatch[0], '');
    }

    const nextMatch = rawNote.match(/（建議\s*\d{4}-\d{2}-\d{2}\s*回補）/);
    if (nextMatch) {
      summaryParts.push(nextMatch[0]);
      rawNote = rawNote.replace(nextMatch[0], '').trim();
    }

    const summarySubText = summaryParts.join('');
    const detailFormulaText = rawNote || '未填寫款式色號配方';
    const imgUrl = formatDriveImageUrl(v.photoUrl);

    return `
      <div class="visit-card visit-card-expandable" onclick="toggleVisitCard(this)">
        <div class="visit-card-header">
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span class="visit-date">${v.date}</span>
            <span class="tag tag-income">${escapeHtml(v.category)}</span>
            <span class="visit-expand-hint">▼ 點擊查看配方</span>
          </div>
          <span class="amount-income">$${v.amount.toLocaleString()}</span>
        </div>

        ${summarySubText ? `<div class="visit-summary-sub">${escapeHtml(summarySubText)}</div>` : ''}

        <!-- 點擊卡片後展開的完整配方與照片 -->
        <div class="visit-detail-panel">
          <div class="visit-detail-box">
            <div class="visit-detail-label">款式與用膠色號配方：</div>
            <div class="visit-formula-content">${escapeHtml(detailFormulaText)}</div>
            ${imgUrl ? `
              <div style="margin-top: 10px;" onclick="event.stopPropagation()">
                <a href="${escapeHtml(v.photoUrl)}" target="_blank" title="點擊查看大圖">
                  <img src="${escapeHtml(imgUrl)}" class="visit-photo-thumb" alt="美甲成品照" style="max-width: 100%; max-height: 220px; border-radius: 10px; border: 1px solid var(--border-color); object-fit: cover; display: block;" />
                </a>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="visit-footer">
          <span>已同步至日常收支帳本</span>
          <div style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
            <button type="button" class="btn-text" onclick="editVisitRecord('${v.id}')" style="color: var(--accent-primary); padding: 2px 6px;">編輯紀錄</button>
            <button type="button" class="btn-text" onclick="deleteEntry('${v.id}')" style="color: var(--expense-color); padding: 2px 6px;">刪除紀錄</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 6. 全品項材料與色膠庫存管理功能
// ==========================================
function toggleInvFormMode() {
  const invCategory = document.getElementById('invCategory');
  const isGel = isGelItem(invCategory.value);
  document.getElementById('invColorGroup').classList.toggle('hidden', !isGel);
  document.getElementById('invUnitGroup').classList.toggle('hidden', isGel);
  document.getElementById('invRemainingGroup').classList.toggle('hidden', !isGel);
  document.getElementById('invLowThresholdGroup').classList.toggle('hidden', isGel);
  document.getElementById('invStockLabel').textContent = isGel ? '目前庫存瓶數' : '目前庫存數量';
}

function resetInventoryForm() {
  const invForm = document.getElementById('inventoryForm');
  invForm.reset();
  document.getElementById('invEditId').value = '';
  document.getElementById('invColorHex').value = '#D5B89E';
  document.getElementById('invStock').value = '1';
  document.getElementById('invRemainingPct').value = '100';
  document.getElementById('invLowThreshold').value = '1';
  document.getElementById('invUnitPrice').value = '120';

  document.getElementById('invFormTitle').textContent = '新增材料 / 色膠庫存';
  document.getElementById('invSubmitBtn').innerHTML = '<i data-lucide="plus-circle"></i> 加入庫存清單';
  document.getElementById('cancelEditInvBtn').classList.add('hidden');
  document.getElementById('inventoryFormCard').classList.remove('editing-mode');
  toggleInvFormMode();
  lucide.createIcons();
}

function initInventory() {
  const invForm = document.getElementById('inventoryForm');
  const invCategory = document.getElementById('invCategory');
  const invSearchInput = document.getElementById('invSearchInput');
  const invFilterSelect = document.getElementById('invFilterSelect');
  const cancelEditInvBtn = document.getElementById('cancelEditInvBtn');

  invCategory.addEventListener('change', toggleInvFormMode);
  cancelEditInvBtn.addEventListener('click', resetInventoryForm);
  toggleInvFormMode();

  invForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('invEditId').value;
    const category = invCategory.value;
    const isGel = isGelItem(category);

    const itemPayload = {
      brand: document.getElementById('invBrand').value.trim(),
      code: document.getElementById('invCode').value.trim(),
      colorHex: isGel ? document.getElementById('invColorHex').value : '',
      name: document.getElementById('invName').value.trim(),
      category: category,
      unit: isGel ? '瓶' : document.getElementById('invUnit').value,
      stock: Number(document.getElementById('invStock').value),
      remainingPct: isGel ? Number(document.getElementById('invRemainingPct').value) : 0,
      lowThreshold: isGel ? 1 : (Number(document.getElementById('invLowThreshold').value) || 1),
      unitPrice: Number(document.getElementById('invUnitPrice').value) || 0
    };

    if (editId) {
      const idx = appData.inventory.findIndex(i => i.id === editId);
      if (idx !== -1) {
        appData.inventory[idx] = { ...appData.inventory[idx], ...itemPayload };
      }
      resetInventoryForm();
    } else {
      appData.inventory.unshift({
        id: 'inv_' + Date.now(),
        ...itemPayload
      });
      document.getElementById('invCode').value = '';
      document.getElementById('invName').value = '';
    }

    saveData();
    refreshAllViews();
  });

  invSearchInput.addEventListener('input', renderInventoryTable);
  invFilterSelect.addEventListener('change', renderInventoryTable);
}

window.editInventoryItem = function (id) {
  const item = appData.inventory.find(i => i.id === id);
  if (!item) return;

  document.getElementById('invEditId').value = item.id;
  document.getElementById('invCategory').value = item.category;
  toggleInvFormMode();

  document.getElementById('invBrand').value = item.brand || '';
  document.getElementById('invCode').value = item.code || '';
  document.getElementById('invName').value = item.name || '';
  document.getElementById('invStock').value = item.stock ?? 1;
  document.getElementById('invUnitPrice').value = item.unitPrice ?? 0;

  if (isGelItem(item.category)) {
    document.getElementById('invColorHex').value = item.colorHex || '#D5B89E';
    document.getElementById('invRemainingPct').value = item.remainingPct ?? 100;
  } else {
    document.getElementById('invUnit').value = item.unit || '包';
    document.getElementById('invLowThreshold').value = item.lowThreshold ?? 1;
  }

  document.getElementById('invFormTitle').textContent = '編輯庫存品項';
  document.getElementById('invSubmitBtn').innerHTML = '<i data-lucide="check"></i> 儲存修改';
  document.getElementById('cancelEditInvBtn').classList.remove('hidden');
  const formCard = document.getElementById('inventoryFormCard');
  formCard.classList.add('editing-mode');
  lucide.createIcons();
  formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function isLowStock(item) {
  if (isGelItem(item.category)) {
    return item.stock === 0 || (item.stock <= 1 && (item.remainingPct || 0) <= 30);
  }
  const threshold = item.lowThreshold !== undefined ? Number(item.lowThreshold) : 1;
  return item.stock <= threshold;
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  const emptyMsg = document.getElementById('emptyInventoryMsg');
  const summaryText = document.getElementById('inventorySummaryText');

  const keyword = document.getElementById('invSearchInput').value.trim().toLowerCase();
  const filterCat = document.getElementById('invFilterSelect').value;

  const totalValue = appData.inventory.reduce((sum, item) => {
    const qty = isGelItem(item.category)
      ? (item.stock + ((item.remainingPct || 0) / 100))
      : item.stock;
    return sum + Math.round(qty * (item.unitPrice || 0));
  }, 0);
  summaryText.textContent = `共 ${appData.inventory.length} 款品項 · 預估剩餘材料總價值：$${totalValue.toLocaleString()}`;

  const filtered = appData.inventory.filter(item => {
    const matchKeyword = item.brand.toLowerCase().includes(keyword) ||
      item.code.toLowerCase().includes(keyword) ||
      item.name.toLowerCase().includes(keyword);
    if (!matchKeyword) return false;

    if (filterCat === 'low') return isLowStock(item);
    if (filterCat !== 'all') return item.category === filterCat;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  tbody.innerHTML = filtered.map(item => {
    const isGel = isGelItem(item.category);
    const low = isLowStock(item);
    const unit = item.unit || (isGel ? '瓶' : '件');
    const itemTotalVal = Math.round((isGel ? (item.stock + (item.remainingPct || 0) / 100) : item.stock) * (item.unitPrice || 0));

    const badgeCell = isGel
      ? `<span class="swatch-dot" style="background-color: ${escapeHtml(item.colorHex || '#D5B89E')};"></span>`
      : `<span class="material-icon-badge" title="${escapeHtml(item.category)}">${escapeHtml(item.category.slice(0, 1))}</span>`;

    const statusCell = isGel
      ? `<div class="pct-bar-wrap" title="點擊右側按鈕遞減開瓶餘量">
           <div class="pct-bar-fill ${(item.remainingPct || 0) <= 30 ? 'low' : ''}" style="width: ${item.remainingPct || 0}%;"></div>
         </div>
         <span style="font-size: 12px; font-weight: 600;">${item.remainingPct || 0}%</span>
         <button class="step-btn" style="margin-left: 4px;" onclick="cycleRemainingPct('${item.id}')" title="遞減 20% 餘量">↓</button>`
      : `<span class="tag ${low ? 'tag-expense' : 'tag-income'}">${low ? '庫存偏低' : '庫存充足'}</span>`;

    return `
      <tr>
        <td>${badgeCell}</td>
        <td class="col-nowrap">
          <strong>${escapeHtml(item.brand)}</strong><br />
          <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.code)}</span>
        </td>
        <td>
          ${escapeHtml(item.name)}
          ${low ? '<span class="tag tag-expense" style="margin-left: 6px;">需補貨</span>' : ''}
        </td>
        <td class="col-nowrap"><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.category)}</span></td>
        <td class="text-center col-nowrap">
          <div class="stock-stepper">
            <button class="step-btn" onclick="adjustStock('${item.id}', -1)" title="減少 1 ${unit}">-</button>
            <span class="stock-num ${low ? 'low' : ''}">${item.stock} ${unit}</span>
            <button class="step-btn" onclick="adjustStock('${item.id}', 1)" title="增加 1 ${unit}">+</button>
          </div>
        </td>
        <td class="col-nowrap">${statusCell}</td>
        <td class="text-right col-nowrap">
          <span style="font-size: 13px; font-weight: 600;">$${(item.unitPrice || 0).toLocaleString()}</span><br />
          <span style="font-size: 11px; color: var(--text-secondary);">總值 $${itemTotalVal.toLocaleString()}</span>
        </td>
        <td class="text-center col-nowrap">
          <button class="edit-btn" onclick="editInventoryItem('${item.id}')" title="編輯此品項">✎</button>
          <button class="delete-btn" onclick="deleteInventoryItem('${item.id}')" title="刪除此品項">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.adjustStock = function (id, delta) {
  const item = appData.inventory.find(i => i.id === id);
  if (!item) return;
  item.stock = Math.max(0, item.stock + delta);
  saveData();
  refreshAllViews();
};

window.cycleRemainingPct = function (id) {
  const item = appData.inventory.find(i => i.id === id);
  if (!item) return;
  if ((item.remainingPct || 0) > 0) {
    item.remainingPct = Math.max(0, item.remainingPct - 20);
  } else {
    if (item.stock > 0 && confirm(`「${item.brand} ${item.code}」已用完，要自動拆封 1 瓶全新庫存嗎？`)) {
      item.stock -= 1;
      item.remainingPct = 100;
    } else {
      item.remainingPct = 100;
    }
  }
  saveData();
  refreshAllViews();
};

window.deleteInventoryItem = function (id) {
  if (confirm('確定要從庫存清單刪除此項目嗎？')) {
    if (document.getElementById('invEditId').value === id) {
      resetInventoryForm();
    }
    selectedVisitGelIds.delete(id);
    appData.inventory = appData.inventory.filter(i => i.id !== id);
    saveData();
    refreshAllViews();
  }
};

// ==========================================
// 7. 營運總覽與 Chart.js 圖表
// ==========================================
function populateMonthFilter() {
  const monthFilter = document.getElementById('monthFilter');
  const currentVal = monthFilter.value;

  const months = Array.from(new Set(appData.entries.map(e => e.date.slice(0, 7))))
    .sort()
    .reverse();

  monthFilter.innerHTML = `<option value="all">全部歷史紀錄</option>` +
    months.map(m => `<option value="${m}">${m}</option>`).join('');

  if (months.includes(currentVal)) {
    monthFilter.value = currentVal;
  }

  monthFilter.onchange = updateDashboard;
}

function updateDashboard() {
  const selectedMonth = document.getElementById('monthFilter').value;
  const filtered = selectedMonth === 'all'
    ? appData.entries
    : appData.entries.filter(e => e.date.startsWith(selectedMonth));

  const incomeItems = filtered.filter(e => e.type === 'income');
  const expenseItems = filtered.filter(e => e.type === 'expense');

  const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = expenseItems.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const marginRate = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : 0;
  const avgTicket = incomeItems.length > 0 ? Math.round(totalIncome / incomeItems.length) : 0;
  const lowStockCount = appData.inventory.filter(isLowStock).length;

  document.getElementById('kpiIncome').textContent = `$${totalIncome.toLocaleString()}`;
  document.getElementById('kpiIncomeCount').textContent = `共 ${incomeItems.length} 筆收入 · 淨利率 ${marginRate}%`;

  document.getElementById('kpiExpense').textContent = `$${totalExpense.toLocaleString()}`;
  document.getElementById('kpiExpenseCount').textContent = `共 ${expenseItems.length} 筆支出`;

  const profitEl = document.getElementById('kpiProfit');
  profitEl.textContent = `${netProfit < 0 ? '-' : ''}$${Math.abs(netProfit).toLocaleString()}`;
  profitEl.style.color = netProfit < 0 ? 'var(--expense-color)' : 'var(--text-primary)';

  document.getElementById('kpiAvgTicket').textContent = `平均客單價：$${avgTicket.toLocaleString()}`;
  document.getElementById('kpiClientCount').textContent = `${appData.clients.length} 位`;
  document.getElementById('kpiLowStockSub').textContent = `材料低庫存提醒：${lowStockCount} 項`;

  renderCharts(incomeItems, expenseItems);
}

function renderCharts(incomeItems, expenseItems) {
  const monthMap = {};
  appData.entries.forEach(item => {
    const m = item.date.slice(0, 7);
    if (!monthMap[m]) monthMap[m] = { income: 0, expense: 0 };
    monthMap[m][item.type] += item.amount;
  });

  const sortedMonths = Object.keys(monthMap).sort().slice(-6);
  const trendIncomeData = sortedMonths.map(m => monthMap[m].income);
  const trendExpenseData = sortedMonths.map(m => monthMap[m].expense);

  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(document.getElementById('trendChart'), {
    type: 'bar',
    data: {
      labels: sortedMonths,
      datasets: [
        { label: '營業收入', data: trendIncomeData, backgroundColor: '#4D8B6F', borderRadius: 6 },
        { label: '營運支出', data: trendExpenseData, backgroundColor: '#C45C5C', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const incomeByCat = groupSumByCategory(incomeItems);
  if (charts.incomeCat) charts.incomeCat.destroy();
  charts.incomeCat = new Chart(document.getElementById('incomeCategoryChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(incomeByCat),
      datasets: [{
        data: Object.values(incomeByCat),
        backgroundColor: ['#A68468', '#C5A880', '#4D8B6F', '#7FA99B', '#D9B89C', '#8C6D53', '#B59B84']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  const expenseByCat = groupSumByCategory(expenseItems);
  if (charts.expenseCat) charts.expenseCat.destroy();
  charts.expenseCat = new Chart(document.getElementById('expenseCategoryChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(expenseByCat),
      datasets: [{
        data: Object.values(expenseByCat),
        backgroundColor: ['#C45C5C', '#D98A6C', '#E5B299', '#A68468', '#8A7B6E', '#B87D7D', '#6E5D4F']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function groupSumByCategory(items) {
  return items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.amount;
    return acc;
  }, {});
}

// ==========================================
// 8. 單客成本與定價試算器
// ==========================================
function initCalculator() {
  const triggers = document.querySelectorAll('.calc-trigger');
  triggers.forEach(input => {
    input.addEventListener('input', calculateUnitEconomics);
  });

  document.getElementById('autoFillFromInvBtn').addEventListener('click', () => {
    const gelItems = appData.inventory.filter(i => isGelItem(i.category) && i.unitPrice > 0);
    if (gelItems.length === 0) {
      alert('庫存清單中目前沒有設定單價的凝膠資料，請先在「材料與色膠庫存」新增凝膠單價。');
      return;
    }
    const avgPrice = Math.round(gelItems.reduce((s, i) => s + Number(i.unitPrice), 0) / gelItems.length);
    document.getElementById('gelBottlePrice').value = avgPrice;
    calculateUnitEconomics();
    alert(`已根據你庫存中的 ${gelItems.length} 款凝膠，自動套用真實平均單瓶成本：$${avgPrice}`);
  });

  calculateUnitEconomics();
}

function calculateUnitEconomics() {
  const gelPrice = Number(document.getElementById('gelBottlePrice').value) || 0;
  const gelUses = Math.max(1, Number(document.getElementById('gelUsesPerBottle').value) || 1);
  const gelBottles = Number(document.getElementById('gelBottlesUsed').value) || 0;
  const disposable = Number(document.getElementById('disposableCost').value) || 0;
  const accessory = Number(document.getElementById('accessoryCost').value) || 0;
  const equipment = Number(document.getElementById('equipmentShare').value) || 0;

  const monthlyFixed = Number(document.getElementById('monthlyFixedCost').value) || 0;
  const monthlyClients = Math.max(1, Number(document.getElementById('monthlyClients').value) || 1);
  const hours = Math.max(0.1, Number(document.getElementById('serviceHours').value) || 1);
  const targetWage = Number(document.getElementById('targetHourlyWage').value) || 0;

  const proposedPrice = Number(document.getElementById('proposedPrice').value) || 0;

  const gelCost = Math.round((gelPrice / gelUses) * gelBottles);
  const fixedShare = Math.round(monthlyFixed / monthlyClients);
  const totalHardCost = gelCost + disposable + accessory + equipment + fixedShare;
  const laborCost = Math.round(hours * targetWage);

  const breakevenPrice = totalHardCost + laborCost;
  const suggestedPrice = Math.round((breakevenPrice * 1.25) / 10) * 10;

  const simNetProfit = proposedPrice - totalHardCost;
  const simActualHourly = Math.round(simNetProfit / hours);
  const simMarginRate = proposedPrice > 0 ? ((simNetProfit / proposedPrice) * 100).toFixed(1) : 0;

  document.getElementById('resGelCost').textContent = `$${gelCost.toLocaleString()}`;
  document.getElementById('resDisposableCost').textContent = `$${disposable.toLocaleString()}`;
  document.getElementById('resAccessoryCost').textContent = `$${accessory.toLocaleString()}`;
  document.getElementById('resEquipmentShare').textContent = `$${equipment.toLocaleString()}`;
  document.getElementById('resFixedShare').textContent = `$${fixedShare.toLocaleString()}`;
  document.getElementById('resTotalHardCost').textContent = `$${totalHardCost.toLocaleString()}`;
  document.getElementById('resLaborCost').textContent = `$${laborCost.toLocaleString()}`;

  document.getElementById('resBreakevenPrice').textContent = `$${breakevenPrice.toLocaleString()}`;
  document.getElementById('resSuggestedPrice').textContent = `$${suggestedPrice.toLocaleString()}`;

  document.getElementById('simPriceDisplay').textContent = `$${proposedPrice.toLocaleString()}`;
  document.getElementById('simNetProfit').textContent = `$${simNetProfit.toLocaleString()}`;
  document.getElementById('simActualHourly').textContent = `$${simActualHourly.toLocaleString()} / hr`;
  document.getElementById('simMarginRate').textContent = `${simMarginRate}%`;

  const feedbackEl = document.getElementById('simFeedback');
  if (simActualHourly >= targetWage) {
    feedbackEl.classList.remove('warning');
    feedbackEl.textContent = `定價健康！扣除全品項材料與場地開銷後，實際時薪高於期望目標（$${targetWage}/hr）。`;
  } else {
    feedbackEl.classList.add('warning');
    feedbackEl.textContent = `注意：此定價扣除成本後的實際時薪低於期望目標（$${targetWage}/hr），建議調高定價或增加飾品/卸甲加價。`;
  }
}

// ==========================================
// 9. Google Sheets 雲端雙向自動同步 (Apps Script)
// ==========================================
function initCloudSync() {
  const cloudSyncBtn = document.getElementById('cloudSyncBtn');
  const cloudModal = document.getElementById('cloudModal');
  const closeCloudModalBtn = document.getElementById('closeCloudModalBtn');
  const saveGasUrlBtn = document.getElementById('saveGasUrlBtn');
  const clearGasUrlBtn = document.getElementById('clearGasUrlBtn');
  const gasUrlInput = document.getElementById('gasUrlInput');
  const pushCloudBtn = document.getElementById('pushCloudBtn');
  const pullCloudBtn = document.getElementById('pullCloudBtn');

  updateSyncBarUI();

  cloudSyncBtn.addEventListener('click', () => {
    gasUrlInput.value = getGasUrl();
    cloudModal.classList.remove('hidden');
  });

  closeCloudModalBtn.addEventListener('click', () => cloudModal.classList.add('hidden'));

  saveGasUrlBtn.addEventListener('click', async () => {
    const url = gasUrlInput.value.trim();
    if (!url.startsWith('https://script.google.com/')) {
      alert('請輸入正確的 Google Apps Script 網址（https://script.google.com/...）');
      return;
    }
    localStorage.setItem(GAS_URL_KEY, url);
    cloudModal.classList.add('hidden');
    updateSyncBarUI();
    await pullFromCloud(false);
  });

  clearGasUrlBtn.addEventListener('click', () => {
    localStorage.removeItem(GAS_URL_KEY);
    gasUrlInput.value = DEFAULT_GAS_URL;
    cloudModal.classList.add('hidden');
    updateSyncBarUI();
    alert('已恢復使用預設內建的雲端資料庫網址。');
  });

  pushCloudBtn.addEventListener('click', () => pushToCloud(false));
  pullCloudBtn.addEventListener('click', () => pullFromCloud(false));
}

function updateSyncBarUI() {
  const url = getGasUrl();
  const bar = document.getElementById('syncStatusBar');
  const statusText = document.getElementById('syncStatusText');

  if (url) {
    bar.classList.remove('hidden');
    statusText.textContent = '已連結 Google Sheets 雲端資料庫（任何異動將自動同步上傳）';
  } else {
    bar.classList.add('hidden');
  }
}

async function pushToCloud(isSilent = false) {
  const url = getGasUrl();
  if (!url) return;

  const statusText = document.getElementById('syncStatusText');
  statusText.textContent = '正在自動上傳資料至 Google Sheets...';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sync_all', payload: appData })
    });
    const result = await res.json();
    if (result.status === 'ok') {
      const now = new Date().toLocaleTimeString();
      statusText.textContent = `雲端已自動同步！（最後上傳：${now}）`;
      if (!isSilent) alert('已成功將最新資料同步至 Google Sheets！');
    } else {
      throw new Error(result.message || '同步失敗');
    }
  } catch (err) {
    statusText.textContent = '雲端自動上傳失敗，請檢查網路或 Apps Script 權限。';
    if (!isSilent) alert('上傳失敗：' + err.message);
  }
}

async function pullFromCloud(isSilent = false) {
  const url = getGasUrl();
  if (!url) return;

  const statusText = document.getElementById('syncStatusText');
  statusText.textContent = '正在從 Google Sheets 檢查最新資料...';

  try {
    const res = await fetch(`${url}?action=get_all`);
    const result = await res.json();
    if (result.status === 'ok' && result.data) {
      const hasCloudData = (result.data.entries && result.data.entries.length > 0) ||
                           (result.data.clients && result.data.clients.length > 0) ||
                           (result.data.inventory && result.data.inventory.length > 0);

      if (hasCloudData) {
        appData.entries = (result.data.entries || []).map(e => ({
          ...e,
          date: formatDateStr(e.date)
        }));
        appData.clients = result.data.clients || [];
        appData.inventory = result.data.inventory || [];
        saveData(true);
        refreshAllViews();
        statusText.textContent = `已與雲端保持最新同步！（${new Date().toLocaleTimeString()}）`;
        if (!isSilent) alert('已成功從 Google Sheets 同步最新資料！');
      } else {
        statusText.textContent = '偵測到雲端試算表為空，正在自動上傳本機資料初始化...';
        await pushToCloud(true);
      }
    }
  } catch (err) {
    statusText.textContent = '讀取雲端失敗，請確認 Apps Script「所有人」存取權限。';
    if (!isSilent) alert('讀取雲端資料失敗：' + err.message);
  }
}

// ==========================================
// 10. 匯出 CSV 與 JSON 完整備份還原
// ==========================================
function initExportImport() {
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const headers = ['日期', '收支類型', '項目分類', '客人', '金額', '備註'];
    const rows = appData.entries.map(e => [
      e.date,
      e.type === 'income' ? '營業收入' : '營運支出',
      `"${e.category}"`,
      `"${getClientNameById(e.clientId)}"`,
      e.amount,
      `"${(e.note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csvContent, `美甲工作室營運報表_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  });

  document.getElementById('backupJsonBtn').addEventListener('click', () => {
    const jsonContent = JSON.stringify(appData, null, 2);
    downloadFile(jsonContent, `nail_studio_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  });

  document.getElementById('restoreJsonInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported && Array.isArray(imported.entries)) {
          appData.entries = imported.entries.map(item => ({ ...item, date: formatDateStr(item.date) }));
          appData.clients = Array.isArray(imported.clients) ? imported.clients : [];
          appData.inventory = Array.isArray(imported.inventory) ? imported.inventory : [];
          selectedClientId = null;
          selectedVisitGelIds.clear();
          saveData();
          refreshAllViews();
          document.getElementById('noClientSelected').classList.remove('hidden');
          document.getElementById('clientDetailContent').classList.add('hidden');
          alert('收支、顧客與庫存資料已成功還原並自動同步至雲端！');
        } else {
          alert('檔案格式不正確，請選擇有效的備份 JSON 檔。');
        }
      } catch (err) {
        alert('讀取備份檔案失敗，請確認檔案未損毀。');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateStr(dateVal) {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return str;
}

function formatDriveImageUrl(url) {
  if (!url) return '';
  const str = String(url).trim();
  const match = str.match(/(?:\/file\/d\/|id=)([a-zA-Z0-9_-]{25,})/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }
  return str;
}

function compressImageToBase64(file, maxWidth = 1000, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}