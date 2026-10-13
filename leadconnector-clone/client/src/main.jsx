import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from './app-context.jsx';
import './styles.css';

// Brand name comes from the server's APP_NAME so the app can be white-labelled without a rebuild
fetch('/api/public/config').then((r) => r.json()).then((c) => {
  if (c.appName) { localStorage.setItem('lc_app_name', c.appName); document.title = c.appName; }
}).catch(() => {});
document.title = localStorage.getItem('lc_app_name') || document.title;

const theme = localStorage.getItem('lc_theme');
if (theme) document.documentElement.dataset.theme = theme;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
