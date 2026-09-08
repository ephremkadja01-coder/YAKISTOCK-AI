'use strict';

/* ===========================================================
   STATE — no seed data: the inventory starts empty
=========================================================== */
const STORAGE_KEY = 'yakistock_state_v1';
const USERS_KEY = 'yakistock_users_v1';
const SESSION_KEY = 'yakistock_session_v1';
const REGISTERS_KEY = 'yakistock_registers_v1';
const SALES_KEY = 'yakistock_sales_v1';
const SETTINGS_KEY = 'yakistock_settings_v1';
const API_BASE = localStorage.getItem('yakistock_api_url') || 'http://127.0.0.1:8000';
const API_TOKEN_KEY = 'yakistock_access_token';
const API_USER_KEY = 'yakistock_api_user';

const ROLE_LABELS = { admin: 'Administrateur général', manager: 'Gestionnaire de stock', cashier: 'Opérateur des ventes' };

function readCollection(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed === null ? fallback : parsed;
  }
  catch (e) { return fallback; }
}

function saveCollection(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function readUsers() {
  const storedUsers = readCollection(USERS_KEY, []);
  const users = Array.isArray(storedUsers) ? storedUsers.filter(user => user && typeof user === 'object') : [];
  let changed = false;
  users.forEach((user, index) => {
    if (!user.role) { user.role = index === 0 ? 'admin' : 'manager'; changed = true; }
  });
  if (changed) saveCollection(USERS_KEY, users);
  return users;
}

function setAuthenticated(email, user) {
  localStorage.setItem(SESSION_KEY, email);
  localStorage.setItem(API_USER_KEY, JSON.stringify(user));
  document.getElementById('authShell').hidden = true;
  document.getElementById('homeShell').hidden = true;
  document.getElementById('appShell').hidden = false;
  applyRoleView();
}

function showHome() {
  document.getElementById('homeShell').hidden = false;
  document.getElementById('authShell').hidden = true;
  document.getElementById('appShell').hidden = true;
}

function showAuth(view) {
  const isRegister = view === 'register';
  document.getElementById('homeShell').hidden = true;
  document.getElementById('authShell').hidden = false;
  document.getElementById('appShell').hidden = true;
  document.querySelectorAll('.auth-tab').forEach(btn => {
    const active = btn.dataset.authView === view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.getElementById('loginForm').hidden = isRegister;
  document.getElementById('registerForm').hidden = !isRegister;
  document.getElementById('authTitle').textContent = isRegister ? 'Créez votre espace.' : 'Bon retour.';
  document.getElementById('authSubtitle').textContent = isRegister ? 'Quelques secondes suffisent pour commencer à suivre votre inventaire.' : 'Connectez-vous pour retrouver votre espace de travail.';
}

document.querySelectorAll('.auth-tab').forEach(btn => btn.addEventListener('click', () => showAuth(btn.dataset.authView)));
document.querySelectorAll('.js-show-login').forEach(btn => btn.addEventListener('click', () => showAuth('login')));
document.querySelectorAll('.js-show-register').forEach(btn => btn.addEventListener('click', () => showAuth('register')));
document.querySelector('.home-brand').addEventListener('click', (e) => { e.preventDefault(); showHome(); });
async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem(API_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Erreur du serveur');
  return data;
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  try {
    const result = await apiRequest('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(API_TOKEN_KEY, result.access_token);
    setAuthenticated(email, result.user);
    await connectBackend();
    showToast('Connexion réussie.', 'success');
  } catch (error) { showToast(error.message, 'danger'); }
});
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim().toLowerCase();
  const password = document.getElementById('registerPassword').value;
  try {
    const result = await apiRequest('/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    localStorage.setItem(API_TOKEN_KEY, result.access_token);
    setAuthenticated(email, result.user);
    await connectBackend();
    showToast('Votre espace a été créé.', 'success');
  } catch (error) { showToast(error.message, 'danger'); }
});

function currentUser() {
  const apiUser = readCollection(API_USER_KEY, null);
  if (apiUser) return apiUser;
  const email = localStorage.getItem(SESSION_KEY);
  return readUsers().find(user => user.email === email);
}

function applyRoleView() {
  const user = currentUser();
  if (!user) return;
  const isCashier = user.role === 'cashier';
  const isAdmin = user.role === 'admin';
  document.getElementById('roleBadge').textContent = ROLE_LABELS[user.role] || user.role;
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const allowed = !isCashier && (btn.dataset.tab !== 'admin' || isAdmin || user.role === 'manager');
    btn.hidden = !allowed;
  });
  document.getElementById('profileBtn').hidden = isCashier;
  document.getElementById('settingsBtn').hidden = isCashier;
  document.getElementById('cashierPanel').hidden = !isCashier;
  document.getElementById('panel-admin').hidden = !(isAdmin || user.role === 'manager');
  document.querySelector('.tab-bar').hidden = isCashier;
  document.querySelectorAll('.tab-panel').forEach(panel => { panel.hidden = isCashier; });
  document.querySelector('main').classList.toggle('cashier-main', isCashier);
  if (isCashier) {
    renderCashier();
    return;
  }
  document.querySelectorAll('.tab-panel').forEach(panel => { panel.hidden = false; });
  const activeTab = document.querySelector('.tab-btn.is-active:not([hidden])');
  if (!activeTab || activeTab.dataset.tab === 'admin' && !isAdmin && user.role !== 'manager') setActiveTab('overview');
  if (isAdmin || user.role === 'manager') renderAdmin();
}

function setActiveTab(tabName) {
  const button = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (!button || button.hidden) return;
  tabButtons.forEach(tab => {
    const active = tab === button;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  tabPanels.forEach(panel => {
    panel.classList.toggle('is-active', panel.id === 'panel-' + tabName);
    panel.hidden = panel.id === 'panel-' + tabName ? false : true;
  });
  if (tabName === 'predictions') renderPredictions();
  if (tabName === 'admin') renderAdmin();
}

function roleTab(tabName) { setActiveTab(tabName); }

function openProfileModal() {
  const user = currentUser();
  if (!user) return;
  document.getElementById('profileName').value = user.name;
  document.getElementById('profileEmail').value = user.email;
  document.getElementById('profilePassword').value = '';
  document.getElementById('profileSummaryName').textContent = user.name;
  document.getElementById('profileAvatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('profileModalOverlay').hidden = false;
  document.getElementById('profileName').focus();
}

function loadSettings() { return readCollection(SETTINGS_KEY, { tableView: false, stockAlerts: true }); }

document.getElementById('profileBtn').addEventListener('click', openProfileModal);
document.getElementById('closeProfileModal').addEventListener('click', () => { document.getElementById('profileModalOverlay').hidden = true; });
document.getElementById('profileModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'profileModalOverlay') e.target.hidden = true; });
document.getElementById('profileForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const user = currentUser();
  if (!user) return;
  const name = document.getElementById('profileName').value.trim();
  const email = document.getElementById('profileEmail').value.trim().toLowerCase();
  const password = document.getElementById('profilePassword').value;
  const users = readUsers();
  const userIndex = users.findIndex(item => item.email === user.email);
  if (users.some((item, index) => item.email === email && index !== userIndex)) { showToast('Cette adresse e-mail est déjà utilisée.', 'danger'); return; }
  users[userIndex].name = name;
  users[userIndex].email = email;
  if (password) users[userIndex].password = password;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(SESSION_KEY, email);
  document.getElementById('profileModalOverlay').hidden = true;
  showToast('Profil mis à jour.', 'success');
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  const settings = loadSettings();
  document.getElementById('tableViewSetting').checked = settings.tableView;
  document.getElementById('stockAlertsSetting').checked = settings.stockAlerts;
  document.getElementById('settingsModalOverlay').hidden = false;
});
document.getElementById('closeSettingsModal').addEventListener('click', () => { document.getElementById('settingsModalOverlay').hidden = true; });
document.getElementById('settingsModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'settingsModalOverlay') e.target.hidden = true; });
document.getElementById('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const tableView = document.getElementById('tableViewSetting').checked;
  const stockAlerts = document.getElementById('stockAlertsSetting').checked;
  localStorage.setItem('yakistock_settings_v1', JSON.stringify({ tableView, stockAlerts }));
  state.viewMode = tableView ? 'table' : 'cards';
  saveState();
  document.getElementById('settingsModalOverlay').hidden = true;
  renderStock();
  showToast('Paramètres enregistrés.', 'success');
});

let cart = [];
let paymentType = 'cash';
let backendRegisters = [];
let backendUsers = [];
let backendSales = [];

function loadRegisters() { return backendRegisters.length ? backendRegisters : readCollection(REGISTERS_KEY, []); }
function loadSales() { return backendSales.length ? backendSales : readCollection(SALES_KEY, []); }
function loadAdminUsers() { return backendUsers.length ? backendUsers : readUsers(); }
function roleName(role) { return ROLE_LABELS[role] || role; }
function todayIso() { return new Date().toISOString().slice(0, 10); }

async function renderAdmin() {
  try {
    [backendUsers, backendRegisters, backendSales] = await Promise.all([
      apiRequest('/users'),
      apiRequest('/sales-spaces'),
      apiRequest('/sales')
    ]);
  } catch (error) {
    showToast(error.message, 'danger');
  }
  const user = currentUser();
  const isAdmin = user && user.role === 'admin';
  const registers = loadRegisters();
  const users = loadAdminUsers();
  const sales = loadSales();
  document.getElementById('panel-admin').hidden = !user || (user.role !== 'admin' && user.role !== 'manager');
  document.getElementById('adminUserCard').hidden = !isAdmin;
  document.getElementById('cashRegisterForm').hidden = !isAdmin;
  document.getElementById('adminMetrics').hidden = !isAdmin;
  document.getElementById('registerCount').textContent = registers.length;
  document.getElementById('userCount').textContent = users.length;
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const purchaseCost = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.qty * item.purchasePrice, 0), 0);
  document.getElementById('adminMetrics').innerHTML = `<div class="stat-card"><div class="stat-value">${fmtFCFA(revenue)}</div><div class="stat-label">Chiffre d'affaires total</div></div><div class="stat-card"><div class="stat-value">${fmtFCFA(state.products.reduce((sum, p) => sum + p.stock * p.price, 0))}</div><div class="stat-label">Valeur globale du stock</div></div><div class="stat-card"><div class="stat-value">${fmtFCFA(purchaseCost)}</div><div class="stat-label">Coût d'achat vendu</div></div><div class="stat-card"><div class="stat-value">${fmtFCFA(revenue - purchaseCost)}</div><div class="stat-label">Marge brute estimée</div></div>`;
  document.getElementById('registerList').innerHTML = registers.length ? registers.map(register => `<li><span><strong>${escapeHtml(register.name)}</strong><small>${register.active ? 'Espace actif' : 'Espace inactif'}</small></span>${isAdmin ? `<button class="icon-btn js-delete-register" type="button" data-id="${register.id}" aria-label="Supprimer ${escapeHtml(register.name)}">${iconTrash()}</button>` : ''}</li>`).join('') : '<li class="empty-inline">Aucun espace créé.</li>';
  document.getElementById('adminUserList').innerHTML = users.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.email)}</small></td><td>${roleName(item.role)}</td><td>${item.role === 'cashier' ? `<select class="js-assign-register" data-email="${escapeHtml(item.email)}"><option value="">Sans affectation</option>${registers.map(register => `<option value="${register.id}" ${item.registerId === register.id ? 'selected' : ''}>${escapeHtml(register.name)}</option>`).join('')}</select>` : '—'}</td><td>${item.email !== localStorage.getItem(SESSION_KEY) && isAdmin ? `<span class="admin-actions"><button class="icon-btn js-edit-user" type="button" data-email="${escapeHtml(item.email)}" aria-label="Modifier ${escapeHtml(item.name)}">${iconEdit()}</button><button class="icon-btn js-delete-user" type="button" data-email="${escapeHtml(item.email)}" aria-label="Supprimer ${escapeHtml(item.name)}">${iconTrash()}</button></span>` : '—'}</td></tr>`).join('');
  const registerFilter = document.getElementById('saleRegisterFilter');
  const cashierFilter = document.getElementById('saleCashierFilter');
  const previousRegister = registerFilter.value, previousCashier = cashierFilter.value;
  registerFilter.innerHTML = '<option value="all">Tous les espaces</option>' + registers.map(register => `<option value="${register.id}">${escapeHtml(register.name)}</option>`).join('');
  cashierFilter.innerHTML = '<option value="all">Tous les opérateurs</option>' + users.filter(item => item.role === 'cashier').map(item => `<option value="${escapeHtml(item.email)}">${escapeHtml(item.name)}</option>`).join('');
  registerFilter.value = previousRegister; cashierFilter.value = previousCashier;
  renderSalesLog();
  document.querySelectorAll('.js-delete-register').forEach(button => button.addEventListener('click', async () => { try { await apiRequest(`/sales-spaces/${button.dataset.id}`, { method: 'DELETE' }); await renderAdmin(); showToast('Espace supprimé.', 'success'); } catch (error) { showToast(error.message, 'danger'); } }));
  document.querySelectorAll('.js-delete-user').forEach(button => button.addEventListener('click', async () => { const item = users.find(entry => entry.email === button.dataset.email); if (!item) return; try { await apiRequest(`/users/${item.id}`, { method: 'DELETE' }); await renderAdmin(); showToast('Utilisateur supprimé.', 'success'); } catch (error) { showToast(error.message, 'danger'); } }));
  document.querySelectorAll('.js-edit-user').forEach(button => button.addEventListener('click', () => { const item = users.find(entry => entry.email === button.dataset.email); if (!item) return; document.getElementById('adminUserName').value = item.name; document.getElementById('adminUserEmail').value = item.email; document.getElementById('adminUserPassword').value = ''; document.getElementById('adminUserPassword').required = false; document.getElementById('adminUserRole').value = item.role; document.getElementById('adminUserForm').dataset.editId = item.id; document.getElementById('adminUserForm').dataset.editEmail = item.email; document.getElementById('adminUserSubmit').textContent = 'Enregistrer le compte'; document.getElementById('adminUserName').focus(); }));
  document.querySelectorAll('.js-assign-register').forEach(select => select.addEventListener('change', async () => { const item = users.find(entry => entry.email === select.dataset.email); if (!item) return; try { await apiRequest(`/users/${item.id}`, { method: 'PATCH', body: JSON.stringify({ sales_space_id: select.value ? Number(select.value) : null }) }); await renderAdmin(); showToast('Affectation mise à jour.', 'success'); } catch (error) { showToast(error.message, 'danger'); } }));
}

function renderSalesLog() {
  const registerId = document.getElementById('saleRegisterFilter').value;
  const cashierEmail = document.getElementById('saleCashierFilter').value;
  const registers = loadRegisters();
  const users = loadAdminUsers();
  const sales = loadSales().filter(sale => (registerId === 'all' || String(sale.sales_space_id ?? sale.registerId) === registerId) && (cashierEmail === 'all' || String(sale.cashier_id ?? sale.cashierEmail) === cashierEmail));
  document.getElementById('salesLog').innerHTML = sales.length ? sales.slice().reverse().map(sale => `<li class="sale-log-item"><strong>${formatDate(sale.sale_date || sale.date)}</strong><span>${escapeHtml(sale.cashier_name || users.find(user => user.email === sale.cashierEmail)?.name || sale.cashierEmail || '')}</span><span>${escapeHtml(sale.sales_space_name || registers.find(register => String(register.id) === String(sale.registerId))?.name || 'Espace supprimé')}</span><b>${fmtFCFA(Number(sale.total_amount ?? sale.total ?? 0))}</b></li>`).join('') : '<li class="empty-inline">Aucune commande enregistrée.</li>';
}

document.getElementById('adminUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('adminUserEmail').value.trim().toLowerCase();
  const editEmail = e.target.dataset.editEmail;
  const editId = e.target.dataset.editId;
  const name = document.getElementById('adminUserName').value.trim();
  const password = document.getElementById('adminUserPassword').value;
  const role = document.getElementById('adminUserRole').value;
  try {
    if (editId) {
      const update = { name, email, role };
      if (password) update.password = password;
      await apiRequest(`/users/${editId}`, { method: 'PATCH', body: JSON.stringify(update) });
    } else {
      const result = await apiRequest('/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
      if (role !== 'manager') await apiRequest(`/users/${result.user.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    }
    delete e.target.dataset.editId;
    delete e.target.dataset.editEmail;
    e.target.reset();
    document.getElementById('adminUserPassword').required = true;
    document.getElementById('adminUserSubmit').textContent = 'Créer le compte';
    await renderAdmin();
    showToast(editEmail ? 'Compte mis à jour.' : 'Compte créé.', 'success');
  } catch (error) { showToast(error.message, 'danger'); }
});
document.getElementById('cashRegisterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/sales-spaces', { method: 'POST', body: JSON.stringify({ name: document.getElementById('registerName').value.trim() }) });
    e.target.reset();
    await renderAdmin();
    showToast('Espace créé.', 'success');
  } catch (error) { showToast(error.message, 'danger'); }
});
document.getElementById('saleRegisterFilter').addEventListener('change', renderSalesLog);
document.getElementById('saleCashierFilter').addEventListener('change', renderSalesLog);

async function renderCashier() {
  const user = currentUser();
  try {
    backendRegisters = await apiRequest('/sales-spaces');
    backendSales = await apiRequest('/sales');
  } catch (error) { showToast(error.message, 'danger'); }
  const register = loadRegisters().find(item => String(item.id) === String(user.sales_space_id ?? user.registerId));
  document.getElementById('cashierRegisterTitle').textContent = register ? register.name : 'Aucun espace affecté';
  const todaySales = loadSales().filter(sale => (sale.cashier_id === user.id || sale.cashierEmail === user.email) && (sale.sale_date || sale.date) === todayIso());
  document.getElementById('cashierSalesCount').textContent = todaySales.length;
  document.getElementById('cashierProducts').innerHTML = state.products.map(product => `<button class="cashier-product" type="button" data-product-id="${product.id}"><span><strong class="cashier-product-name">${escapeHtml(product.name)}</strong><small class="cashier-product-stock">${product.stock} ${escapeHtml(product.unit)} disponibles</small></span><b class="cashier-product-price">${fmtFCFA(product.price)}</b></button>`).join('') || '<div class="empty-state"><p class="empty-title">Aucun produit disponible</p></div>';
  document.querySelectorAll('.cashier-product').forEach(button => button.addEventListener('click', () => addToCart(button.dataset.productId)));
  renderCart();
}

function addToCart(productId) { const product = productById(productId); if (!product || product.stock < 1) return; const item = cart.find(line => line.productId === productId); if (item && item.qty >= product.stock) return; if (item) item.qty += 1; else cart.push({ productId, qty: 1 }); renderCart(); }
function renderCart() { const lines = cart.map(line => ({ ...line, product: productById(line.productId) })).filter(line => line.product); const total = lines.reduce((sum, line) => sum + line.qty * line.product.price, 0); document.getElementById('cartCount').textContent = `${lines.reduce((sum, line) => sum + line.qty, 0)} article(s)`; document.getElementById('cartTotal').textContent = fmtFCFA(total); document.getElementById('cartList').innerHTML = lines.length ? lines.map(line => `<li class="cart-item"><span class="cart-item-name">${escapeHtml(line.product.name)}</span><span class="cart-item-qty">x${line.qty}</span><button class="cart-remove" type="button" data-product-id="${line.product.id}" aria-label="Retirer ${escapeHtml(line.product.name)}">×</button></li>`).join('') : '<li class="empty-inline">Le panier est vide.</li>'; document.querySelectorAll('.cart-remove').forEach(button => button.addEventListener('click', () => { cart = cart.filter(line => line.productId !== button.dataset.productId); renderCart(); })); document.getElementById('checkoutBtn').disabled = !lines.length; }
document.querySelectorAll('.payment-btn').forEach(button => button.addEventListener('click', () => { paymentType = button.dataset.payment; document.querySelectorAll('.payment-btn').forEach(item => item.classList.toggle('is-active', item === button)); }));
function printReceipt(sale, register, user, lines) { const receipt = window.open('', '_blank', 'width=420,height=640'); if (!receipt) return; receipt.document.write(`<html><head><title>Ticket YakiStock</title><style>body{font:14px Arial;padding:24px;color:#111}h1{font-size:20px}p{margin:7px 0}.line{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:8px 0}.total{font-size:18px;font-weight:bold;margin-top:16px}</style></head><body><h1>YakiStock</h1><p>${escapeHtml(register.name)}</p><p>${formatDate(sale.date)} | ${escapeHtml(user.name)}</p>${lines.map(line => `<div class="line"><span>${escapeHtml(line.product.name)} x${line.qty}</span><span>${fmtFCFA(line.qty * line.product.price)}</span></div>`).join('')}<p class="total">Total : ${fmtFCFA(sale.total)}</p><script>window.onload=function(){window.print();window.close();}</script></body></html>`); receipt.document.close(); }
document.getElementById('checkoutBtn').addEventListener('click', async () => {
  const user = currentUser();
  const register = loadRegisters().find(item => String(item.id) === String(user.sales_space_id ?? user.registerId));
  if (!register) { showToast('Aucun espace ne vous est affecté.', 'danger'); return; }
  const lines = cart.map(line => ({ ...line, product: productById(line.productId) }));
  if (lines.some(line => line.qty > line.product.stock)) { showToast('Stock insuffisant pour cette commande.', 'danger'); return; }
  try {
    const result = await apiRequest('/sales', { method: 'POST', body: JSON.stringify({ sales_space_id: Number(register.id), items: lines.map(line => ({ product_id: Number(line.product.id), quantity: line.qty })) }) });
    const sale = { date: todayIso(), total: result.total_amount };
    await connectBackend();
    cart = [];
    await renderCashier();
    showToast('Commande validée. Ticket prêt à imprimer.', 'success');
    printReceipt(sale, register, user, lines);
  } catch (error) { showToast(error.message, 'danger'); }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(API_TOKEN_KEY);
  localStorage.removeItem(API_USER_KEY);
  document.getElementById('appShell').hidden = true;
  document.getElementById('authShell').hidden = false;
  document.getElementById('loginForm').reset();
  showAuth('login');
});

const storedSession = localStorage.getItem(SESSION_KEY);
const validSession = storedSession && localStorage.getItem(API_TOKEN_KEY) && localStorage.getItem(API_USER_KEY) ? storedSession : null;
if (!validSession) localStorage.removeItem(SESSION_KEY);
document.getElementById('authShell').hidden = true;
document.getElementById('appShell').hidden = !validSession;
document.getElementById('homeShell').hidden = Boolean(validSession);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.movements)) {
      return { products: parsed.products.filter(product => product && typeof product === 'object'), movements: parsed.movements.filter(movement => movement && typeof movement === 'object'), viewMode: parsed.viewMode === 'table' ? 'table' : 'cards' };
    }
  } catch (e) { /* ignore corrupt state */ }
  return { products: [], movements: [], viewMode: 'cards' };
}

let state = loadState();
let apiAvailable = false;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeProduct(product) {
  return {
    ...product,
    id: String(product.id),
    category: product.category || 'General',
    purchasePrice: Number(product.purchasePrice ?? product.purchase_price ?? 0),
    stock: Number(product.stock ?? product.quantity ?? 0),
    min: Number(product.min ?? product.minimum_quantity ?? 0),
    max: Number(product.max ?? product.maximum_quantity ?? 1),
    unit: product.unit || 'unit'
  };
}

function normalizeMovement(movement) {
  return {
    ...movement,
    id: String(movement.id),
    productId: String(movement.productId ?? movement.product_id),
    type: movement.type || movement.movement_type,
    qty: Number(movement.qty ?? movement.quantity),
    date: movement.date || movement.movement_date,
    note: movement.note || ''
  };
}

async function connectBackend() {
  try {
    if (!localStorage.getItem(API_TOKEN_KEY)) return;
    const [remoteUser, remoteProducts, remoteMovements] = await Promise.all([apiRequest('/me'), apiRequest('/products'), apiRequest('/movements')]);
    localStorage.setItem(API_USER_KEY, JSON.stringify(remoteUser));
    state.products = remoteProducts.map(normalizeProduct);
    state.movements = remoteMovements.map(normalizeMovement);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    apiAvailable = true;
    renderAll();
    updateNetStatus();
  } catch (error) {
    apiAvailable = false;
    if (error.message === 'Jeton invalide' || error.message === 'Utilisateur introuvable') {
      localStorage.removeItem(API_TOKEN_KEY);
      localStorage.removeItem(API_USER_KEY);
      localStorage.removeItem(SESSION_KEY);
      showAuth('login');
    }
  }
}

function fmtFCFA(n) {
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}

function statusOf(p) {
  if (p.stock <= p.min * 0.5) return 'critical';
  if (p.stock <= p.min) return 'low';
  return 'ok';
}

function productById(id) {
  return state.products.find(p => p.id === id);
}

/* ===========================================================
   TABS
=========================================================== */
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

/* ===========================================================
   RENDER: OVERVIEW
=========================================================== */
function renderOverview() {
  const totalValue = state.products.reduce((s, p) => s + p.stock * p.price, 0);
  const alerts = state.products.filter(p => statusOf(p) !== 'ok');
  const critical = state.products.filter(p => statusOf(p) === 'critical');
  const recent = [...state.movements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon">${iconCoins()}</span>
      </div>
      <div class="stat-value">${fmtFCFA(totalValue)}</div>
      <div class="stat-label">Valeur globale du stock</div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon is-danger">${iconAlert()}</span>
      </div>
      <div class="stat-value">${alerts.length}</div>
      <div class="stat-label">Références sous le seuil (${critical.length} en rupture critique)</div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon is-success">${iconBox()}</span>
      </div>
      <div class="stat-value">${state.products.length}</div>
      <div class="stat-label">Références suivies</div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon">${iconArrows()}</span>
      </div>
      <div class="stat-value">${state.movements.length}</div>
      <div class="stat-label">Mouvements enregistrés</div>
    </div>
  `;

  document.getElementById('alertCount').textContent = alerts.length;
  const alertList = document.getElementById('alertList');
  alertList.innerHTML = alerts.length ? alerts.map(p => `
    <li class="alert-item">
      <span class="alert-mark ${statusOf(p) === 'low' ? 'is-warn' : ''}"></span>
      <span class="alert-text"><strong>${escapeHtml(p.name)}</strong> — ${p.stock} ${escapeHtml(p.unit)} restants
        <div class="alert-meta">Seuil minimum : ${p.min} ${escapeHtml(p.unit)}</div>
      </span>
    </li>
  `).join('') : '<li class="empty-inline">Aucune alerte pour le moment.</li>';

  const recentList = document.getElementById('recentMovements');
  recentList.innerHTML = recent.length ? recent.map(m => movementRow(m)).join('') : '<li class="empty-inline">Aucun mouvement pour le moment.</li>';
}

function movementRow(m) {
  const p = productById(m.productId);
  if (!p) return '';
  const isOut = m.type === 'out';
  return `
    <li class="movement-item">
      <span class="movement-icon ${isOut ? 'is-out' : ''}">${isOut ? iconArrowDown() : iconArrowUp()}</span>
      <span class="movement-text">${escapeHtml(p.name)}
        <div class="movement-meta">${formatDate(m.date)}${m.note ? ' · ' + escapeHtml(m.note) : ''}</div>
      </span>
      <span class="movement-qty ${isOut ? 'is-out' : 'is-in'}">${isOut ? '-' : '+'}${m.qty}</span>
    </li>
  `;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ===========================================================
   RENDER: STOCK (cards + table)
=========================================================== */
function populateCategoryFilter() {
  const select = document.getElementById('categoryFilter');
  const datalist = document.getElementById('categoryList');
  const cats = [...new Set(state.products.map(p => p.category))].sort();
  const current = select.value;
  select.innerHTML = '<option value="all">Toutes les catégories</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value = cats.includes(current) ? current : 'all';
  datalist.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
}

function filteredProducts() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const cat = document.getElementById('categoryFilter').value;
  return state.products.filter(p => {
    const matchesQ = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    const matchesCat = cat === 'all' || p.category === cat;
    return matchesQ && matchesCat;
  });
}

function renderStock() {
  populateCategoryFilter();
  const list = filteredProducts();
  const emptyState = document.getElementById('stockEmptyState');
  const hasProducts = state.products.length > 0;
  emptyState.hidden = list.length !== 0;

  document.getElementById('productGrid').hidden = state.viewMode !== 'cards' || list.length === 0;
  document.getElementById('tableWrap').hidden = state.viewMode !== 'table' || list.length === 0;

  document.getElementById('productGrid').innerHTML = list.map(productCard).join('');
  document.getElementById('tableBody').innerHTML = list.map(productRow).join('');

  document.querySelectorAll('.js-delete-product').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
  });
  document.querySelectorAll('.js-edit-product').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(btn.dataset.id));
  });
}

function statusLabel(s) {
  if (s === 'critical') return 'Rupture';
  if (s === 'low') return 'Stock bas';
  return 'Stock sain';
}

function productCard(p) {
  const s = statusOf(p);
  const pct = Math.min(100, Math.round((p.stock / p.max) * 100));
  return `
    <article class="product-card is-${s}">
      <div class="product-top">
        <div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-cat">${escapeHtml(p.category)}</div>
        </div>
        <span class="status-badge status-${s}">${statusLabel(s)}</span>
      </div>
      <div class="gauge-wrap">
        <div class="gauge-track"><div class="gauge-fill ${s === 'ok' ? '' : 'is-' + s}" style="width:${pct}%"></div></div>
        <div class="gauge-meta"><span>${p.stock} ${escapeHtml(p.unit)}</span><span>Capacité ${p.max}</span></div>
      </div>
      <div class="product-bottom">
        <div>
          <span class="product-price-label">Prix unitaire</span>
          <span class="product-price">${fmtFCFA(p.price)}</span>
        </div>
        <button type="button" class="icon-btn js-edit-product" data-id="${p.id}" aria-label="Modifier ${escapeHtml(p.name)}">${iconEdit()}</button>
        <button type="button" class="icon-btn js-delete-product" data-id="${p.id}" aria-label="Retirer ${escapeHtml(p.name)}">${iconTrash()}</button>
      </div>
    </article>
  `;
}

function productRow(p) {
  const s = statusOf(p);
  return `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${p.stock} ${escapeHtml(p.unit)}</td>
      <td>${p.min} ${escapeHtml(p.unit)}</td>
      <td><span class="status-badge status-${s}">${statusLabel(s)}</span></td>
      <td>${fmtFCFA(p.price)}</td>
      <td>${fmtFCFA(p.stock * p.price)}</td>
      <td><button type="button" class="icon-btn js-edit-product" data-id="${p.id}" aria-label="Modifier ${escapeHtml(p.name)}">${iconEdit()}</button> <button type="button" class="icon-btn js-delete-product" data-id="${p.id}" aria-label="Retirer ${escapeHtml(p.name)}">${iconTrash()}</button></td>
    </tr>
  `;
}

async function deleteProduct(id) {
  try {
    await apiRequest(`/products/${id}`, { method: 'DELETE' });
    state.products = state.products.filter(p => p.id !== id);
    state.movements = state.movements.filter(m => m.productId !== id);
    saveState();
    renderAll();
    showToast('Produit retiré du stock.', 'success');
  } catch (error) { showToast(error.message, 'danger'); }
}

document.getElementById('searchInput').addEventListener('input', renderStock);
document.getElementById('categoryFilter').addEventListener('change', renderStock);

document.getElementById('viewToggleBtn').addEventListener('click', () => {
  state.viewMode = state.viewMode === 'cards' ? 'table' : 'cards';
  saveState();
  renderStock();
});

/* ===========================================================
   ADD PRODUCT MODAL
=========================================================== */
const productModalOverlay = document.getElementById('productModalOverlay');

function openProductModal(productId) {
  const product = productId ? productById(productId) : null;
  document.getElementById('productForm').reset();
  document.getElementById('productForm').dataset.editId = productId || '';
  document.getElementById('productModalTitle').textContent = product ? 'Modifier le produit' : 'Nouveau produit';
  document.querySelector('#productForm button[type="submit"]').textContent = product ? 'Enregistrer les modifications' : 'Ajouter au stock';
  if (product) { document.getElementById('pName').value = product.name; document.getElementById('pCategory').value = product.category; document.getElementById('pPurchasePrice').value = product.purchasePrice || 0; document.getElementById('pPrice').value = product.price; document.getElementById('pStock').value = product.stock; document.getElementById('pMin').value = product.min; document.getElementById('pMax').value = product.max; document.getElementById('pUnit').value = product.unit; }
  populateCategoryFilter();
  productModalOverlay.hidden = false;
  document.getElementById('pName').focus();
}

document.getElementById('addProductBtn').addEventListener('click', openProductModal);
document.getElementById('emptyStateAddBtn').addEventListener('click', openProductModal);
document.getElementById('closeProductModal').addEventListener('click', () => { productModalOverlay.hidden = true; });
productModalOverlay.addEventListener('click', (e) => { if (e.target === productModalOverlay) productModalOverlay.hidden = true; });

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('pName').value.trim();
  const category = document.getElementById('pCategory').value.trim();
  const price = Number(document.getElementById('pPrice').value);
  const purchasePrice = Number(document.getElementById('pPurchasePrice').value);
  const stock = Number(document.getElementById('pStock').value);
  const min = Number(document.getElementById('pMin').value);
  const max = Number(document.getElementById('pMax').value);
  const unit = document.getElementById('pUnit').value.trim();

  if (!name || !category || !unit || !Number.isFinite(price) || !Number.isFinite(purchasePrice) || !Number.isFinite(stock) || !Number.isFinite(min) || !Number.isFinite(max) || price < 0 || purchasePrice < 0 || stock < 0 || min < 0 || max <= 0) return;

  const editId = e.target.dataset.editId;
  try {
    const payload = { name, description: '', category, price, quantity: stock };
    if (editId) {
      await apiRequest(`/products/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      Object.assign(productById(editId), { name, category, price, purchasePrice, stock, min, max, unit });
      delete e.target.dataset.editId;
      document.getElementById('productModalTitle').textContent = 'Nouveau produit';
      document.querySelector('#productForm button[type="submit"]').textContent = 'Ajouter au stock';
    } else {
      const result = await apiRequest('/products', { method: 'POST', body: JSON.stringify(payload) });
      state.products.push(normalizeProduct({ id: result.id, name, category, price, purchasePrice, stock, min, max, unit }));
    }
    saveState();
    productModalOverlay.hidden = true;
    renderAll();
    showToast(editId ? 'Produit mis à jour.' : 'Produit ajouté au stock.', 'success');
  } catch (error) { showToast(error.message, 'danger'); }
});

/* ===========================================================
   MOVEMENTS TAB
=========================================================== */
let movementType = 'in';

function populateMovementProductSelect() {
  const select = document.getElementById('movProduct');
  const current = select.value;
  if (state.products.length === 0) {
    select.innerHTML = '<option value="" disabled selected>Ajoutez d\'abord un produit</option>';
    select.disabled = true;
  } else {
    select.disabled = false;
    select.innerHTML = state.products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if (state.products.some(p => p.id === current)) select.value = current;
  }
}

document.querySelectorAll('.segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    movementType = btn.dataset.type;
  });
});

document.getElementById('movDate').valueAsDate = new Date();

document.getElementById('movementForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const productId = document.getElementById('movProduct').value;
  const qty = Number(document.getElementById('movQty').value);
  const date = document.getElementById('movDate').value;
  const note = document.getElementById('movNote').value.trim();
  const product = productById(productId);
  if (!product || !Number.isFinite(qty) || qty <= 0 || !date) return;

  if (movementType === 'out' && qty > product.stock) {
    showToast(`Stock insuffisant : ${product.stock} ${product.unit} disponibles.`, 'danger');
    return;
  }

  try {
    const result = await apiRequest('/movements', {
      method: 'POST',
      body: JSON.stringify({ product_id: Number(productId), movement_type: movementType, quantity: qty, movement_date: date, note })
    });
    product.stock = result.quantity;
    state.movements.unshift(normalizeMovement({ id: result.id, product_id: productId, movement_type: movementType, quantity: qty, movement_date: date, note }));
    saveState();
    e.target.reset();
    document.getElementById('movDate').valueAsDate = new Date();
    renderAll();
    showToast('Mouvement enregistré.', 'success');
  } catch (error) { showToast(error.message, 'danger'); }
});

function renderMovementsTab() {
  populateMovementProductSelect();
  const list = document.getElementById('fullMovementList');
  const sorted = [...state.movements].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.length ? sorted.map(m => movementRow(m)).join('') : '<li class="empty-inline">Aucun mouvement enregistré.</li>';
}

/* ===========================================================
   PREDICTIONS (heuristic "ML-style" analysis)
=========================================================== */
function computePrediction(p) {
  const outMovements = state.movements.filter(m => m.productId === p.id && m.type === 'out');
  const totalOut = outMovements.reduce((s, m) => s + m.qty, 0);
  const days = Math.max(1, new Set(state.movements.map(m => m.date)).size);
  const dailyRate = totalOut > 0 ? totalOut / days : Math.max(0.5, p.min / 30);
  const daysLeft = dailyRate > 0 ? Math.round(p.stock / dailyRate) : 999;
  const recommendedOrder = Math.max(0, Math.round(p.max * 0.7 - p.stock));
  return { dailyRate: Math.round(dailyRate * 10) / 10, daysLeft, recommendedOrder };
}

function renderPredictions() {
  const grid = document.getElementById('predictionGrid');

  if (state.products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <p class="empty-title">Aucune prédiction disponible</p>
        <p class="empty-sub">Ajoutez des produits et enregistrez des mouvements de stock pour générer des analyses.</p>
      </div>
    `;
    return;
  }

  const products = [...state.products].sort((a, b) => {
    const pa = computePrediction(a), pb = computePrediction(b);
    return pa.daysLeft - pb.daysLeft;
  });

  grid.innerHTML = products.map(p => {
    const pred = computePrediction(p);
    const urgent = pred.daysLeft <= 7;
    return `
      <div class="prediction-card">
        <div class="prediction-head">
          <span class="prediction-icon">${iconTrend()}</span>
          <div>
            <div class="prediction-title">${escapeHtml(p.name)}</div>
            <div class="prediction-sub">${escapeHtml(p.category)}</div>
          </div>
        </div>
        <div class="prediction-metric">
          <span class="value">${pred.daysLeft >= 999 ? '—' : pred.daysLeft}</span>
          <span class="unit">${pred.daysLeft >= 999 ? 'jours estimés : demande stable' : 'jours avant rupture estimée'}</span>
        </div>
        <p class="prediction-body">Rythme de sortie observé : environ ${pred.dailyRate} ${escapeHtml(p.unit)} / jour sur l'historique récent.</p>
        ${urgent || pred.recommendedOrder > 0 ? `
          <div class="prediction-reco">
            ${iconBolt()}
            <span>Recommandation : commander ${pred.recommendedOrder > 0 ? pred.recommendedOrder : p.min} ${escapeHtml(p.unit)} pour sécuriser le stock.</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

/* ===========================================================
   NETWORK STATUS — icon-based, no colored dot
=========================================================== */
function updateNetStatus() {
  const el = document.getElementById('netStatus');
  const label = document.getElementById('netStatusLabel');
  const online = navigator.onLine;
  el.dataset.state = online ? 'online' : 'offline';
  label.textContent = online ? 'En ligne' : 'Hors-ligne';
}
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);

/* ===========================================================
   PWA INSTALL
=========================================================== */
let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ignore registration failure */ });
  });
}

/* ===========================================================
   CHATBOT (simulated assistant)
=========================================================== */
const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

chatFab.addEventListener('click', () => {
  chatPanel.hidden = !chatPanel.hidden;
  if (!chatPanel.hidden && chatMessages.children.length === 0) {
    addChatBubble("Bonjour, je suis l'assistant YakiStock. Demandez-moi l'état d'un produit, les alertes de rupture ou la valeur du stock.", 'bot');
  }
});
document.getElementById('closeChatBtn').addEventListener('click', () => { chatPanel.hidden = true; });

function addChatBubble(text, from) {
  const div = document.createElement('div');
  div.className = 'chat-bubble is-' + from;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addChatBubble(text, 'user');
  chatInput.value = '';
  if (apiAvailable) {
    try {
      const response = await fetch(`${API_BASE}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const result = await response.json();
      addChatBubble(result.reply || generateBotReply(text), 'bot');
      return;
    } catch (error) { apiAvailable = false; }
  }
  addChatBubble(generateBotReply(text), 'bot');
});

function generateBotReply(text) {
  const q = text.toLowerCase();

  if (state.products.length === 0) {
    return "Aucun produit n'est encore enregistré. Ajoutez une référence depuis l'onglet Stock & Produits pour commencer.";
  }

  const alerts = state.products.filter(p => statusOf(p) !== 'ok');
  if (q.includes('rupture') || q.includes('alerte')) {
    if (alerts.length === 0) return "Aucune référence n'est actuellement en dessous de son seuil minimum.";
    const names = alerts.slice(0, 4).map(p => p.name).join(', ');
    return `${alerts.length} référence(s) sous le seuil : ${names}${alerts.length > 4 ? '…' : ''}.`;
  }

  if (q.includes('valeur') || q.includes('total')) {
    const totalValue = state.products.reduce((s, p) => s + p.stock * p.price, 0);
    return `La valeur globale actuelle du stock est de ${fmtFCFA(totalValue)}.`;
  }

  const matched = state.products.find(p => q.includes(p.name.toLowerCase().split(' ')[0].toLowerCase()));
  if (matched) {
    const s = statusOf(matched);
    return `${matched.name} : ${matched.stock} ${matched.unit} en stock (${statusLabel(s).toLowerCase()}), seuil minimum ${matched.min} ${matched.unit}.`;
  }

  if (q.includes('mouvement') || q.includes('sortie') || q.includes('entrée') || q.includes('entree')) {
    return `${state.movements.length} mouvement(s) enregistré(s) au total. Consultez l'onglet Entrées / Sorties pour le détail.`;
  }

  if (q.includes('merci')) return 'Avec plaisir. Autre chose sur le stock ?';

  return "Je peux vous renseigner sur les alertes de rupture, la valeur du stock, un produit précis ou l'historique des mouvements. Que souhaitez-vous savoir ?";
}

/* ===========================================================
   TOASTS
=========================================================== */
function showToast(message, type) {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' is-' + type : '');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/* ===========================================================
   ICONS (inline SVG, no emoji)
=========================================================== */
function iconCoins() { return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="9" r="6"/><path d="M14 14.5A6 6 0 108 8"/></svg>`; }
function iconAlert() { return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l10 18H2z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>`; }
function iconBox() { return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>`; }
function iconArrows() { return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7h11m0 0l-4-4m4 4l-4 4"/><path d="M17 17H6m0 0l4 4m-4-4l4-4"/></svg>`; }
function iconArrowUp() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function iconArrowDown() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12l7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function iconTrash() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function iconEdit() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" stroke-linejoin="round"/></svg>`; }
function iconTrend() { return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l5-6 4 3 5-8 4 5"/></svg>`; }
function iconBolt() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke-linejoin="round"/></svg>`; }

/* ===========================================================
   INIT
=========================================================== */
function renderAll() {
  renderOverview();
  renderStock();
  renderMovementsTab();
}

updateNetStatus();
renderAll();
if (validSession) applyRoleView();
connectBackend();
