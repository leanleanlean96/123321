const API = (window.__API_URL__ || '').replace(/\/$/, '');

const listEl = document.getElementById('list');
const formEl = document.getElementById('add-form');
const titleEl = document.getElementById('title');
const statusEl = document.getElementById('status');

function setStatus(msg, isError) {
  statusEl.textContent = msg || '';
  statusEl.style.color = isError ? '#ef4444' : '#6b7280';
}

async function refresh() {
  try {
    const res = await fetch(`${API}/api/todos`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    listEl.innerHTML = '';
    for (const t of items) {
      const li = document.createElement('li');
      if (t.completed) li.classList.add('completed');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = t.completed;
      cb.addEventListener('change', () => toggleTodo(t.id, cb.checked));

      const span = document.createElement('span');
      span.className = 'text';
      span.textContent = t.title;

      const del = document.createElement('button');
      del.className = 'delete';
      del.textContent = '×';
      del.title = 'Удалить';
      del.addEventListener('click', () => deleteTodo(t.id));

      li.append(cb, span, del);
      listEl.appendChild(li);
    }
    setStatus(`${items.length} задач(и)`);
  } catch (err) {
    setStatus(`Ошибка загрузки: ${err.message}`, true);
  }
}

async function addTodo(title) {
  const res = await fetch(`${API}/api/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function toggleTodo(id, completed) {
  await fetch(`${API}/api/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  refresh();
}

async function deleteTodo(id) {
  await fetch(`${API}/api/todos/${id}`, { method: 'DELETE' });
  refresh();
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  if (!title) return;
  try {
    await addTodo(title);
    titleEl.value = '';
    refresh();
  } catch (err) {
    setStatus(`Не удалось добавить: ${err.message}`, true);
  }
});

refresh();
