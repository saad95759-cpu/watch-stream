import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { SocketProvider } from './hooks/useSocket';
import { TranslationProvider } from './hooks/useTranslation';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SocketProvider>
      <TranslationProvider>
        <App />
      </TranslationProvider>
    </SocketProvider>
  </React.StrictMode>
);

