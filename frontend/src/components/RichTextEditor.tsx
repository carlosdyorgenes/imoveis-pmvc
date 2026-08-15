'use client'
import { useEditor, EditorContent, type Editor, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'
import { useEffect } from 'react'

// Tiptap não distribui uma extensão oficial de tamanho de fonte — só um pacote pra
// isso adicionaria dependência extra. Como o tamanho é só um atributo CSS no marcador
// de estilo de texto (mark) que a extensão TextStyle já cria, é mais simples estender
// essa mark aqui mesmo (é o approach recomendado na própria documentação do Tiptap).
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: { chain: () => any }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }: { chain: () => any }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any
  },
})

const TAMANHOS = [
  { label: 'Pequena', value: '12px' },
  { label: 'Normal', value: '' },
  { label: 'Média', value: '16px' },
  { label: 'Grande', value: '20px' },
  { label: 'Enorme', value: '28px' },
]

function BotaoBarra({ ativo, disabled, onClick, title, children }: { ativo?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${ativo ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  )
}

interface Props {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
}

export function RichTextEditor({ value, onChange, disabled, placeholder }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontSize,
      TextAlign.configure({ types: ['paragraph', 'heading'], alignments: ['left', 'center', 'right', 'justify'] }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }: { editor: Editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'text-sm text-gray-800 min-h-32 px-3 py-2 focus:outline-none [&_p]:my-1',
      },
    },
  })

  // Mantém o editor sincronizado quando o valor externo muda (ex.: trocar de atividade)
  // sem entrar em loop com o próprio onUpdate — só reescreve se o HTML realmente mudou.
  useEffect(() => {
    if (!editor) return
    const atual = editor.getHTML()
    const novo = value || ''
    if (atual !== novo && !(atual === '<p></p>' && novo === '')) {
      editor.commands.setContent(novo, { emitUpdate: false })
    }
  }, [value, editor])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  if (!editor) return null

  const tamanhoAtual = TAMANHOS.find(t => editor.isActive('textStyle', { fontSize: t.value }))?.value ?? ''

  return (
    <div className={`border rounded-lg overflow-hidden ${disabled ? 'bg-gray-50 border-gray-200' : 'border-gray-300 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent'}`}>
      {!disabled && (
        <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
          <BotaoBarra title="Negrito" ativo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="w-3.5 h-3.5" />
          </BotaoBarra>
          <BotaoBarra title="Itálico" ativo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="w-3.5 h-3.5" />
          </BotaoBarra>
          <BotaoBarra title="Sublinhado" ativo={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="w-3.5 h-3.5" />
          </BotaoBarra>
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <BotaoBarra title="Alinhar à esquerda" ativo={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
            <AlignLeft className="w-3.5 h-3.5" />
          </BotaoBarra>
          <BotaoBarra title="Centralizar" ativo={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
            <AlignCenter className="w-3.5 h-3.5" />
          </BotaoBarra>
          <BotaoBarra title="Alinhar à direita" ativo={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
            <AlignRight className="w-3.5 h-3.5" />
          </BotaoBarra>
          <BotaoBarra title="Justificar" ativo={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
            <AlignJustify className="w-3.5 h-3.5" />
          </BotaoBarra>
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <select
            title="Tamanho da fonte"
            value={tamanhoAtual}
            onChange={e => {
              const tamanho = e.target.value
              if (tamanho) (editor.chain().focus() as any).setFontSize(tamanho).run()
              else (editor.chain().focus() as any).unsetFontSize().run()
            }}
            className="text-xs border-0 bg-transparent rounded px-1.5 py-1 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {TAMANHOS.map(t => <option key={t.label} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
