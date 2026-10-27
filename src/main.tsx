import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ensure Service Worker is registered for PWA installability across all browsers
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('✅ PWA Service Worker registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('PWA registration:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
