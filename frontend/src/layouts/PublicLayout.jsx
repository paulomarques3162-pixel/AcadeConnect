import { Outlet } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { QuickAccess } from '../components/QuickAccess';

export function PublicLayout() {
  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <Outlet />
      </main>
      <Footer />
      <QuickAccess />
    </div>
  );
}
