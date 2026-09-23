import "./env.js";

import { createApp } from "./app.js";
import { PORT } from "./env.js";
import { poolSize } from "./db.js";

createApp().listen(PORT, () => {
  console.log(`course-rush server: http://localhost:${PORT} (pool=${poolSize()})`);
});
