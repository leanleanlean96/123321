'use strict';

require('./telemetry');

const express = require('express');
const cors = require('cors');

const db = require('./db');
const {
  register,
  httpMetricsMiddleware,
  todosCreatedTotal,
  todosCompletedTotal,
} = require('./metrics');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());
app.use(httpMetricsMiddleware);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'todo-backend' });
});

app.get('/ready', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not-ready', error: err.message });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/todos', async (req, res) => {
  const items = await db.listTodos();
  res.json(items);
});

app.post('/api/todos', async (req, res) => {
  const title = (req.body && req.body.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  const todo = await db.createTodo(title);
  todosCreatedTotal.inc();
  res.status(201).json(todo);
});

app.patch('/api/todos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const completed = Boolean(req.body && req.body.completed);
  const todo = await db.updateTodo(id, completed);
  if (!todo) {
    return res.status(404).json({ error: 'not found' });
  }
  if (completed) {
    todosCompletedTotal.inc();
  }
  res.json(todo);
});

app.delete('/api/todos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const ok = await db.deleteTodo(id);
  if (!ok) {
    return res.status(404).json({ error: 'not found' });
  }
  res.status(204).end();
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal server error' });
});

async function bootstrap() {
  let attempt = 0;
  while (attempt < 30) {
    try {
      await db.init();
      break;
    } catch (err) {
      attempt += 1;
      console.error(`[bootstrap] DB init attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  app.listen(PORT, HOST, () => {
    console.log(`todo-backend listening on http://${HOST}:${PORT}`);
  });
}

bootstrap();
