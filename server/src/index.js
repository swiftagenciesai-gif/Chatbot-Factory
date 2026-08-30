import app, { publicBaseUrl } from './app.js';

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Widget Factory API listening on ${publicBaseUrl}`));
