import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Privacidade — PMVC Controle de Imóveis',
}

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <article className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5 text-gray-700 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold text-gray-900">Política de Privacidade</h1>
        <p className="text-gray-500">Sistema de Controle de Imóveis Públicos — Prefeitura Municipal de Vitória da Conquista. Atualizada em outubro de 2026.</p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">1. Sobre o sistema</h2>
        <p>
          Este é um sistema de uso interno da Gerência de Patrimônio da Prefeitura Municipal de Vitória da Conquista,
          usado para controlar imóveis públicos, ocorrências, tarefas e demandas administrativas. O acesso é restrito a
          servidores autorizados, mediante login individual.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">2. Dados tratados</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Dados de usuários do sistema: nome, e-mail, perfil de acesso e registros de acesso (logs).</li>
          <li>Informações sobre imóveis, ocorrências, tarefas e demandas, incluindo observações e documentos anexados.</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">3. Finalidade</h2>
        <p>
          Os dados são usados exclusivamente para a gestão do patrimônio público e o acompanhamento das demandas
          administrativas, não sendo vendidos nem compartilhados para fins comerciais.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">4. Integração com o Google Drive (backup)</h2>
        <p>
          O sistema usa a API do Google Drive para guardar uma cópia de segurança diária do banco de dados e dos
          arquivos anexados, em uma pasta própria da conta institucional responsável. O acesso solicitado é limitado
          ao escopo <em>drive.file</em>: o sistema só enxerga os arquivos e pastas que ele mesmo criou e não lê nem
          altera nenhum outro conteúdo do Drive. Os dados obtidos por meio das APIs do Google são usados somente para
          essa função de backup, não são compartilhados com terceiros e não são usados para publicidade.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">5. Inteligência artificial</h2>
        <p>
          Para gerar resumos e relatórios, trechos de informações das demandas e o conteúdo de documentos anexados
          podem ser enviados a provedores de inteligência artificial (Anthropic e, como alternativa, OpenAI), apenas
          para produzir o texto solicitado.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">6. Armazenamento e segurança</h2>
        <p>
          Os dados ficam armazenados em provedores de infraestrutura em nuvem (Fly.io e Vercel), com conexão
          criptografada (HTTPS) e controle de acesso por perfil. Os backups ficam na conta Google responsável pelo
          sistema.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">7. Seus direitos</h2>
        <p>
          Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar acesso, correção ou
          informações sobre o tratamento dos seus dados pessoais pelo contato abaixo.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 pt-2">8. Contato</h2>
        <p>
          Gerência de Patrimônio e Controle — gerpat.semgi@pmvc.ba.gov.br — Rua João Pessoa, 253, Centro, Vitória da
          Conquista – BA.
        </p>

        <p className="pt-4 flex gap-4">
          <Link href="/termos" className="text-primary-700 underline">Termos de Serviço</Link>
          <Link href="/" className="text-primary-700 underline">Voltar ao sistema</Link>
        </p>
      </article>
    </main>
  )
}
