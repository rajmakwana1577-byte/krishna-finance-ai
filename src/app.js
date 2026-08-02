const STORAGE_KEY = 'krishnaFinanceAI:v1';
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = (date = today()) => date.slice(0, 7);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const EXPENSE_CATEGORIES = [
  'Grocery',
  'Vegetables',
  'Milk',
  'Shopping',
  'Petrol',
  'Food',
  'Medicine',
  'Mobile Recharge',
  'Internet',
  'Travel',
  'House Rent',
  'Entertainment',
  'Other'
];

const defaults = {
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  salary: { amount: 38000 },
  businessIncomes: [],
  otherIncomes: [],
  expenses: [],
  emis: [],
  electricity: { daily: 90, days: new Date().getDate() }
};

let state = loadState();

// Migration: Convert old expenses structure to new one
function migrateState(saved) {
  if (!saved) return structuredClone(defaults);
  
  const parsed = JSON.parse(saved);
  
  // If old 'incomes' array exists, migrate it
  if (parsed.incomes && Array.isArray(parsed.incomes)) {
    parsed.incomes.forEach(income => {
      if (income.source === 'Salary Income') {
        parsed.salary = { amount: income.amount };
      } else {
        if (!parsed.businessIncomes) parsed.businessIncomes = [];
        parsed.businessIncomes.push({
          id: income.id,
          description: income.source,
          amount: income.amount,
          date: income.date,
          notes: ''
        });
      }
    });
    delete parsed.incomes;
  }
  
  // Migrate old expenses to new format (add notes field if missing)
  if (parsed.expenses && Array.isArray(parsed.expenses)) {
    parsed.expenses = parsed.expenses.map(expense => ({
      ...expense,
      notes: expense.notes || ''
    }));
  }
  
  // Ensure all new properties exist
  if (!parsed.salary) parsed.salary = structuredClone(defaults.salary);
  if (!parsed.businessIncomes) parsed.businessIncomes = [];
  if (!parsed.otherIncomes) parsed.otherIncomes = [];
  if (!parsed.expenses) parsed.expenses = [];
  if (!parsed.emis) parsed.emis = [];
  if (!parsed.electricity) parsed.electricity = structuredClone(defaults.electricity);
  if (!parsed.theme) parsed.theme = defaults.theme;
  
  return parsed;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return migrateState(saved);
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

const sum = items => items.reduce((total, item) => total + Number(item.amount || 0), 0);
const byMonth = items => items.filter(item => monthKey(item.date || item.dueDate) === monthKey());
const electricityTotal = () => Number(state.electricity.daily || 0) * Number(state.electricity.days || 0);

function getCategoryWiseExpenses() {
  const thisMonth = byMonth(state.expenses);
  const categoryMap = thisMonth.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + Number(exp.amount);
    return acc;
  }, {});
  return categoryMap;
}

function totals() {
  const salaryIncome = Number(state.salary?.amount || 0);
  const businessIncome = sum(byMonth(state.businessIncomes));
  const otherIncome = sum(byMonth(state.otherIncomes));
  const totalIncome = salaryIncome + businessIncome + otherIncome;
  
  const expenseTotal = sum(byMonth(state.expenses));
  const emiDue = sum(state.emis.filter(emi => !emi.paid && monthKey(emi.dueDate) === monthKey()));
  const power = electricityTotal();
  const totalExpenses = expenseTotal + emiDue + power;
  
  return { 
    totalIncome, 
    salaryIncome, 
    businessIncome, 
    otherIncome,
    expenseTotal, 
    emiDue, 
    power, 
    totalExpenses, 
    savings: totalIncome - totalExpenses, 
    currentBalance: totalIncome - totalExpenses 
  };
}

function setText(id, value) { 
  const el = document.getElementById(id);
  if (el) el.textContent = value; 
}

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
  
  // Render Income Module
  renderSalarySection(t);
  setText('businessMonthTotal', currency.format(t.businessIncome));
  setText('otherMonthTotal', currency.format(t.otherIncome));
  renderIncomeList('businessIncomeList', state.businessIncomes, 'businessIncomes');
  renderIncomeList('otherIncomeList', state.otherIncomes, 'otherIncomes');
  
  document.getElementById('dailyElectricityInput').value = state.electricity.daily;
  document.getElementById('electricityDays').value = state.electricity.days;
  
  // Render Expenses Module
  setText('expenseMonthTotal', currency.format(t.expenseTotal));
  renderExpenseList('expenseList', state.expenses);
  renderCategoryWiseTotals();
  
  renderList('emiList', state.emis, item => `${item.name} ${item.paid ? '• Paid' : '• Due'}`, item => item.dueDate, 'emis', true);
  
  renderSummary(t); 
  renderReports(t); 
  drawFinanceChart(t); 
  drawCategoryChart(); 
  saveState();
}

function renderSalarySection(t) {
  setText('salaryDisplay', currency.format(state.salary?.amount || 0));
  setText('salaryMonthDisplay', currency.format(state.salary?.amount || 0));
}

function renderIncomeList(id, items, collection) {
  const el = document.getElementById(id);
  el.innerHTML = items.length ? '' : '<article class="list-item glass-card"><div>No entries yet</div></article>';
  items.slice().reverse().forEach(item => {
    const row = document.createElement('article');
    row.className = 'list-item glass-card';
    const noteText = item.notes ? `<br><small class="note">${item.notes}</small>` : '';
    row.innerHTML = `<div><strong>${item.description || item.source}</strong><br><small>${item.date} • ${currency.format(item.amount)}</small>${noteText}</div><div class="item-actions"><button class="icon-button" data-edit data-id="${item.id}">✎</button><button class="icon-button" data-delete data-id="${item.id}">🗑</button></div>`;
    
    row.querySelector('[data-delete]').onclick = () => { 
      state[collection] = state[collection].filter(entry => entry.id !== item.id); 
      render(); 
    };
    
    row.querySelector('[data-edit]').onclick = () => {
      openEditIncomeForm(item, collection);
    };
    
    el.appendChild(row);
  });
}

function openEditIncomeForm(item, collection) {
  const form = collection === 'businessIncomes' ? 'businessIncomeForm' : 'otherIncomeForm';
  const formEl = document.getElementById(form);
  
  // Populate form with existing data
  formEl.elements[0].value = item.description || item.source;
  formEl.elements[1].value = item.amount;
  formEl.elements[2].value = item.date;
  formEl.elements[3].value = item.notes || '';
  
  // Change button text and handler
  const submitBtn = formEl.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  const originalOnSubmit = formEl.onsubmit;
  
  submitBtn.textContent = 'Update ' + (collection === 'businessIncomes' ? 'Business' : 'Other') + ' Income';
  
  formEl.onsubmit = (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(formEl));
    const index = state[collection].findIndex(i => i.id === item.id);
    if (index >= 0) {
      state[collection][index] = {
        id: item.id,
        description: data.description || data.source,
        source: data.source,
        amount: Number(data.amount),
        date: data.date,
        notes: data.notes || ''
      };
    }
    formEl.reset();
    submitBtn.textContent = originalText;
    formEl.onsubmit = originalOnSubmit;
    render();
  };
}

function renderExpenseList(id, items, filterCategory = null) {
  const el = document.getElementById(id);
  let filtered = items;
  
  if (filterCategory) {
    filtered = items.filter(item => item.category === filterCategory);
  }
  
  filtered = byMonth(filtered);
  
  el.innerHTML = filtered.length ? '' : '<article class="list-item glass-card"><div>No entries yet</div></article>';
  filtered.slice().reverse().forEach(item => {
    const row = document.createElement('article');
    row.className = 'list-item glass-card';
    const noteText = item.notes ? `<br><small class="note">${item.notes}</small>` : '';
    row.innerHTML = `<div><strong>${item.category}</strong><br><small>${item.date} • ${currency.format(item.amount)}</small>${noteText}</div><div class="item-actions"><button class="icon-button" data-edit data-id="${item.id}">✎</button><button class="icon-button" data-delete data-id="${item.id}">🗑</button></div>`;
    
    row.querySelector('[data-delete]').onclick = () => { 
      state.expenses = state.expenses.filter(entry => entry.id !== item.id); 
      render(); 
    };
    
    row.querySelector('[data-edit]').onclick = () => {
      openEditExpenseForm(item);
    };
    
    el.appendChild(row);
  });
}

function openEditExpenseForm(item) {
  const formEl = document.getElementById('expenseForm');
  
  // Populate form with existing data
  formEl.elements[0].value = item.category;
  formEl.elements[1].value = item.amount;
  formEl.elements[2].value = item.date;
  formEl.elements[3].value = item.notes || '';
  
  // Change button text and handler
  const submitBtn = formEl.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  const originalOnSubmit = formEl.onsubmit;
  
  submitBtn.textContent = 'Update Expense';
  
  formEl.onsubmit = (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(formEl));
    const index = state.expenses.findIndex(e => e.id === item.id);
    if (index >= 0) {
      state.expenses[index] = {
        id: item.id,
        category: data.category,
        amount: Number(data.amount),
        date: data.date,
        notes: data.notes || ''
      };
    }
    formEl.reset();
    submitBtn.textContent = originalText;
    formEl.onsubmit = originalOnSubmit;
    render();
  };
}

function renderCategoryWiseTotals() {
  const categoryMap = getCategoryWiseExpenses();
  const container = document.getElementById('expenseCategoryTotals');
  if (!container) return;
  
  if (Object.keys(categoryMap).length === 0) {
    container.innerHTML = '<div class="list-item glass-card"><div>No expenses yet</div></div>';
    return;
  }
  
  container.innerHTML = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => `<article class="category-total glass-card"><div><strong>${cat}</strong></div><strong>${currency.format(total)}</strong></article>`)
    .join('');
}

function filterExpensesByCategory(category) {
  const el = document.getElementById('expenseList');
  renderExpenseList('expenseList', state.expenses, category);
}

function clearExpenseFilter() {
  document.getElementById('expenseCategoryFilter').value = '';
  document.getElementById('expenseSearchInput').value = '';
  renderExpenseList('expenseList', state.expenses);
}

function searchExpenses(query) {
  const el = document.getElementById('expenseList');
  const lowerQuery = query.toLowerCase();
  const filtered = byMonth(state.expenses.filter(exp => 
    exp.category.toLowerCase().includes(lowerQuery) || 
    (exp.notes && exp.notes.toLowerCase().includes(lowerQuery))
  ));
  
  el.innerHTML = filtered.length ? '' : '<article class="list-item glass-card"><div>No matching expenses</div></article>';
  filtered.slice().reverse().forEach(item => {
    const row = document.createElement('article');
    row.className = 'list-item glass-card';
    const noteText = item.notes ? `<br><small class="note">${item.notes}</small>` : '';
    row.innerHTML = `<div><strong>${item.category}</strong><br><small>${item.date} • ${currency.format(item.amount)}</small>${noteText}</div><div class="item-actions"><button class="icon-button" data-edit data-id="${item.id}">✎</button><button class="icon-button" data-delete data-id="${item.id}">🗑</button></div>`;
    
    row.querySelector('[data-delete]').onclick = () => { 
      state.expenses = state.expenses.filter(entry => entry.id !== item.id); 
      render(); 
    };
    
    row.querySelector('[data-edit]').onclick = () => {
      openEditExpenseForm(item);
    };
    
    el.appendChild(row);
  });
}

function renderList(id, items, title, subtitle, collection, canToggle = false) {
  const el = document.getElementById(id);
  el.innerHTML = items.length ? '' : '<article class="list-item glass-card"><div>No entries yet</div></article>';
  items.slice().reverse().forEach(item => {
    const row = document.createElement('article');
    row.className = 'list-item glass-card';
    row.innerHTML = `<div><strong>${title(item)}</strong><br><small>${subtitle(item)} • ${currency.format(item.amount)}</small></div><div class="item-actions">${canToggle ? '<button class="chip" data-toggle>Mark Paid</button>' : ''}<button class="icon-button" data-delete>🗑</button></div>`;
    row.querySelector('[data-delete]').onclick = () => { 
      state[collection] = state[collection].filter(entry => entry.id !== item.id); 
      render(); 
    };
    const toggle = row.querySelector('[data-toggle]'); 
    if (toggle) toggle.onclick = () => { 
      item.paid = !item.paid; 
      render(); 
    };
    el.appendChild(row);
  });
}

function renderSummary(t) {
  const cards = [
    ['Salary', t.salaryIncome], 
    ['Business', t.businessIncome],
    ['Other Income', t.otherIncome],
    ['Daily Expenses', t.expenseTotal], 
    ['EMI Due', t.emiDue], 
    ['Electricity', t.power], 
    ['Savings', t.savings], 
    ['Balance', t.currentBalance]
  ];
  document.getElementById('summaryCards').innerHTML = cards.map(([label, val]) => `<article class="metric glass-card"><span>${label}</span><strong>${currency.format(val)}</strong></article>`).join('');
}

function renderReports(t) {
  const savingsRate = t.totalIncome ? Math.round((t.savings / t.totalIncome) * 100) : 0;
  const topCategory = largestCategory();
  const categoryMap = getCategoryWiseExpenses();
  const topCategoryAmount = categoryMap[topCategory] || 0;
  
  document.getElementById('reportText').innerHTML = `
    <article class="metric glass-card"><span>Savings Rate</span><strong>${savingsRate}%</strong></article>
    <article class="metric glass-card"><span>Top Expense Category</span><strong>${topCategory}</strong></article>
    <article class="metric glass-card"><span>Top Category Amount</span><strong>${currency.format(topCategoryAmount)}</strong></article>
    <article class="metric glass-card"><span>Monthly Salary</span><strong>${currency.format(t.salaryIncome)}</strong></article>
    <article class="metric glass-card"><span>Variable Income</span><strong>${currency.format(t.businessIncome + t.otherIncome)}</strong></article>
  `;
}

function largestCategory() {
  const categoryMap = getCategoryWiseExpenses();
  return Object.entries(categoryMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
}

function drawBars(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const max = Math.max(...values, 1);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '22px system-us';
  ctx.textBaseline = 'middle';
  values.forEach((value, i) => {
    const x = 45 + i * (canvas.width - 90) / values.length;
    const h = (value / max) * 210;
    ctx.fillStyle = colors[i % colors.length];
    ctx.roundRect(x, 250 - h, 58, h, 18);
    ctx.fill();
    ctx.fillStyle = 'var(--text)';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + 29, 270);
    ctx.textAlign = 'center';
    ctx.fillText(currency.format(value), x + 29, 290);
  });
}

function drawFinanceChart(t) { 
  drawBars('financeChart', ['Income', 'Expenses', 'Savings'], [t.totalIncome, t.totalExpenses, Math.max(t.savings, 0)], ['#6750a4', '#ba1a1a', '#0f766e']); 
}

function drawCategoryChart() { 
  const categoryMap = getCategoryWiseExpenses();
  const data = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (data.length) {
    const labels = data.map(d => d[0]);
    const values = data.map(d => d[1]);
    drawBars('categoryChart', labels, values, ['#6750a4', '#ba1a1a', '#0f766e', '#049aca', '#f4a460']);
  }
}

// Form Bindings
function bindForm(id, collection, mapper) { 
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener('submit', event => { 
    event.preventDefault(); 
    const data = Object.fromEntries(new FormData(form));
    state[collection].push({ id: uid(), ...mapper(data) });
    form.reset();
    document.querySelectorAll('input[type=date]').forEach(input => { input.value = today(); });
    render();
  });
}

// Setup Forms
bindForm('businessIncomeForm', 'businessIncomes', d => ({ 
  description: d.description, 
  amount: Number(d.amount), 
  date: d.date,
  notes: d.notes || ''
}));

bindForm('otherIncomeForm', 'otherIncomes', d => ({ 
  source: d.source, 
  amount: Number(d.amount), 
  date: d.date,
  notes: d.notes || ''
}));

bindForm('expenseForm', 'expenses', d => ({ 
  category: d.category, 
  amount: Number(d.amount), 
  date: d.date,
  notes: d.notes || ''
}));

bindForm('emiForm', 'emis', d => ({ name: d.name, amount: Number(d.amount), dueDate: d.dueDate, paid: d.paid === 'on' }));

// Salary Controls
document.getElementById('editSalaryBtn').onclick = () => {
  document.getElementById('editSalaryForm').style.display = 'block';
  document.getElementById('salaryInput').value = state.salary?.amount || 38000;
  document.getElementById('salaryInput').focus();
};

document.getElementById('saveSalaryBtn').onclick = () => {
  const newAmount = Number(document.getElementById('salaryInput').value);
  if (newAmount >= 0) {
    state.salary.amount = newAmount;
    document.getElementById('editSalaryForm').style.display = 'none';
    render();
  }
};

document.getElementById('cancelSalaryBtn').onclick = () => {
  document.getElementById('editSalaryForm').style.display = 'none';
};

// Expense Search
const expenseSearchInput = document.getElementById('expenseSearchInput');
if (expenseSearchInput) {
  expenseSearchInput.addEventListener('input', (e) => {
    if (e.target.value.trim()) {
      searchExpenses(e.target.value);
    } else {
      clearExpenseFilter();
    }
  });
}

// Expense Category Filter
const expenseCategoryFilter = document.getElementById('expenseCategoryFilter');
if (expenseCategoryFilter) {
  expenseCategoryFilter.addEventListener('change', (e) => {
    if (e.target.value) {
      filterExpensesByCategory(e.target.value);
    } else {
      clearExpenseFilter();
    }
  });
}

// General Controls
document.querySelectorAll('input[type=date]').forEach(input => { input.value = today(); });

document.querySelectorAll('.bottom-nav button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.view,.bottom-nav button').forEach(el => el.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(button.dataset.view).classList.add('active');
}));

document.getElementById('themeToggle').onclick = () => { 
  state.theme = state.theme === 'dark' ? 'light' : 'dark'; 
  render(); 
};

document.getElementById('electricityForm').onsubmit = event => { 
  event.preventDefault(); 
  state.electricity = { daily: Number(event.target.daily.value), days: Number(event.target.days.value) }; 
  render();
};

document.getElementById('exportData').onclick = () => { 
  document.getElementById('exportOutput').value = JSON.stringify(state, null, 2); 
};

document.getElementById('clearData').onclick = () => { 
  if (confirm('Clear all Krishna Finance AI data?')) { 
    localStorage.removeItem(STORAGE_KEY); 
    state = structuredClone(defaults); 
    render(); 
  } 
};

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));

render();
