import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { BookOpen, FileText, Loader2, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorNote, Input, Label, ListSkeleton, Modal, PageHeader, Select, cn } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDate } from '../../lib/utils'
import { useAuth } from '../../stores/auth'
import { useUI } from '../../stores/ui'
import type { Doc } from '../../types'

export default function Knowledge() {
  const qc = useQueryClient(), toast = useUI((s) => s.toast), role = useAuth((s) => s.role)
  const canEdit = role === 'owner' || role === 'admin' || role === 'manager', canDelete = role === 'owner' || role === 'admin'
  const file = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState('policy'), [collection, setCollection] = useState('default'), [drag, setDrag] = useState(false)
  const [chunksFor, setChunksFor] = useState<Doc | null>(null), [query, setQuery] = useState(''), [delDoc, setDelDoc] = useState<Doc | null>(null)
  const docs = useQuery({ queryKey: ['docs'], queryFn: () => api<Doc[]>('/documents'), refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'processing') ? 2000 : false) })
  const inv = () => qc.invalidateQueries({ queryKey: ['docs'] })
  const upload = useMutation({
    mutationFn: async (files: File[]) => { for (const f of files) { const form = new FormData(); form.append('file', f); form.append('category', category); form.append('collection', collection); await api('/documents', { form }) } },
    onSuccess: () => { inv(); toast({ title: 'Upload started', body: 'Documents are being chunked and embedded.', tone: 'success' }) },
    onError: (e: Error) => toast({ title: 'Upload failed', body: e.message, tone: 'error' }),
  })
  const reindex = useMutation({ mutationFn: (id: string) => api(`/documents/${id}/reindex`, { method: 'POST' }), onSuccess: inv })
  const del = useMutation({ mutationFn: (id: string) => api(`/documents/${id}`, { method: 'DELETE' }), onSuccess: inv })
  const search = useMutation({ mutationFn: (q: string) => api<any>('/knowledge/search', { body: { query: q, k: 5 } }) })
  const tone = (s: string) => (s === 'ready' ? 'mint' : s === 'failed' ? 'rose' : 'amber') as 'mint' | 'rose' | 'amber'

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <PageHeader title="Knowledge Library" sub="Policies and FAQs the AI cites. It says so when it has no evidence." />
      {canEdit && (
        <Card className={cn('mb-5 border-2 border-dashed p-6 transition duration-base', drag ? 'scale-[1.005] border-accent bg-tint' : 'border-line')}>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload.mutate([...e.dataTransfer.files]) }} className="flex flex-wrap items-center gap-3">
            <motion.div animate={drag ? { y: -3 } : { y: 0 }} className="grid h-12 w-12 place-items-center rounded-2xl bg-tint text-accent"><Upload size={22} /></motion.div><div className="flex-1"><p className="text-sm font-medium">Drop PDF, DOCX, TXT or MD files here</p><p className="text-xs text-muted">Up to 10 MB each</p></div>
            <Select className="!w-32" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">{['policy', 'faq', 'manual', 'shipping', 'general'].map((c) => <option key={c}>{c}</option>)}</Select>
            <Input className="!w-32" value={collection} onChange={(e) => setCollection(e.target.value)} aria-label="Collection" placeholder="Collection" />
            <input ref={file} type="file" multiple hidden accept=".pdf,.docx,.txt,.md" onChange={(e) => { e.target.files && upload.mutate([...e.target.files]); e.target.value = '' }} />
            <Button onClick={() => file.current?.click()} disabled={upload.isPending}>{upload.isPending ? 'Uploading…' : 'Choose files'}</Button>
          </div>
        </Card>)}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          {docs.isLoading ? <ListSkeleton rows={4} /> : docs.error ? <ErrorNote error={docs.error} /> : !docs.data?.length ? <Empty icon={<BookOpen />} title="No documents yet" hint="Upload your return and shipping policies to ground the AI." /> : (
            <ul className="divide-y divide-line">{docs.data.map((d) => (
              <li key={d.id} className="flex items-center gap-3 p-4 transition hover:bg-soft/50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-soft text-muted"><FileText size={18} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted"><Badge tone={tone(d.status)}>{d.status === 'processing' && <Loader2 size={10} className="animate-spin" />}{d.status}</Badge><Badge>{d.category}</Badge><span>{d.collection}</span><span>v{d.version}</span><span>{d.chunk_count} chunks</span><span>{fmtDate(d.created_at)}</span></div>
                  {d.error && <p className="mt-1 text-xs text-danger">{d.error}</p>}</div>
                <Button size="sm" variant="ghost" onClick={() => setChunksFor(d)} disabled={d.status !== 'ready'}>Chunks</Button>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => reindex.mutate(d.id)} aria-label="Re-index"><RefreshCw size={14} /></Button>}
                {canDelete && <Button size="sm" variant="ghost" onClick={() => setDelDoc(d)} aria-label="Delete"><Trash2 size={14} /></Button>}
              </li>))}</ul>)}
        </Card>
        <Card className="p-5 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold">Search tester</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); query.trim() && search.mutate(query) }}><Input data-search value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Can I return after 15 days?" aria-label="Test query" /><Button disabled={search.isPending}><Search size={16} /></Button></form>
          {search.data && <div className="mt-3 space-y-2">
            <Badge tone={search.data.sufficient_evidence ? 'mint' : 'rose'}>{search.data.sufficient_evidence ? 'Sufficient evidence' : `Below threshold (${search.data.min_score}): AI would offer a human`}</Badge>
            {search.data.hits.map((h: any) => (<div key={h.chunk_id} className="rounded-xl border border-line p-3 text-xs"><div className="mb-1 flex items-center justify-between"><b>{h.title}</b><span className="text-accent">score {h.score}</span></div><p className="line-clamp-4 text-muted">{h.content}</p><p className="mt-1 text-[11px] text-muted">semantic {h.semantic} · lexical {h.lexical}</p></div>))}</div>}
        </Card>
      </div>
      <ChunkModal doc={chunksFor} onClose={() => setChunksFor(null)} />
      <ConfirmDialog open={!!delDoc} onClose={() => setDelDoc(null)} danger title="Delete document?" body={`“${delDoc?.title ?? ''}” and its indexed chunks will be removed.`} confirmLabel="Delete" onConfirm={() => delDoc && del.mutate(delDoc.id)} />
    </div>
  )
}

function ChunkModal({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['chunks', doc?.id], queryFn: () => api<any[]>(`/documents/${doc!.id}/chunks`), enabled: !!doc })
  return (
    <Modal open={!!doc} onClose={onClose} title={`Chunks · ${doc?.title ?? ''}`} wide>
      <div className="space-y-2">{q.data?.map((c) => <div key={c.id} className="rounded-xl border border-line p-3"><p className="mb-1 text-[11px] font-semibold text-muted">#{c.chunk_index}</p><p className="whitespace-pre-wrap text-sm">{c.content}</p></div>)}</div>
      {!q.data && <ListSkeleton rows={3} />}<Label>{''}</Label>
    </Modal>
  )
}
