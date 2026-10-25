import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import ControlRoom from '../components/ControlRoom.jsx';
import '../public/public.css';

// Authority console: hidden from citizens. Reached only by typing /admin.
export default function Admin() {
  const [state, setState] = useState('checking'); // checking | out | in
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    api('/api/admin/me')
      .then((r) => { setNotConfigured(!r.configured); setState(r.admin ? 'in' : 'out'); })
      .catch(() => setState('out'));
  }, []);

  if (state === 'checking') return <div className="pub"><p style={{ padding: 24 }}>Loading…</p></div>;
  if (state === 'out') return <AdminLogin notConfigured={notConfigured} onIn={() => setState('in')} />;
  return <Console onOut={() => setState('out')} />;
}

function AdminLogin({ onIn, notConfigured }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(notConfigured ? 'Admin login is not set up on the server (.env).' : '');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      onIn();
    } catch (err) {
      setError(err.message === 'Wrong username or password' ? 'Wrong username or password.' : err.message);
      setBusy(false);
    }
  }

  return (
    <div className="pub">
      <div className="pub-banner" role="note">PROTOTYPE / DRILL · Authorised staff only</div>
      <main className="pub-wrap" style={{ maxWidth: 420 }}>
        <h1>Admin sign in</h1>
        <p className="muted">For authorised staff only.</p>
        <form className="card" onSubmit={submit}>
          <label className="field" htmlFor="u">Username</label>
          <input id="u" type="text" autoComplete="username" required value={username}
            onChange={(e) => setUsername(e.target.value)} />
          <label className="field" htmlFor="p">Password</label>
          <input id="p" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy || notConfigured}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="hint"><a href="/">← Home</a></p>
      </main>
    </div>
  );
}

function Console({ onOut }) {
  return <ControlRoom onOut={onOut} />;
}
