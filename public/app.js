const jobList = document.getElementById('jobList');
const jobCount = document.getElementById('jobCount');
const logList = document.getElementById('logList');
const modalOverlay = document.getElementById('modalOverlay');
const jobForm = document.getElementById('jobForm');
const modalTitle = document.getElementById('modalTitle');
const scheduleInput = document.getElementById('jobSchedule');
const scheduleFeedback = document.getElementById('scheduleFeedback');

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function renderJobs(jobs) {
  jobCount.textContent = `${jobs.length} job${jobs.length === 1 ? '' : 's'}`;
  if (!jobs.length) {
    jobList.innerHTML = '<div class="empty">No jobs yet. Create one to get started.</div>';
    return;
  }
  jobList.innerHTML = jobs
    .map(
      (j) => `
    <div class="job-card" data-id="${j.id}">
      <div class="job-card-top">
        <span class="job-name">${escapeHtml(j.name)}</span>
        <span class="job-schedule">${escapeHtml(j.schedule)}</span>
      </div>
      <div class="job-target">${j.type}: ${escapeHtml(j.target)}</div>
      <div class="job-meta">
        <span class="pill ${j.enabled ? 'pill-on' : 'pill-off'}">${j.enabled ? 'enabled' : 'paused'}</span>
        ${j.public_status ? '<span class="pill pill-public">public</span>' : ''}
        ${j.nextRuns[0] ? `<span>next: ${new Date(j.nextRuns[0]).toLocaleString()}</span>` : ''}
      </div>
      <div class="stats-row" data-stats-for="${j.id}">
        <span class="muted">loading stats…</span>
      </div>
      <div class="job-actions">
        <button class="btn btn-ghost run-btn">Run now</button>
        <button class="btn btn-ghost toggle-btn">${j.enabled ? 'Pause' : 'Resume'}</button>
        <button class="btn btn-ghost edit-btn">Edit</button>
        <button class="btn btn-ghost delete-btn">Delete</button>
      </div>
    </div>`
    )
    .join('');

  jobs.forEach((j) => loadJobStats(j.id));

  jobList.querySelectorAll('.job-card').forEach((card) => {
    const id = card.dataset.id;
    const job = jobs.find((j) => j.id === id);
    card.querySelector('.run-btn').onclick = () => runJob(id);
    card.querySelector('.toggle-btn').onclick = () => toggleJob(job);
    card.querySelector('.edit-btn').onclick = () => openModal(job);
    card.querySelector('.delete-btn').onclick = () => deleteJob(id);
  });
}

function sparkline(durations) {
  if (durations.length < 2) return '';
  const w = 120, h = 28, pad = 2;
  const max = Math.max(...durations, 1);
  const min = Math.min(...durations, 0);
  const range = max - min || 1;
  const step = (w - pad * 2) / (durations.length - 1);
  const points = durations
    .map((d, i) => {
      const x = pad + i * step;
      const y = h - pad - ((d - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg width="${w}" height="${h}" class="sparkline"><polyline points="${points}" fill="none" stroke="var(--amber)" stroke-width="1.5"/></svg>`;
}

async function loadJobStats(jobId) {
  const el = document.querySelector(`[data-stats-for="${jobId}"]`);
  if (!el) return;
  try {
    const stats = await api(`/jobs/${jobId}/stats`);
    if (!stats.sampleSize) {
      el.innerHTML = '<span class="muted">no runs yet</span>';
      return;
    }
    const uptimeClass = stats.uptimePercent >= 99 ? 'ok' : stats.uptimePercent >= 90 ? 'warn' : 'err';
    const durations = stats.recent.filter((r) => r.duration_ms != null).map((r) => r.duration_ms);
    el.innerHTML = `
      <span class="uptime-badge uptime-${uptimeClass}">${stats.uptimePercent}% uptime</span>
      <span class="muted">avg ${stats.avgResponseMs ?? '–'}ms</span>
      ${sparkline(durations)}
    `;
  } catch {
    el.innerHTML = '<span class="muted">stats unavailable</span>';
  }
}

function renderLogs(runs) {
  if (!runs.length) {
    logList.innerHTML = '<div class="empty">No runs yet.</div>';
    return;
  }
  logList.innerHTML = runs
    .map(
      (r) => `
    <div class="log-row">
      <span><span class="status-dot status-${r.status}"></span>${escapeHtml(r.job_name)}</span>
      <span class="muted">${timeAgo(r.started_at)}${r.duration_ms ? ` · ${r.duration_ms}ms` : ''}</span>
    </div>`
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadJobs() {
  const jobs = await api('/jobs');
  renderJobs(jobs);
}

async function loadLogs() {
  const runs = await api('/logs?limit=30');
  renderLogs(runs);
}

async function runJob(id) {
  await api(`/jobs/${id}/run`, { method: 'POST' });
  setTimeout(loadLogs, 1000);
}

async function toggleJob(job) {
  await api(`/jobs/${job.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...job, enabled: !job.enabled }),
  });
  loadJobs();
}

async function deleteJob(id) {
  if (!confirm('Delete this job? This cannot be undone.')) return;
  await api(`/jobs/${id}`, { method: 'DELETE' });
  loadJobs();
}

function updateHttpFieldsVisibility() {
  const isHttp = document.getElementById('jobType').value === 'http';
  document.getElementById('httpChecksRow').style.display = isHttp ? 'flex' : 'none';
}

function openModal(job) {
  modalTitle.textContent = job ? 'Edit job' : 'New job';
  document.getElementById('jobId').value = job ? job.id : '';
  document.getElementById('jobName').value = job ? job.name : '';
  document.getElementById('jobSchedule').value = job ? job.schedule : '';
  document.getElementById('jobType').value = job ? job.type : 'http';
  document.getElementById('jobTarget').value = job ? job.target : '';
  document.getElementById('jobExpectedStatus').value = job && job.expected_status ? job.expected_status : 200;
  document.getElementById('jobKeyword').value = job && job.keyword_match ? job.keyword_match : '';
  document.getElementById('jobTimeout').value = job ? job.timeout_ms : 30000;
  document.getElementById('jobRetries').value = job ? job.retries : 0;
  document.getElementById('jobEnabled').checked = job ? !!job.enabled : true;
  document.getElementById('jobPublic').checked = job ? !!job.public_status : false;
  scheduleFeedback.textContent = '';
  updateHttpFieldsVisibility();
  modalOverlay.classList.remove('hidden');
}

document.getElementById('jobType').addEventListener('change', updateHttpFieldsVisibility);

function closeModal() {
  modalOverlay.classList.add('hidden');
  jobForm.reset();
}

document.getElementById('newJobBtn').onclick = () => openModal(null);
document.getElementById('cancelBtn').onclick = closeModal;
document.getElementById('refreshLogs').onclick = loadLogs;

let scheduleDebounce;
scheduleInput.addEventListener('input', () => {
  clearTimeout(scheduleDebounce);
  scheduleDebounce = setTimeout(async () => {
    const schedule = scheduleInput.value.trim();
    if (!schedule) { scheduleFeedback.textContent = ''; return; }
    const result = await api('/jobs/validate-schedule', {
      method: 'POST',
      body: JSON.stringify({ schedule }),
    });
    if (result.valid) {
      scheduleFeedback.textContent = `Next: ${new Date(result.nextRuns[0]).toLocaleString()}`;
      scheduleFeedback.className = 'feedback ok';
    } else {
      scheduleFeedback.textContent = 'Invalid cron expression';
      scheduleFeedback.className = 'feedback err';
    }
  }, 300);
});

jobForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('jobId').value;
  const payload = {
    name: document.getElementById('jobName').value,
    schedule: document.getElementById('jobSchedule').value,
    type: document.getElementById('jobType').value,
    target: document.getElementById('jobTarget').value,
    timeout_ms: parseInt(document.getElementById('jobTimeout').value, 10),
    retries: parseInt(document.getElementById('jobRetries').value, 10),
    enabled: document.getElementById('jobEnabled').checked,
    expected_status: parseInt(document.getElementById('jobExpectedStatus').value, 10) || 200,
    keyword_match: document.getElementById('jobKeyword').value.trim() || null,
    public_status: document.getElementById('jobPublic').checked,
  };
  try {
    if (id) {
      await api(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/jobs', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal();
    loadJobs();
  } catch (err) {
    alert(err.message);
  }
});

loadJobs();
loadLogs();
setInterval(loadLogs, 10000);
