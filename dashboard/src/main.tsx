import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/fraunces';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { ThemeProvider } from '@/components/theme-provider';
import { App } from '@/App';

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
