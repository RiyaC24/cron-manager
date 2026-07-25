const express = require('express');
const db = require('../db');

const router = express.Router();

// Recent runs across all jobs, or filtered by ?jobId=
router.get('/', (req, res) => {
  const { jobId, limit } = req.query;
  const cap = Math.min(parseInt(limit, 10) || 50, 500);

  const rows = jobId
    ? db
        .prepare(
          `SELECT runs.*, jobs.name as job_name FROM runs
           JOIN jobs ON jobs.id = runs.job_id
           WHERE runs.job_id = ? ORDER BY started_at DESC LIMIT ?`
        )
        .all(jobId, cap)
    : db
        .prepare(
          `SELECT runs.*, jobs.name as job_name FROM runs
           JOIN jobs ON jobs.id = runs.job_id
           ORDER BY started_at DESC LIMIT ?`
        )
        .all(cap);

  res.json(rows);
});

module.exports = router;
