import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';
import './styles/game-theme.css';
import './styles/game-layout.css';

createRoot(document.getElementById('root')!).render(<App />);
