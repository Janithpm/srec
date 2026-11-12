import React from 'react';
import ReactDOM from 'react-dom/client';
import { captureUncaughtErrors } from '@/utils/logger';
import App from './App';
import { logger } from './logger';
import './style.css';

captureUncaughtErrors(logger);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
