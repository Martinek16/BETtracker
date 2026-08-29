import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/fraunces';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { ThemeProvider } from '@/components/theme-provider';
import { App } from '@/App';

/** Volume, playback and launch keys, which move no focus. See `index.css`. */
const MEDIA_KEY = /^(Audio|Media|Launch|Brightness)/;

addEventListener(
  'keydown',
  (event) => {
    if (!MEDIA_KEY.test(event.key)) document.documentElement.setAttribute('data-keys', '');
  },
  true,
);
addEventListener('pointerdown', () => document.documentElement.removeAttribute('data-keys'), true);

const root = document.getElementById('root');
if (root === null) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
);
