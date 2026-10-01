import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from './public/PublicLayout';
import HomePage from './public/pages/HomePage';
import { LoadingBlock } from './components/ui/Feedback';
import NotFoundPage from './public/pages/NotFoundPage';

const ServicesPage = lazy(() => import('./public/pages/ServicesPage'));
const GalleryPage = lazy(() => import('./public/pages/GalleryPage'));
const CarePage = lazy(() => import('./public/pages/CarePage'));
const BookingPage = lazy(() => import('./public/pages/BookingPage'));
const ReceiptPage = lazy(() => import('./public/pages/ReceiptPage'));

// Painel: carregado à parte, visitantes do site não baixam esse código.
const AdminRoutes = lazy(() => import('./admin/AdminRoutes'));

export default function App() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Routes>
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="servicos" element={<ServicesPage />} />
          <Route path="galeria" element={<GalleryPage />} />
          <Route path="cuidados" element={<CarePage />} />
          <Route path="agendar" element={<BookingPage />} />
          <Route path="agendamento/:code" element={<ReceiptPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
