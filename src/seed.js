const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('./db');

function seedJobs() {
  const seedPath = path.join(__dirname, '..', 'seed-jobs.json');
  if (!fs.existsSync(seedPath)) return;

  const seeds = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const existingNames = new Set(
    db.prepare('SELECT name FROM jobs').all().map((j) => j.name)
  );

  const insert = db.prepare(
    `INSERT INTO jobs (id, name, schedule, type, target, timeout_ms, retries, enabled, expected_status, keyword_match, public_status)
     VALUES (@id, @name, @schedule, @type, @target, @timeout_ms, @retries, @enabled, @expected_status, @keyword_match, @public_status)`
  );

  for (const job of seeds) {
    if (existingNames.has(job.name)) continue; // don't re-add on every restart
    insert.run({
      id: uuid(),
      name: job.name,
      schedule: job.schedule,
      type: job.type,
      target: job.target,
      timeout_ms: job.timeout_ms ?? 30000,
      retries: job.retries ?? 0,
      enabled: job.enabled === false ? 0 : 1,
      expected_status: job.type === 'http' ? (job.expected_status ?? 200) : null,
      keyword_match: job.type === 'http' ? (job.keyword_match ?? null) : null,
      public_status: job.public_status ? 1 : 0,
    });
    console.log(`Seeded job: ${job.name}`);
  }
}

module.exports = { seedJobs };
