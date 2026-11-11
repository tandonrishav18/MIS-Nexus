import { useEffect, useState } from 'react'
import {
  Activity,
  Building,
  Cpu,
  FileScan,
  RotateCcw,
  Save,
  ShieldCheck,
  Sliders,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useToast } from '@/components/shared/ToastProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useEdiStore } from '@/context/EdiStoreContext'
import {
  ediApi,
  type AiCapabilitiesResponse,
  type HonestServiceStatus,
} from '@/lib/api'

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'Connected' || status === 'Installed') return 'success'
  if (status === 'Model Not Downloaded' || status === 'Not Running') return 'warning'
  if (status === 'Not Installed' || status === 'Unavailable') return 'danger'
  return 'neutral'
}

export function SettingsPage() {
  const { settings, backendConnected, updateSettings, resetDemoData } = useEdiStore()
  const { pushToast } = useToast()

  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  // Honest untested state until user or probe executes
  const [caps, setCaps] = useState<AiCapabilitiesResponse | null>(null)
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null)

  useEffect(() => {
    setForm(settings)
  }, [settings])

  const handleTestConnections = async () => {
    setTesting(true)
    try {
      const res = await ediApi.testAiConnection(form.ollamaEndpoint, form.ollamaModel)
      setCaps(res)
      setLastTestedAt(new Date().toLocaleTimeString('en-IN', { hour12: false }))
      const status: HonestServiceStatus = res.ollama.overallStatus
      pushToast({
        tone: status === 'Connected' ? 'success' : 'warning',
        title: `Local AI Status: ${status}`,
        description:
          res.ollama.error ??
          `Connected to ${res.ollama.selectedModel} at ${res.ollama.endpoint}.`,
      })
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Connection Probe Failed',
        description: err instanceof Error ? err.message : 'Unable to reach backend AI health probe.',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateSettings(form)
      pushToast({
        tone: 'success',
        title: 'Settings Saved',
        description: 'Organization profile and AI configuration persisted in SQLite.',
      })
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Unable to save settings.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmReset = async () => {
    setSaving(true)
    try {
      await resetDemoData()
      setResetDialogOpen(false)
      pushToast({
        tone: 'info',
        title: 'Demo State Restored',
        description: 'SQLite tables reset cleanly to the initial demonstration baseline.',
      })
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Reset Failed',
        description: err instanceof Error ? err.message : 'Unable to reset SQLite demo state.',
      })
    } finally {
      setSaving(false)
    }
  }

  const ollamaOverall = caps ? caps.ollama.overallStatus : 'Not Tested'
  const ocrOverall = caps ? caps.ocr.ocrAvailability : 'Not Tested'

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Settings"
        description="Configure organization identity, EDI preferences, local Ollama AI model, and Tesseract OCR diagnostics."
        badge={
          <Badge variant={backendConnected ? 'success' : 'warning'}>
            {backendConnected ? 'SQLite Database Connected' : 'API Offline'}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing || !backendConnected}
              onClick={() => void handleTestConnections()}
            >
              <Activity className="h-3.5 w-3.5" />
              {testing ? 'Testing...' : 'Test AI & OCR Connections'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(true)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Demo Dataset
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column: Organization & Application Preferences */}
        <div className="space-y-5 lg:col-span-7">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-[#1E4E8C]" />
                  Organization Profile
                </CardTitle>
                <CardDescription>
                  Primary enterprise hub operating this EDI Nexus instance
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="org-name" className="mb-1.5 block text-[12px] font-medium">
                  Organization Hub Name
                </label>
                <Input
                  id="org-name"
                  value={form.organizationName}
                  onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="hub-code" className="mb-1.5 block text-[12px] font-medium">
                  Hub Identifier Code
                </label>
                <Input
                  id="hub-code"
                  value={form.hubCode}
                  onChange={(e) => setForm({ ...form, hubCode: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div>
                <label htmlFor="hub-gstin" className="mb-1.5 block text-[12px] font-medium">
                  Organization GSTIN
                </label>
                <Input
                  id="hub-gstin"
                  value={form.hubGstin}
                  onChange={(e) => setForm({ ...form, hubGstin: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="admin-email" className="mb-1.5 block text-[12px] font-medium">
                  Operations Contact Email
                </label>
                <Input
                  id="admin-email"
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-[#1E4E8C]" />
                  Application Preferences
                </CardTitle>
                <CardDescription>Default document creation & validation behavior</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="def-tax" className="mb-1.5 block text-[12px] font-medium">
                    Default GST Rate
                  </label>
                  <select
                    id="def-tax"
                    value={form.defaultTaxRatePct}
                    onChange={(e) =>
                      setForm({ ...form, defaultTaxRatePct: Number(e.target.value) })
                    }
                    className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px]"
                  >
                    <option value={0}>0% (Tax Exempt / Inclusive)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="currency-read" className="mb-1.5 block text-[12px] font-medium">
                    Reporting Currency
                  </label>
                  <Input id="currency-read" value="INR (₹ · Indian Rupee)" disabled />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-[13px] text-[#172B4D]">
                <input
                  type="checkbox"
                  checked={form.autoValidateOnSubmit}
                  onChange={(e) =>
                    setForm({ ...form, autoValidateOnSubmit: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[#CBD5E1]"
                />
                Automatically run deterministic PO matching & schema validation on submit
              </label>

              <div className="pt-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#168568]" />
                  EDI Configuration Overview
                </CardTitle>
                <CardDescription>Active envelope and delimiter defaults</CardDescription>
              </div>
              <Badge variant="success">Active</Badge>
            </CardHeader>
            <CardContent className="space-y-2.5 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-[#6B778C]">EDI Standard Version</span>
                <span className="font-mono font-semibold text-[#172B4D]">
                  {form.ediStandardVersion}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B778C]">Supported Message Sets</span>
                <span className="font-mono font-medium text-[#172B4D]">850, 855, 810, 856</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B778C]">Element / Segment Delimiters</span>
                <span className="font-mono font-semibold text-[#172B4D]">
                  {form.elementSeparator} / {form.segmentTerminator}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B778C]">Database Persistence</span>
                <span className="font-medium text-[#168568]">FastAPI + SQLite</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Honest Local AI (Ollama) & Tesseract OCR Diagnostics */}
        <div className="space-y-5 lg:col-span-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-[#1E4E8C]" />
                  Local AI Configuration (Ollama · Qwen)
                </CardTitle>
                <CardDescription>
                  100% local inference · zero paid APIs or keys
                  {lastTestedAt ? ` · Tested at ${lastTestedAt}` : ''}
                </CardDescription>
              </div>
              <Badge variant={caps ? statusVariant(ollamaOverall) : 'neutral'}>
                {ollamaOverall}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              <div className="space-y-2 rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[#6B778C]">Ollama Installation</span>
                  <Badge variant={caps ? statusVariant(caps.ollama.installationStatus) : 'neutral'}>
                    {caps ? caps.ollama.installationStatus : 'Not Tested'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B778C]">Ollama Service Status</span>
                  <Badge variant={caps ? statusVariant(caps.ollama.serviceStatus) : 'neutral'}>
                    {caps ? caps.ollama.serviceStatus : 'Not Tested'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B778C]">Selected Model Availability</span>
                  <Badge variant={caps ? statusVariant(caps.ollama.modelStatus) : 'neutral'}>
                    {caps ? caps.ollama.modelStatus : 'Not Tested'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B778C]">AI Configuration Status</span>
                  <Badge variant={caps ? statusVariant(caps.ollama.overallStatus) : 'neutral'}>
                    {caps ? caps.ollama.overallStatus : 'Not Tested'}
                  </Badge>
                </div>
              </div>

              <div>
                <label htmlFor="ollama-url" className="mb-1 block text-[11.5px] font-medium text-[#6B778C]">
                  Local Ollama HTTP Endpoint
                </label>
                <Input
                  id="ollama-url"
                  value={form.ollamaEndpoint}
                  onChange={(e) => setForm({ ...form, ollamaEndpoint: e.target.value })}
                  className="font-mono text-[12px]"
                />
              </div>

              <div>
                <label htmlFor="ollama-model" className="mb-1 block text-[11.5px] font-medium text-[#6B778C]">
                  Selected Local Model
                </label>
                <Input
                  id="ollama-model"
                  value={form.ollamaModel}
                  onChange={(e) => setForm({ ...form, ollamaModel: e.target.value })}
                  className="font-mono text-[12px]"
                  placeholder="qwen2.5:7b"
                />
              </div>

              <div>
                <span className="block text-[11.5px] font-medium text-[#6B778C]">
                  Available Local Models
                </span>
                <p className="mt-1 font-mono text-[12px] text-[#172B4D]">
                  {caps
                    ? caps.ollama.installedModels.length > 0
                      ? caps.ollama.installedModels.join(', ')
                      : 'None downloaded locally'
                    : 'Run "Test AI & OCR Connections" to probe'}
                </p>
              </div>

              {caps?.ollama.error ? (
                <p className="rounded-control border border-[#F1DBA8] bg-[#FDF7EB] p-2.5 text-[11.5px] text-[#9A6B16]">
                  {caps.ollama.error}
                </p>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={testing || !backendConnected}
                onClick={() => void handleTestConnections()}
              >
                <Activity className="h-3.5 w-3.5" />
                {testing ? 'Testing Local Endpoint...' : 'Test Ollama Connection'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileScan className="h-4 w-4 text-[#1E4E8C]" />
                  Document OCR & PDF Extraction
                </CardTitle>
                <CardDescription>PyMuPDF (PDF) + Pillow + local Tesseract OCR</CardDescription>
              </div>
              <Badge variant={caps ? statusVariant(ocrOverall) : 'neutral'}>
                {ocrOverall}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              <div className="space-y-2 rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[#6B778C]">Tesseract Installation</span>
                  <Badge variant={caps ? statusVariant(caps.ocr.installationStatus) : 'neutral'}>
                    {caps ? caps.ocr.installationStatus : 'Not Tested'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B778C]">OCR Availability</span>
                  <Badge variant={caps ? statusVariant(caps.ocr.ocrAvailability) : 'neutral'}>
                    {caps ? caps.ocr.ocrAvailability : 'Not Tested'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B778C]">Selectable PDF Extraction</span>
                  <Badge variant="success">PyMuPDF Ready</Badge>
                </div>
              </div>
              <p className="text-[12px] text-[#42526E]">
                {caps
                  ? caps.ocr.message
                  : 'Click "Test AI & OCR Connections" to check Tesseract binary availability on this host.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </form>

      {/* Reset Demo Confirmation */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Demonstration Data?</DialogTitle>
            <DialogDescription>
              This restores the initial Metro Retail, ABC Components, and Kaveri Logistics dataset in SQLite.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="text-[13px] text-[#42526E]">
            Any newly created purchase orders, corrected invoices, or custom mapping rules will be replaced by the original demonstration baseline.
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" disabled={saving} onClick={() => void handleConfirmReset()}>
              {saving ? 'Resetting...' : 'Confirm Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
