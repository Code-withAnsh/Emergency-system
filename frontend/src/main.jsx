import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from './pages/Home.jsx';
import Report from './pages/Report.jsx';
import Track from './pages/Track.jsx';
import Admin from './pages/Admin.jsx';
import Hospital from './pages/Hospital.jsx';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import './index.css';

// Citizen pages are public. /admin is the authority console and is not linked anywhere.
function pickPage(pathname) {
  if (pathname === '/report') return Report;
  if (pathname.startsWith('/track/')) return Track;
  if (pathname === '/admin') return Admin;
  if (pathname === '/hospital') return Hospital;
  return Home;
}

const Page = pickPage(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <Page />
    </I18nProvider>
  </React.StrictMode>
);
