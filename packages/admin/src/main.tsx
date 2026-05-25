import { createRoot } from 'react-dom/client';
import { AdminPage } from './components/AdminPage';
import 'antd/dist/reset.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<AdminPage />);
