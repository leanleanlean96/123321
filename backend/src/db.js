'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listTodos() {
  const res = await pool.query('SELECT id, title, completed, created_at FROM todos ORDER BY id DESC');
  return res.rows;
}

async function createTodo(title) {
  const res = await pool.query(
    'INSERT INTO todos (title) VALUES ($1) RETURNING id, title, completed, created_at',
    [title],
  );
  return res.rows[0];
}

async function updateTodo(id, completed) {
  const res = await pool.query(
    'UPDATE todos SET completed = $1 WHERE id = $2 RETURNING id, title, completed, created_at',
    [completed, id],
  );
  return res.rows[0];
}

async function deleteTodo(id) {
  const res = await pool.query('DELETE FROM todos WHERE id = $1', [id]);
  return res.rowCount > 0;
}

async function ping() {
  await pool.query('SELECT 1');
}

module.exports = { init, listTodos, createTodo, updateTodo, deleteTodo, ping };
