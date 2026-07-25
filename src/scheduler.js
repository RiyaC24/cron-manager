const cron = require('node-cron');
const { exec } = require('child_process');
const { v4: uuid } = require('uuid');
const fetch = require('node-fetch');
const db = require('./db');

// Holds active node-cron tasks keyed by job id
const tasks = new Map();

function buildWebhookPayload(url, job, errorMessage) {
  const timestamp = new Date().toISOString();

  if (url.includes('discord.com/api/webhooks')) {
    return {
      embeds: [
        {
          title: `Job failed: ${job.name}`,
          description: errorMessage.slice(0, 1000),
          color: 0xd9634b,
          timestamp,
          fields: [{ name: 'Target', value: job.target.slice(0, 200) }],
        },
      ],
    };
  }

  if (url.includes('hooks.slack.com')) {
    return {
      text: `:red_circle: *Job failed: ${job.name}*\n${errorMessage.slice(0, 500)}\nTarget: ${job.target}`,
    };
  }

  // Generic JSON payload for any other webhook consumer
  return {
    jobId: job.id,
    jobName: job.name,
    target: job.target,
    error: errorMessage,
    timestamp,
  };
}

function notifyFailure(job, errorMessage) {
  const urls = (process.env.FAILURE_WEBHOOK_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  for (const url of urls) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildWebhookPayload(url, job, errorMessage)),
    }).catch(() => {
      // Notification failures are logged but never crash the scheduler
      console.error(`Failed to deliver failure webhook to ${url}`);
    });
  }
}

function runHttpJob(job) {
  const started = Date.now();
  return fetch(job.target, { method: 'GET', timeout: job.timeout_ms }).then(
    async (res) => {
      const responseTimeMs = Date.now() - started;
      const text = await res.text();

      const expectedStatus = job.expected_status || 200;
      if (res.status !== expectedStatus) {
        throw new Error(
          `Expected status ${expectedStatus} but got ${res.status} (${responseTimeMs}ms)`
        );
      }
      if (job.keyword_match && !text.includes(job.keyword_match)) {
        throw new Error(
          `Response did not contain expected keyword "${job.keyword_match}" (${responseTimeMs}ms)`
        );
      }

      return `HTTP ${res.status} in ${responseTimeMs}ms\n\n${text.slice(0, 2000)}`;
    }
  );
}

function runShellJob(job) {
  return new Promise((resolve, reject) => {
    const child = exec(
      job.target,
      { timeout: job.timeout_ms, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout.slice(0, 2000));
        }
      }
    );
    // exec already applies the timeout; child reference kept for clarity/extension
    void child;
  });
}

async function executeJob(job, attempt = 0) {
  const runId = uuid();
  const startedAt = new Date();

  db.prepare(
    `INSERT INTO runs (id, job_id, status, started_at) VALUES (?, ?, 'running', ?)`
  ).run(runId, job.id, startedAt.toISOString());

  try {
    const output =
      job.type === 'http' ? await runHttpJob(job) : await runShellJob(job);

    const finishedAt = new Date();
    db.prepare(
      `UPDATE runs SET status = 'success', finished_at = ?, duration_ms = ?, output = ? WHERE id = ?`
    ).run(
      finishedAt.toISOString(),
      finishedAt - startedAt,
      output,
      runId
    );
  } catch (err) {
    if (attempt < job.retries) {
      return executeJob(job, attempt + 1);
    }
    const finishedAt = new Date();
    db.prepare(
      `UPDATE runs SET status = 'failed', finished_at = ?, duration_ms = ?, error = ? WHERE id = ?`
    ).run(
      finishedAt.toISOString(),
      finishedAt - startedAt,
      String(err.message || err),
      runId
    );
    notifyFailure(job, String(err.message || err));
  }
}

function scheduleJob(job) {
  unscheduleJob(job.id);
  if (!job.enabled) return;
  if (!cron.validate(job.schedule)) {
    console.error(`Invalid cron expression for job ${job.id}: ${job.schedule}`);
    return;
  }
  const task = cron.schedule(job.schedule, () => executeJob(job));
  tasks.set(job.id, task);
}

function unscheduleJob(jobId) {
  const existing = tasks.get(jobId);
  if (existing) {
    existing.stop();
    tasks.delete(jobId);
  }
}

function loadAllJobs() {
  const jobs = db.prepare('SELECT * FROM jobs').all();
  jobs.forEach(scheduleJob);
  console.log(`Scheduled ${jobs.filter((j) => j.enabled).length} active job(s)`);
}

module.exports = { scheduleJob, unscheduleJob, loadAllJobs, executeJob };
