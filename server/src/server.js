const app = require('./app');
const env = require('./config/env');

const PORT = env.port;

app.listen(PORT, () => {
  console.log(`\n🏨  Namlatic Hotel API running on http://localhost:${PORT}`);
  console.log(`   Environment : ${env.nodeEnv}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});
