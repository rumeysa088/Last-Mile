import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import CitizenHome from './pages/citizen/CitizenHome'
import ApplyPage from './pages/citizen/ApplyPage'
import TrackCasePage from './pages/citizen/TrackCasePage'
import ScamCheckPage from './pages/citizen/ScamCheckPage'
import ConsentPage from './pages/citizen/ConsentPage'
import HelperDashboard from './pages/helper/HelperDashboard'
import FamilyDetailPage, { HelperCasePage } from './pages/helper/FamilyDetailPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import ReviewQueuePage from './pages/admin/ReviewQueuePage'
import CaseReviewPage from './pages/admin/CaseReviewPage'
import RuleEditorPage from './pages/admin/RuleEditorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute roles={['citizen']} />}>
        <Route element={<AppShell />}>
          <Route path="/citizen" element={<CitizenHome />} />
          <Route path="/citizen/apply" element={<ApplyPage />} />
          <Route path="/citizen/cases" element={<TrackCasePage />} />
          <Route path="/citizen/cases/:id" element={<TrackCasePage />} />
          <Route path="/citizen/scam" element={<ScamCheckPage />} />
          <Route path="/citizen/consent" element={<ConsentPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['community_helper']} />}>
        <Route element={<AppShell />}>
          <Route path="/helper" element={<HelperDashboard />} />
          <Route path="/helper/families/:id" element={<FamilyDetailPage />} />
          <Route path="/helper/families/:id/apply" element={<ApplyPage />} />
          <Route path="/helper/cases/:id" element={<HelperCasePage />} />
          <Route path="/helper/scam" element={<ScamCheckPage />} />
        </Route>
      </Route>
      {/* D's combined officer_admin dashboard */}
      <Route element={<ProtectedRoute roles={['officer_admin']} />}>
        <Route element={<AppShell wide />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/review" element={<ReviewQueuePage />} />
          <Route path="/admin/cases/:id" element={<CaseReviewPage />} />
          <Route path="/admin/rules" element={<RuleEditorPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
