import { app } from './app.ts';
const server = app.listen(4311, '127.0.0.1', () => {
  console.info('TCLA analysis service: http://127.0.0.1:4311');
});
server.requestTimeout = 360_000;
server.headersTimeout = 15_000;
