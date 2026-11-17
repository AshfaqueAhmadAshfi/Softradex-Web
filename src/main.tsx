import React from 'react';
import { createRoot } from 'react-dom/client';
import { installSecureApiFetch } from './lib/secure-api';
import { App } from './App';

installSecureApiFetch();

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
