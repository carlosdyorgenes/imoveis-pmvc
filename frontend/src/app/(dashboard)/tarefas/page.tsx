'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Tarefa, TarefaCard, Imovel } from '@/types'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, GripVertical, Building2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

function CardItem({ card, onDelete }: { card: TarefaCard; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm group"
    >
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono font-semibold text-primary-700">{card.imovel.inscricaoImobiliaria}</p>
          <p className="text-xs text-gray-600 truncate mt-0.5">{card.imovel.logradouro}, {card.imovel.bairro}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={card.imovel.tipo === 'PROPRIO' ? 'badge-proprio' : 'badge-locado'}>{card.imovel.tipo}</span>
            <span className="text-xs text-gray-400">{card.user.name}</span>
          </div>
          {card.observacoes && (
            <p className="text-xs text-gray-500 mt-1.5 italic">{card.observacoes}</p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 rounded transition-all"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

export default function TarefasPage() {
  const qc = useQueryClient()
  const { isMaster } = useAuth()
  const [activeDrag, setActiveDrag] = useState<TarefaCard | null>(null)
  const [showNewCol, setShowNewCol] = useState(false)
  const [novaColTitulo, setNovaColTitulo] = useState('')
  const [addCardCol, setAddCardCol] = useState<string | null>(null)
  const [addCardSearch, setAddCardSearch] = useState('')
  const [addCardObs, setAddCardObs] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const { data: tarefas = [] } = useQuery<Tarefa[]>({
    queryKey: ['tarefas'],
    queryFn: () => api.get('/api/tarefas').then(r => r.data)
  })

  const { data: imoveis = [] } = useQuery<Imovel[]>({
    queryKey: ['imoveis'],
    queryFn: () => api.get('/api/imoveis').then(r => r.data)
  })

  const createColMutation = useMutation({
    mutationFn: () => api.post('/api/tarefas', { titulo: novaColTitulo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarefas'] }); setNovaColTitulo(''); setShowNewCol(false); toast.success('Etapa criada') }
  })

  const deleteColMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tarefas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarefas'] }); toast.success('Etapa removida') }
  })

  const addCardMutation = useMutation({
    mutationFn: ({ tarefaId, imovelId }: { tarefaId: string; imovelId: string }) =>
      api.post(`/api/tarefas/${tarefaId}/cards`, { imovelId, observacoes: addCardObs }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarefas'] }); setAddCardCol(null); setAddCardSearch(''); setAddCardObs(''); toast.success('Imóvel adicionado') }
  })

  const deleteCardMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tarefas/cards/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarefas'] }); toast.success('Card removido') }
  })

  const moveMutation = useMutation({
    mutationFn: ({ cardId, novaTarefaId }: { cardId: string; novaTarefaId: string }) =>
      api.put(`/api/tarefas/cards/${cardId}/mover`, { novaTarefaId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] })
  })

  const handleDragStart = (e: DragStartEvent) => {
    const card = tarefas.flatMap(t => t.cards).find(c => c.id === e.active.id)
    setActiveDrag(card || null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const sourceCard = tarefas.flatMap(t => t.cards).find(c => c.id === active.id)
    const targetCol = tarefas.find(t => t.id === over.id || t.cards.some(c => c.id === over.id))

    if (sourceCard && targetCol && sourceCard.tarefaId !== targetCol.id) {
      moveMutation.mutate({ cardId: sourceCard.id, novaTarefaId: targetCol.id })
    }
  }

  const imoveisFiltrados = imoveis.filter(im =>
    im.inscricaoImobiliaria.toLowerCase().includes(addCardSearch.toLowerCase()) ||
    im.logradouro.toLowerCase().includes(addCardSearch.toLowerCase())
  ).slice(0, 8)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-gray-500 mt-0.5">Gerencie as atividades dos imóveis</p>
        </div>
        <button onClick={() => setShowNewCol(true)} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> Nova Etapa
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {tarefas.map(tarefa => (
            <div key={tarefa.id} className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-gray-800">{tarefa.titulo}</h3>
                  <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">{tarefa.cards.length}</span>
                </div>
                {isMaster && (
                  <button
                    onClick={() => confirm('Excluir etapa?') && deleteColMutation.mutate(tarefa.id)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <SortableContext items={tarefa.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 min-h-8">
                  {tarefa.cards.map(card => (
                    <CardItem
                      key={card.id}
                      card={card}
                      onDelete={() => confirm('Remover imóvel desta etapa?') && deleteCardMutation.mutate(card.id)}
                    />
                  ))}
                </div>
              </SortableContext>

              {addCardCol === tarefa.id ? (
                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                  <input
                    className="input text-xs mb-2"
                    placeholder="Buscar imóvel..."
                    value={addCardSearch}
                    onChange={e => setAddCardSearch(e.target.value)}
                    autoFocus
                  />
                  {addCardSearch && (
                    <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                      {imoveisFiltrados.map(im => (
                        <button
                          key={im.id}
                          onClick={() => addCardMutation.mutate({ tarefaId: tarefa.id, imovelId: im.id })}
                          className="w-full text-left p-2 hover:bg-gray-50 rounded text-xs"
                        >
                          <span className="font-mono text-primary-700">{im.inscricaoImobiliaria}</span>
                          <span className="text-gray-500 ml-2">{im.logradouro}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    className="input text-xs mb-2"
                    placeholder="Observação (opcional)"
                    value={addCardObs}
                    onChange={e => setAddCardObs(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setAddCardCol(null)} className="btn-secondary text-xs flex-1 justify-center">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddCardCol(tarefa.id)}
                  className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar Imóvel
                </button>
              )}
            </div>
          ))}

          {showNewCol && (
            <div className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3">
              <input
                autoFocus
                className="input text-sm mb-2"
                placeholder="Nome da etapa..."
                value={novaColTitulo}
                onChange={e => setNovaColTitulo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && novaColTitulo && createColMutation.mutate()}
              />
              <div className="flex gap-2">
                <button onClick={() => novaColTitulo && createColMutation.mutate()} className="btn-primary text-xs flex-1 justify-center">Criar</button>
                <button onClick={() => { setShowNewCol(false); setNovaColTitulo('') }} className="btn-secondary text-xs">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {tarefas.length === 0 && !showNewCol && (
            <div className="flex-1 flex items-center justify-center min-h-64 border-2 border-dashed border-gray-200 rounded-xl">
              <div className="text-center">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-3">Crie sua primeira etapa</p>
                <button onClick={() => setShowNewCol(true)} className="btn-primary text-xs">
                  <Plus className="w-3.5 h-3.5" /> Nova Etapa
                </button>
              </div>
            </div>
          )}
        </div>

        <DragOverlay>
          {activeDrag && (
            <div className="bg-white border border-primary-300 rounded-lg p-3 shadow-lg w-72">
              <p className="text-xs font-mono font-semibold text-primary-700">{activeDrag.imovel.inscricaoImobiliaria}</p>
              <p className="text-xs text-gray-600 mt-0.5">{activeDrag.imovel.logradouro}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
