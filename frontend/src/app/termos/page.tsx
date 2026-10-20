import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Termos de Serviço — PMVC Controle de Imóveis',
}

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <article className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5 text-gray-700 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold text-gray-900">Termos de Serviço</h1>
        <p className="text-gray-500">Sistema de Controle de Imóveis Públicos — Prefeitura Municipal de Vitória da Conquista. Atualizados em outubro de 2026.</p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">1. Uso autorizado</h2>
        <p>
          O sistema é de uso interno e restrito a servidores e colaboradores autorizados pela Gerência de Patrimônio.
          O acesso é pessoal e intransferível: cada usuário é responsável pela guarda de sua senha e pelas ações
          realizadas com a sua conta.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">2. Responsabilidades do usuário</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Registrar informações verdadeiras e relacionadas às atividades da gerência.</li>
          <li>Não compartilhar credenciais nem tentar acessar áreas sem autorização.</li>
          <li>Não inserir no sistema dados que não sejam necessários ao trabalho administrativo.</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">3. Registro de atividades</h2>
        <p>
          As ações realizadas no sistema são registradas (logs) para fins de segurança, auditoria e rastreabilidade.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">4. Disponibilidade</h2>
        <p>
          O sistema é mantido pela Gerência de Patrimônio e pode passar por manutenções ou indisponibilidades
          temporárias, sem aviso prévio em casos de segurança ou força maior. É feita uma cópia de segurança diária
          dos dados.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">5. Privacidade</h2>
        <p>
          O tratamento de dados pessoais segue a <Link href="/privacidade" className="text-primary-700 underline">Política de Privacidade</Link>.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">6. Contato</h2>
        <p>Gerência de Patrimônio e Controle — gerpat.semgi@pmvc.ba.gov.br.</p>

        <p className="pt-4">
          <Link href="/" className="text-primary-700 underline">Voltar ao sistema</Link>
        </p>
      </article>
    </main>
  )
}
