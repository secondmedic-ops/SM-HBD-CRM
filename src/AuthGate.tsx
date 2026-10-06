/**
 * SM HBD CRM login. Nothing inside the app renders until the user is logged in with Supabase Auth AND the API
 * gives them a role (Admin, or their email in Staff mapping: a staff row or the accounts team list). Every API call
 * then carries the login token (src/api.ts); the API checks it and the role on every request.
 *
 * Without VITE_SUPABASE_URL (AI Studio preview, RUN-LOCAL-TEST.bat) there is no login screen: the local API runs
 * with login off and answers as Admin.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, ApiMe } from './api';
import { supabase } from './lib/supabase';

interface AuthValue {
  me: ApiMe;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** The logged-in user and sign-out. Only used inside AuthGate, so it is always there. */
export const useAuth = () => {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthGate');
  return v;
};

const box = 'w-full bg-[#fbfaf6] border border-[#c9c2b2] px-3 py-2 text-sm text-[#1f2a24] focus:outline-none focus:border-[#1b7a54]';
const btn = 'w-full bg-[#1b7a54] text-white font-semibold py-2 text-sm disabled:opacity-50 cursor-pointer';

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#efebe2] px-4 font-['Poppins',sans-serif]">
      <div className="w-full max-w-[380px] bg-[#fbfaf6] border border-[#c9c2b2] p-6 space-y-4">
        <div>
          <div className="text-lg font-bold text-[#1f2a24]">SecondMedic CRM</div>
          <div className="text-xs text-[#5c665f]">Healthcare business development, Mohan's team</div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Grey blocks in the shape of the app while the session and role load. */
function AppSkeleton() {
  return (
    <div className="min-h-screen bg-[#efebe2]" aria-busy="true">
      <div className="h-16 bg-[#d9d3c6]" />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="h-9 w-2/3 bg-[#e2ddd2]" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-24 bg-[#e2ddd2]" />)}
        </div>
        <div className="h-64 bg-[#e2ddd2]" />
      </div>
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [recovery, setRecovery] = useState(false);
  const [me, setMe] = useState<ApiMe | null>(null);
  const [meError, setMeError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (!s) setMe(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadMe = async () => {
    setMeError('');
    try {
      setMe(await api.me());
    } catch (err: any) {
      setMe(null);
      setMeError(err?.message || String(err));
    }
  };

  useEffect(() => {
    if (!supabase || session) loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const signOut = () => { if (supabase) supabase.auth.signOut(); };

  if (!ready) return <AppSkeleton />;

  if (supabase && recovery && session) {
    return (
      <Panel>
        <div className="text-sm font-semibold text-[#1f2a24]">Set a new password</div>
        <input type="password" className={box} placeholder="New password (at least 8 characters)" value={password}
          onChange={e => setPassword(e.target.value)} />
        <button className={btn} disabled={busy || password.length < 8} onClick={async () => {
          setBusy(true);
          const { error } = await supabase!.auth.updateUser({ password });
          setBusy(false);
          if (error) setMessage(error.message); else { setRecovery(false); setPassword(''); setMessage(''); }
        }}>Save password</button>
        {message && <div className="text-xs text-[#9b2c2c]">{message}</div>}
      </Panel>
    );
  }

  if (supabase && !session) {
    const signIn = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setMessage('');
      const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) setMessage(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    };
    return (
      <Panel>
        <form onSubmit={signIn} className="space-y-3">
          <label className="block text-xs font-semibold text-[#5c665f]">Work email
            <input type="email" autoComplete="username" className={box + ' mt-1'} value={email}
              onChange={e => setEmail(e.target.value)} required />
          </label>
          <label className="block text-xs font-semibold text-[#5c665f]">Password
            <input type="password" autoComplete="current-password" className={box + ' mt-1'} value={password}
              onChange={e => setPassword(e.target.value)} required />
          </label>
          <button type="submit" className={btn} disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
        <div className="text-xs text-[#5c665f]">No login or forgot your password? Ask the admin: logins are made in Staff mapping.</div>
        {message && <div className="text-xs text-[#9b2c2c]">{message}</div>}
      </Panel>
    );
  }

  if (!me) {
    if (!meError) return <AppSkeleton />;
    return (
      <Panel>
        <div className="text-sm text-[#9b2c2c]">Could not reach the server: {meError}</div>
        <button className={btn} onClick={loadMe}>Try again</button>
        {supabase && <button className="text-xs underline cursor-pointer text-[#5c665f]" onClick={signOut}>Sign out</button>}
      </Panel>
    );
  }

  if (!me.role) {
    return (
      <Panel>
        <div className="text-sm text-[#1f2a24]">
          You are signed in as <b>{me.email}</b>, but this email is not in the CRM yet. Ask the admin to put it on your
          row in Staff mapping (or in Accounts team logins).
        </div>
        <button className={btn} onClick={loadMe}>Check again</button>
        <button className="text-xs underline cursor-pointer text-[#5c665f]" onClick={signOut}>Sign out</button>
      </Panel>
    );
  }

  return <AuthContext.Provider value={{ me, signOut }}>{children}</AuthContext.Provider>;
}
