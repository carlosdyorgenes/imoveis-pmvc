'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Link from 'next/link'
import { ArrowLeft, Upload, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface ItemPreview {
  linha: number
  textoOriginal: string
  gepNumero: string | null
  gepAno: string | null
  interessado: string | null
  assunto: string
  alertas: string[]
}

interface ItemEditavel extends ItemPreview {
  incluir: boolean
}

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

export default function ImportarDemandasPage() {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [fonte, setFonte] = useState('')
  const [itens, setItens] = useState<ItemEditavel[]>([])
  const [confirmando, setConfirmando] = useState(false)

  const handleUpload = async (file: File) => {
    setEnviando(true)
    setItens([])
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      const res = await api.post('/api/demandas/importar/upload-preview', fd)
      setFonte(res.data.fonte)
      setItens(res.data.itens.map((i: ItemPreview) => ({ ...i, incluir: !!(i.gepNumero && i.gepAno) })))
      toast.success(`${res.data.itens.length} item(ns) candidato(s) encontrado(s) — revise antes de confirmar`)
    } catch (e: any) {
      toast.error(errMsg(e, 'Erro ao processar o arquivo'))
    } finally {
      setEnviando(false)
    }
  }

  const atualizarItem = (linha: number, campo: keyof ItemEditavel, valor: string | boolean) => {
    setItens(prev => prev.map(i => i.linha === linha ? { ...i, [campo]: valor } : i))
  }

  const confirmarImportacao = async () => {
    const selecionados = itens.filter(i => i.incluir)
    if (selecionados.length === 0) { toast.error('Selecione ao menos um item'); return }

    setConfirmando(true)
    try {
      const res = await api.post('/api/demandas/importar/confirmar', {
        itens: selecionados.map(i => ({
          gepNumero: i.gepNumero, gepAno: i.gepAno, assunto: i.assunto, interessado: i.interessado || undefined,
        })),
      })
      toast.success(`${res.data.criadas} demanda(s) criada(s)`)
      if (res.data.rejeitados?.length > 0) {
        toast.error(`${res.data.rejeitados.length} item(ns) rejeitado(s) — veja abaixo`)
      }
      setItens([])
      if (res.data.criadas > 0) router.push('/demandas')
    } catch (e: any) {
      toast.error(errMsg(e, 'Erro ao confirmar importação'))
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/demandas" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importar Demandas de um .docx</h1>
          <p className="text-gray-500 text-sm">
            Envie um documento Word com uma lista de processos. O sistema extrai uma prévia — nada é salvo até você revisar e confirmar.
          </p>
        </div>
      </div>

      {itens.length === 0 && (
        <div className="card">
          <label className="btn-primary w-full justify-center cursor-pointer py-3">
            <Upload className="w-4 h-4" /> {enviando ? 'Processando...' : 'Selecionar arquivo .docx'}
            <input
              type="file"
              accept=".docx"
              className="hidden"
              disabled={enviando}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
            />
          </label>
          <p className="text-xs text-gray-400 text-center mt-3">
            A extração é heurística (procura padrões de GEP "número/ano" no texto) — revise cada item com atenção antes de confirmar.
          </p>
        </div>
      )}

      {itens.length > 0 && (
        <>
          <div className="card mb-4 py-3 flex items-center justify-between">
            <p className="text-sm text-gray-600">Fonte: <span className="font-mono">{fonte}</span> — {itens.length} item(ns) encontrado(s)</p>
            <button onClick={() => setItens([])} className="btn-secondary text-xs">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
          </div>

          <div className="space-y-3">
            {itens.map(item => (
              <div key={item.linha} className={`card ${!item.incluir ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.incluir}
                    onChange={e => atualizarItem(item.linha, 'incluir', e.target.checked)}
                    className="w-4 h-4 accent-primary-600 mt-1.5"
                  />
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="label text-xs">GEP nº</label>
                      <input className="input text-sm" value={item.gepNumero || ''} onChange={e => atualizarItem(item.linha, 'gepNumero', e.target.value)} />
                    </div>
                    <div>
                      <label className="label text-xs">Ano</label>
                      <input className="input text-sm" value={item.gepAno || ''} onChange={e => atualizarItem(item.linha, 'gepAno', e.target.value)} />
                    </div>
                    <div>
                      <label className="label text-xs">Interessado</label>
                      <input className="input text-sm" value={item.interessado || ''} onChange={e => atualizarItem(item.linha, 'interessado', e.target.value)} />
                    </div>
                    <div>
                      <label className="label text-xs">Assunto</label>
                      <input className="input text-sm" value={item.assunto} onChange={e => atualizarItem(item.linha, 'assunto', e.target.value)} />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2 pl-7 italic">"{item.textoOriginal}"</p>
                {item.alertas.length > 0 && (
                  <div className="mt-2 pl-7 space-y-1">
                    {item.alertas.map((a, i) => (
                      <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {a}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={confirmarImportacao} disabled={confirmando} className="btn-primary">
              <CheckCircle2 className="w-4 h-4" />
              {confirmando ? 'Importando...' : `Confirmar importação (${itens.filter(i => i.incluir).length} selecionado(s))`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
