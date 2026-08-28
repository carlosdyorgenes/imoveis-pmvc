import { AppError } from '../middleware/errorHandler'

// Chama a Claude API (Anthropic) com o prompt de sistema informado. Lança AppError com o
// motivo real do erro upstream — quem chama decide se tenta a alternativa (OpenAI) ou repassa
// o erro direto.
export async function gerarViaAnthropic(systemPrompt: string, texto: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new AppError('ANTHROPIC_API_KEY não configurada', 503)

  let resposta: Response
  try {
    resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: texto }],
      }),
    })
  } catch {
    throw new AppError('Falha de comunicação com a Claude API', 502)
  }

  if (!resposta.ok) {
    let detalhe = ''
    try {
      const corpoErro = await resposta.json() as { error?: { message?: string } }
      detalhe = corpoErro?.error?.message || ''
    } catch { /* corpo não era JSON válido */ }
    throw new AppError(`Claude API retornou erro (${resposta.status})${detalhe ? `: ${detalhe}` : ''}`, 502)
  }

  const data = await resposta.json() as { content?: { type: string; text?: string }[] }
  const textoFormal = data.content?.find(c => c.type === 'text')?.text?.trim()
  if (!textoFormal) throw new AppError('A Claude API não retornou texto', 502)
  return textoFormal
}

// Rota alternativa (ChatGPT/OpenAI) usada só quando a Claude API falha — mesmo prompt de
// sistema, pra manter o mesmo padrão de texto independente de qual provedor respondeu.
export async function gerarViaOpenAI(systemPrompt: string, texto: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new AppError('OPENAI_API_KEY não configurada', 503)

  let resposta: Response
  try {
    resposta = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: texto },
        ],
      }),
    })
  } catch {
    throw new AppError('Falha de comunicação com a OpenAI API', 502)
  }

  if (!resposta.ok) {
    let detalhe = ''
    try {
      const corpoErro = await resposta.json() as { error?: { message?: string } }
      detalhe = corpoErro?.error?.message || ''
    } catch { /* corpo não era JSON válido */ }
    throw new AppError(`OpenAI API retornou erro (${resposta.status})${detalhe ? `: ${detalhe}` : ''}`, 502)
  }

  const data = await resposta.json() as { choices?: { message?: { content?: string } }[] }
  const textoFormal = data.choices?.[0]?.message?.content?.trim()
  if (!textoFormal) throw new AppError('A OpenAI API não retornou texto', 502)
  return textoFormal
}

// Ponto único de geração de texto por IA usado em todo o sistema: tenta a Claude (provedor
// principal) e, se falhar por qualquer motivo (bloqueio de verificação, créditos, etc.), cai
// automaticamente pra OpenAI quando ela estiver configurada — mesmo prompt de sistema nos
// dois, pra manter o texto com o mesmo padrão não importa qual provedor respondeu.
export async function gerarTextoIA(systemPrompt: string, texto: string): Promise<{ texto: string; provedor: 'claude' | 'openai' }> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new AppError('Geração por IA não configurada neste servidor (nenhum provedor com chave configurada)', 503)
  }
  try {
    const textoFormal = await gerarViaAnthropic(systemPrompt, texto)
    return { texto: textoFormal, provedor: 'claude' }
  } catch (erroClaude) {
    if (!process.env.OPENAI_API_KEY) throw erroClaude
    try {
      const textoFormal = await gerarViaOpenAI(systemPrompt, texto)
      return { texto: textoFormal, provedor: 'openai' }
    } catch {
      // Repassa o erro original da Claude, que é o provedor principal — mais útil pro
      // diagnóstico do que o erro da alternativa.
      throw erroClaude
    }
  }
}
