import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import AuthGate from './AuthGate.tsx';
import './index.css';

// AuthGate: login first (Supabase Auth) and the user's role from the API; every API call carries the token (src/api.ts).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
);
