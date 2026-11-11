import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/shared/ToastProvider'
import { EdiStoreProvider } from '@/context/EdiStoreContext'
import { AiAssistantPage } from '@/pages/AiAssistantPage'
import { CreateDocumentPage } from '@/pages/CreateDocumentPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DocumentProcessingPage } from '@/pages/DocumentProcessingPage'
import { EdiMappingPage } from '@/pages/EdiMappingPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TradingPartnersPage } from '@/pages/TradingPartnersPage'
import { TransactionsPage } from '@/pages/TransactionsPage'

export function App() {
  const [globalSearch, setGlobalSearch] = useState('')

  return (
    <ToastProvider>
      <EdiStoreProvider>
        <BrowserRouter>
          <AppShell searchQuery={globalSearch} onSearchChange={setGlobalSearch}>
            <Routes>
              <Route path="/" element={<DashboardPage globalSearch={globalSearch} />} />
              <Route
                path="/transactions"
                element={<TransactionsPage globalSearch={globalSearch} />}
              />
              <Route path="/create-document" element={<CreateDocumentPage />} />
              <Route path="/processing/:id?" element={<DocumentProcessingPage />} />
              <Route path="/partners" element={<TradingPartnersPage />} />
              <Route path="/mapping" element={<EdiMappingPage />} />
              <Route path="/assistant" element={<AiAssistantPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </EdiStoreProvider>
    </ToastProvider>
  )
}

export default App
