const express = require('express');
const { v4: uuid } = require('uuid');
const cronParser = require('cron-parser');
const cron = require('node-cron');
const db = require('../db');
const { scheduleJob, unscheduleJob, executeJob } = require('../scheduler');

const router = express.Router();

function nextRunTimes(schedule, count = 3) {
  try {
    const interval = cronParser.parseExpression(schedule);
    const runs = [];
    for (let i = 0; i < count; i++) runs.push(interval.next().toISOString());
    return runs;
  } catch {
    return [];
  }
}

// List all jobs with their next scheduled run times
router.get('/', (req, res) => {
  const jobs = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  const withPreview = jobs.map((j) => ({
    ...j,
    enabled: !!j.enabled,
    nextRuns: j.enabled ? nextRunTimes(j.schedule) : [],
  }));
  res.json(withPreview);
});

// Validate a cron expression and preview upcoming runs (no job created)
router.post('/validate-schedule', (req, res) => {
  const { schedule } = req.body;
  const valid = cron.validate(schedule || '');
  res.json({ valid, nextRuns: valid ? nextRunTimes(schedule) : [] });
});

// Create a job
router.post('/', (req, res) => {
  const {
    name, schedule, type, target, timeout_ms, retries, enabled,
    expected_status, keyword_match, public_status,
  } = req.body;

  if (!name || !schedule || !type || !target) {
    return res.status(400).json({ error: 'name, schedule, type, and target are required' });
  }
  if (!['http', 'shell'].includes(type)) {
    return res.status(400).json({ error: "type must be 'http' or 'shell'" });
  }
  if (!cron.validate(schedule)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }

  const job = {
    id: uuid(),
    name,
    schedule,
    type,
    target,
    timeout_ms: timeout_ms || 30000,
    retries: retries || 0,
    enabled: enabled === false ? 0 : 1,
    expected_status: type === 'http' ? (expected_status || 200) : null,
    keyword_match: type === 'http' ? (keyword_match || null) : null,
    public_status: public_status ? 1 : 0,
  };

  db.prepare(
    `INSERT INTO jobs (id, name, schedule, type, target, timeout_ms, retries, enabled, expected_status, keyword_match, public_status)
     VALUES (@id, @name, @schedule, @type, @target, @timeout_ms, @retries, @enabled, @expected_status, @keyword_match, @public_status)`
  ).run(job);

  scheduleJob(job);
  res.status(201).json(job);
});

// Update a job
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });

  const merged = { ...existing, ...req.body, id: existing.id };

  if (merged.schedule && !cron.validate(merged.schedule)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }

  merged.enabled = merged.enabled === false || merged.enabled === 0 ? 0 : 1;

  merged.expected_status = merged.type === 'http' ? (merged.expected_status || 200) : null;
  merged.keyword_match = merged.type === 'http' ? (merged.keyword_match || null) : null;
  merged.public_status = merged.public_status ? 1 : 0;

  db.prepare(
    `UPDATE jobs SET name=@name, schedule=@schedule, type=@type, target=@target,
     timeout_ms=@timeout_ms, retries=@retries, enabled=@enabled,
     expected_status=@expected_status, keyword_match=@keyword_match, public_status=@public_status,
     updated_at=datetime('now')
     WHERE id=@id`
  ).run(merged);

  scheduleJob(merged);
  res.json(merged);
});

// Delete a job
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });

  unscheduleJob(req.params.id);
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Uptime %, average response time, and recent run history (for sparkline charts)
router.get('/:id/stats', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const recent = db
    .prepare(
      `SELECT status, duration_ms, started_at FROM runs
       WHERE job_id = ? AND status != 'running'
       ORDER BY started_at DESC LIMIT 50`
    )
    .all(req.params.id);

  const completed = recent.length;
  const successes = recent.filter((r) => r.status === 'success').length;
  const uptimePercent = completed ? Math.round((successes / completed) * 1000) / 10 : null;

  const durations = recent.filter((r) => r.duration_ms != null).map((r) => r.duration_ms);
  const avgResponseMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  res.json({
    uptimePercent,
    avgResponseMs,
    sampleSize: completed,
    recent: recent.reverse(), // oldest first, easier to chart left-to-right
  });
});

// Manually trigger a job immediately, outside its schedule
router.post('/:id/run', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  executeJob(job); // fire and forget; poll /api/logs for the result
  res.status(202).json({ message: 'Job run triggered' });
});

module.exports = router;
