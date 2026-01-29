const app = require('./src/app');
require('./src/cron/noShowJob');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
