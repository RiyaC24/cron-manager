require('dotenv').config();
const express = require('express');
const path = require('path');
const { loadAllJobs } = require('./src/scheduler');
const { seedJobs } = require('./src/seed');
const jobsRouter = require('./src/routes/jobs');
const logsRouter = require('./src/routes/logs');
const publicRouter = require('./src/routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Public status page and its API - intentionally mounted BEFORE basic auth,
// so it stays reachable even if the dashboard itself is password-protected.
app.use('/api/public', publicRouter);
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.html'));
});

// Optional basic auth, enabled only if both env vars are set
const authUser = process.env.BASIC_AUTH_USER;
const authPass = process.env.BASIC_AUTH_PASS;
if (authUser && authPass) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
      if (user === authUser && pass === authPass) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="cron-manager"');
    res.status(401).send('Authentication required');
  });
}

app.use('/api/jobs', jobsRouter);
app.use('/api/logs', logsRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`cron-manager listening on http://localhost:${PORT}`);
  seedJobs();
  loadAllJobs();
});
