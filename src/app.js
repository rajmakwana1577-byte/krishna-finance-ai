const STORAGE_KEY = 'krishnaFinanceAI:v1';
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = (date = today()) => date.slice(0, 7);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const defaults = {
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  incomes: [{ id: uid(), source: 'Salary Income', amount: 38000, date: today() }],
  expenses: [],
  emis: [],
  electricity: { daily: 90, days: new Date().getDate() }
};
let state = loadState();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaults);
  return { ...structuredClone(defaults), ...JSON.parse(saved) };
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
const sum = items => items.reduce((total, item) => total + Number(item.amount || 0), 0);
const byMonth = items => items.filter(item => monthKey(item.date || item.dueDate) === monthKey());
const electricityTotal = () => Number(state.electricity.daily || 0) * Number(state.electricity.days || 0);
function totals() {
  const totalIncome = sum(byMonth(state.incomes));
  const expenseTotal = sum(byMonth(state.expenses));
  const emiDue = sum(state.emis.filter(emi => !emi.paid && monthKey(emi.dueDate) === monthKey()));
  const power = electricityTotal();
  const totalExpenses = expenseTotal + emiDue + power;
  return { totalIncome, expenseTotal, emiDue, power, totalExpenses, savings: totalIncome - totalExpenses, currentBalance: totalIncome - totalExpenses };
}
function setText(id, value) { document.getElementById(id).textContent = value; }

function render() {
  document.documentElement.dataset.theme = state.theme;
  const t = totals();
  setText('currentBalance', currency.format(t.currentBalance));
  setText('totalIncome', currency.format(t.totalIncome));
  setText('totalExpenses', currency.format(t.totalExpenses));
  setText('savings', currency.format(t.savings));
  setText('emiDue', currency.format(t.emiDue));
  setText('electricityTotal', currency.format(t.power));
  setText('dailyElectricityMetric', currency.format(state.electricity.daily));
  setText('balanceInsight', t.savings >= 0 ? 'Great! Your monthly cash flow is positive.' : 'Attention needed: expenses are higher than income.');
  setText('chartMonth', new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }));
  document.getElementById('dailyElectricityInput').value = state.electricity.daily;
  document.getElementById('electricityDays').value = state.electricity.days;
  renderList('incomeList', state.incomes, item => `${item.source}`, item => item.date, 'incomes');
  renderList('expenseList', state.expenses, item => item.category, item => item.date, 'expenses');
  renderList('emiList', state.emis, item => `${item.name} ${item.paid ? '• Paid' : '• Due'}`, item => item.dueDate, 'emis', true);
  renderSummary(t); renderReports(t); drawFinanceChart(t); drawCategoryChart(); saveState();
}

function renderList(id, items, title, subtitle, collection, canToggle = false) {
  const el = document.getElementById(id);
  el.innerHTML = items.length ? '' : '<article class="list-item glass-card"><div>No entries yet</div></article>';
  items.slice().reverse().forEach(item => {
    const row = document.createElement('article'); row.className = 'list-item glass-card';
    row.innerHTML = `<div><strong>${title(item)}</strong><br><small>${subtitle(item)} • ${currency.format(item.amount)}</small></div><div class="item-actions">${canToggle ? '<button class="chip" data-toggle>Paid</button>' : ''}<button class="chip" data-delete>Delete</button></div>`;
    row.querySelector('[data-delete]').onclick = () => { state[collection] = state[collection].filter(entry => entry.id !== item.id); render(); };
    const toggle = row.querySelector('[data-toggle]'); if (toggle) toggle.onclick = () => { item.paid = !item.paid; render(); };
    el.appendChild(row);
  });
}
function renderSummary(t) {
  const cards = [['Income', t.totalIncome], ['Daily Expenses', t.expenseTotal], ['EMI Due', t.emiDue], ['Electricity', t.power], ['Savings', t.savings], ['Balance', t.currentBalance]];
  document.getElementById('summaryCards').innerHTML = cards.map(([label, val]) => `<article class="metric glass-card"><span>${label}</span><strong>${currency.format(val)}</strong></article>`).join('');
}
function renderReports(t) {
  document.getElementById('reportText').innerHTML = `<article class="metric glass-card"><span>Savings Rate</span><strong>${t.totalIncome ? Math.round((t.savings / t.totalIncome) * 100) : 0}%</strong></article><article class="metric glass-card"><span>Largest Expense Category</span><strong>${largestCategory()}</strong></article>`;
}
function largestCategory() {
  const map = state.expenses.reduce((acc, exp) => ({ ...acc, [exp.category]: (acc[exp.category] || 0) + Number(exp.amount) }), {});
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
}
function drawBars(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId), ctx = canvas.getContext('2d'), max = Math.max(...values, 1);
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.font = '22px system-ui'; ctx.textBaseline = 'middle';
  values.forEach((value, i) => { const x = 45 + i * (canvas.width - 90) / values.length, h = (value / max) * 210; ctx.fillStyle = colors[i % colors.length]; ctx.roundRect(x, 250 - h, 58, h, 18); ctx.fill(); ctx.fillStyle = getComputedStyle(document.body).color; ctx.fillText(labels[i], x - 6, 286); });
}
function drawFinanceChart(t) { drawBars('financeChart', ['Income', 'Expenses', 'Savings'], [t.totalIncome, t.totalExpenses, Math.max(t.savings, 0)], ['#6750a4', '#ba1a1a', '#0f766e']); }
function drawCategoryChart() { const data = Object.entries(state.expenses.reduce((a, e) => ({ ...a, [e.category]: (a[e.category] || 0) + Number(e.amount) }), {})).slice(0, 5); drawBars('categoryChart', data.map(d => d[0].slice(0, 8)), data.map(d => d[1]), ['#6750a4', '#0f766e', '#f59e0b', '#db2777']); }
function bindForm(id, collection, mapper) { document.getElementById(id).addEventListener('submit', event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); state[collection].push({ id: uid(), ...mapper(data) }); event.target.reset(); event.target.querySelector('[type=date]').value = today(); render(); }); }

bindForm('incomeForm', 'incomes', d => ({ source: d.source, amount: Number(d.amount), date: d.date }));
bindForm('expenseForm', 'expenses', d => ({ category: d.category, amount: Number(d.amount), date: d.date }));
bindForm('emiForm', 'emis', d => ({ name: d.name, amount: Number(d.amount), dueDate: d.dueDate, paid: d.paid === 'on' }));
document.querySelectorAll('input[type=date]').forEach(input => { input.value = today(); });
document.querySelectorAll('.bottom-nav button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.view,.bottom-nav button').forEach(el => el.classList.remove('active')); document.getElementById(button.dataset.view).classList.add('active'); button.classList.add('active'); }));
document.getElementById('themeToggle').onclick = () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; render(); };
document.getElementById('electricityForm').onsubmit = event => { event.preventDefault(); state.electricity = { daily: Number(event.target.daily.value), days: Number(event.target.days.value) }; render(); };
document.getElementById('exportData').onclick = () => { document.getElementById('exportOutput').value = JSON.stringify(state, null, 2); };
document.getElementById('clearData').onclick = () => { if (confirm('Clear all Krishna Finance AI data?')) { localStorage.removeItem(STORAGE_KEY); state = structuredClone(defaults); render(); } };
document.querySelector('[data-reset="income"]').onclick = () => { state.incomes = structuredClone(defaults.incomes); render(); };
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
render();
  
