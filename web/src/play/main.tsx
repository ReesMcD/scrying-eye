import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { screenMode } from './client';
import { PlayerApp } from './PlayerApp';
import { ScreenApp } from './ScreenApp';
import '../styles.css';
import './play.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {screenMode ? <ScreenApp /> : <PlayerApp />}
  </StrictMode>,
);
