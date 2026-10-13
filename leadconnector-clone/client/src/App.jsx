import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './app-context.jsx';
import Layout from './components/Layout.jsx';
import { Spinner, Toasts } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Conversations from './pages/Conversations.jsx';
import Thread from './pages/Thread.jsx';
import Contacts from './pages/Contacts.jsx';
import ContactDetail from './pages/ContactDetail.jsx';
import ContactForm from './pages/ContactForm.jsx';
import ScanCard from './pages/ScanCard.jsx';
import ImportContacts from './pages/ImportContacts.jsx';
import Opportunities from './pages/Opportunities.jsx';
import OpportunityForm from './pages/OpportunityForm.jsx';
import Calendars from './pages/Calendars.jsx';
import AppointmentForm from './pages/AppointmentForm.jsx';
import Tasks from './pages/Tasks.jsx';
import Payments from './pages/Payments.jsx';
import InvoiceForm from './pages/InvoiceForm.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import PointOfSale from './pages/PointOfSale.jsx';
import Reviews from './pages/Reviews.jsx';
import Notifications from './pages/Notifications.jsx';
import Dialer from './pages/Dialer.jsx';
import ManualActions from './pages/ManualActions.jsx';
import Workflows from './pages/Workflows.jsx';
import WorkflowEdit from './pages/WorkflowEdit.jsx';
import More from './pages/More.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/settings/Settings.jsx';
import Profile from './pages/settings/Profile.jsx';
import Business from './pages/settings/Business.jsx';
import Team from './pages/settings/Team.jsx';
import Pipelines from './pages/settings/Pipelines.jsx';
import CalendarSettings from './pages/settings/CalendarSettings.jsx';
import Snippets from './pages/settings/Snippets.jsx';
import CustomFields from './pages/settings/CustomFields.jsx';
import Tags from './pages/settings/Tags.jsx';
import NotificationPrefs from './pages/settings/NotificationPrefs.jsx';
import Integrations from './pages/settings/Integrations.jsx';
import Products from './pages/settings/Products.jsx';
import BookPage from './pages/public/BookPage.jsx';
import PayPage from './pages/public/PayPage.jsx';
import ReviewPage from './pages/public/ReviewPage.jsx';
import ChatPage from './pages/public/ChatPage.jsx';

function Private({ children }) {
  const { user, loading } = useApp();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<><Login /><Toasts /></>} />
      <Route path="/register" element={<><Login register /><Toasts /></>} />
      <Route path="/book/:slug" element={<BookPage />} />
      <Route path="/pay/:token" element={<PayPage />} />
      <Route path="/review/:token" element={<ReviewPage />} />
      <Route path="/chat/:locationId" element={<ChatPage />} />

      <Route element={<Private><Layout /></Private>}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="conversations/:id" element={<Thread />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="contacts/new" element={<ContactForm />} />
        <Route path="contacts/scan" element={<ScanCard />} />
        <Route path="contacts/import" element={<ImportContacts />} />
        <Route path="contacts/:id" element={<ContactDetail />} />
        <Route path="contacts/:id/edit" element={<ContactForm />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="opportunities/new" element={<OpportunityForm />} />
        <Route path="opportunities/:id" element={<OpportunityForm />} />
        <Route path="calendars" element={<Calendars />} />
        <Route path="calendars/new" element={<AppointmentForm />} />
        <Route path="calendars/appointments/:id" element={<AppointmentForm />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="payments" element={<Payments />} />
        <Route path="payments/invoices/new" element={<InvoiceForm />} />
        <Route path="payments/invoices/:id" element={<InvoiceDetail />} />
        <Route path="payments/invoices/:id/edit" element={<InvoiceForm />} />
        <Route path="payments/pos" element={<PointOfSale />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="dialer" element={<Dialer />} />
        <Route path="manual-actions" element={<ManualActions />} />
        <Route path="workflows" element={<Workflows />} />
        <Route path="workflows/:id" element={<WorkflowEdit />} />
        <Route path="more" element={<More />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/profile" element={<Profile />} />
        <Route path="settings/business" element={<Business />} />
        <Route path="settings/team" element={<Team />} />
        <Route path="settings/pipelines" element={<Pipelines />} />
        <Route path="settings/calendars" element={<CalendarSettings />} />
        <Route path="settings/snippets" element={<Snippets />} />
        <Route path="settings/custom-fields" element={<CustomFields />} />
        <Route path="settings/tags" element={<Tags />} />
        <Route path="settings/notifications" element={<NotificationPrefs />} />
        <Route path="settings/integrations" element={<Integrations />} />
        <Route path="settings/products" element={<Products />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
