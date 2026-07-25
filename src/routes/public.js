const express = require('express');
const db = require('../db');

const router = express.Router();

// No auth on this route by design - it's meant to be shared publicly.
// Only jobs the user explicitly marked "public" are included, and only
// safe summary fields are returned (never the raw shell command target).
router.get('/status', (req, res) => {
  const jobs = db
    .prepare('SELECT * FROM jobs WHERE public_status = 1 AND enabled = 1')
    .all();

  const result = jobs.map((job) => {
    const recent = db
      .prepare(
        `SELECT status, duration_ms, started_at FROM runs
         WHERE job_id = ? AND status != 'running'
         ORDER BY started_at DESC LIMIT 50`
      )
      .all(job.id);

    const completed = recent.length;
    const successes = recent.filter((r) => r.status === 'success').length;
    const uptimePercent = completed ? Math.round((successes / completed) * 1000) / 10 : null;
    const durations = recent.filter((r) => r.duration_ms != null).map((r) => r.duration_ms);
    const avgResponseMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    return {
      name: job.name,
      type: job.type,
      // Only expose the target for http jobs - never a shell command
      target: job.type === 'http' ? job.target : undefined,
      uptimePercent,
      avgResponseMs,
      lastStatus: recent[0]?.status || null,
      lastCheckedAt: recent[0]?.started_at || null,
    };
  });

  res.json(result);
});

module.exports = router;
