import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './components/ThemeProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadedForUpdate = false;
    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      });
    }

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      const checkForUpdate = () => {
        if (document.visibilityState === 'visible') {
          void registration.update().catch((error: unknown) => {
            console.warn('Royal Salon could not check for an app update.', error);
          });
        }
      };

      checkForUpdate();
      window.setInterval(checkForUpdate, 30 * 60 * 1000);
      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', checkForUpdate);
    }).catch((error: unknown) => {
      console.error('Royal Salon offline support could not be enabled.', error);
    });
  });
}
