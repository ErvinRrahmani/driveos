import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { env } from './lib/api';
import { browserTokenStorage } from './lib/auth-store';
import { createServices } from './lib/services';
import { startMocks } from './mocks';
import { createAppRouter } from './router';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const services = createServices({
  baseUrl: env.apiUrl,
  storage: browserTokenStorage(),
  refreshWhenTokenMissing: !env.useMocks,
});
const router = createAppRouter(services);
const app = createRoot(root);

void startMocks(env.useMocks).then(() =>
  app.render(
    <StrictMode>
      <App router={router} services={services} />
    </StrictMode>,
  ),
);
