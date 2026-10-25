import { useState, useEffect } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Mandatory Disclaimer */}
      <header className="disclaimer-banner">
        PROTOTYPE / DRILL — NOT CONNECTED TO REAL EMERGENCY SERVICES — FOR HACKATHON DEMO ONLY
      </header>

      <main style={{ flex: 1, padding: '40px 24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <div style={{
          background: 'rgba(18, 26, 43, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '32px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: health?.status === 'ok' ? '#10b981' : '#f59e0b',
              boxShadow: health?.status === 'ok' ? '0 0 12px #10b981' : 'none'
            }} />
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              HackWave Dispatch Engine
            </h1>
          </div>

          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '24px' }}>
            Phase 1 Scaffold Online. Real-time emergency vehicle allocation & triage engine.
          </p>

          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '10px',
            padding: '16px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.88rem'
          }}>
            <div style={{ color: '#06b6d4', marginBottom: '8px', fontWeight: 600 }}>System Gate Status:</div>
            {loading && <p style={{ color: '#94a3b8' }}>Checking backend /api/health...</p>}
            {error && <p style={{ color: '#f43f5e' }}>Connection failed: {error}</p>}
            {health && (
              <div>
                <p style={{ color: '#10b981' }}>✓ Backend Health: {health.status}</p>
                <p style={{ color: '#94a3b8' }}>Service: {health.service}</p>
                <p style={{ color: '#94a3b8' }}>Checked at: {health.timestamp}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
