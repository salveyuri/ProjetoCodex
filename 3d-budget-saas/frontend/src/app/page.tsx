import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { RevealOnScroll } from "@/components/landing/RevealOnScroll";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Pricify3D — Precificação que não deixa dinheiro na mesa de impressão",
  description:
    "Pricify3D calcula o custo real de cada peça impressa e monta orçamentos profissionais em segundos. Filamento, energia, depreciação da máquina e sua margem — tudo automático.",
};

export default function LandingPage() {
  return (
    <div className={styles.landingRoot}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <header className={styles.siteHeader}>
        <div className={styles.wrap}>
          <nav className={styles.siteNav}>
            <a href="#top" className={styles.logo}>
              <Image src="/logo_full.webp" alt="Pricify3D" width={140} height={26} priority />
            </a>
            <div className={styles.navLinks}>
              <a href="#funcionalidades">Funcionalidades</a>
              <a href="#como-funciona">Como funciona</a>
              <a href="#seguranca">Segurança</a>
              <a href="#planos">Planos</a>
              <a href="#faq">Dúvidas</a>
            </div>
            <div className={styles.navCta}>
              <Link href="/login" className={`${styles.btn} ${styles.btnGhost}`}>
                Entrar
              </Link>
              <Link href="/register" className={`${styles.btn} ${styles.btnPrimary}`}>
                Começar grátis
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <span className={styles.eyebrow}>Precificação para impressão 3D</span>
              <h1>
                Pare de imprimir <span className={styles.accent}>no prejuízo</span> sem saber.
              </h1>
              <p className={styles.lede}>
                O Pricify3D calcula o custo real de cada peça — filamento, energia, hora de
                máquina e sua margem — e transforma isso num orçamento profissional em PDF, pronto
                pra mandar pro cliente.
              </p>
              <div className={styles.heroCta}>
                <Link href="/register" className={`${styles.btn} ${styles.btnEmerald}`}>
                  Começar grátis agora
                </Link>
                <a href="#como-funciona" className={`${styles.btn} ${styles.btnGhost}`}>
                  Ver como funciona
                </a>
              </div>
              <div className={styles.heroNote}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 12l2 2 4-4M12 3l7 4v5c0 5-3.4 8.4-7 9-3.6-.6-7-4-7-9V7l7-4z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Sem cartão de crédito para testar. Dados isolados por empresa desde o primeiro
                orçamento.
              </div>
            </div>

            <div className={styles.calcCard}>
              <div className={styles.calcHead}>
                <span className={styles.title}>orcamento_peca_001.pf3d</span>
                <div className={styles.dots}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
              <div className={styles.calcRow} data-calc-anim>
                <span className={styles.label}>
                  <span className={styles.dot} style={{ background: "var(--indigo)" }}></span>
                  Filamento (PLA, 84g)
                </span>
                <span className={styles.val}>R$ 18,40</span>
              </div>
              <div className={styles.calcRow} data-calc-anim>
                <span className={styles.label}>
                  <span className={styles.dot} style={{ background: "var(--violet)" }}></span>
                  Energia (6h de impressão)
                </span>
                <span className={styles.val}>R$ 4,10</span>
              </div>
              <div className={styles.calcRow} data-calc-anim>
                <span className={styles.label}>
                  <span className={styles.dot} style={{ background: "var(--rose)" }}></span>
                  Depreciação da máquina
                </span>
                <span className={styles.val}>R$ 7,80</span>
              </div>
              <div className={styles.calcRow} data-calc-anim>
                <span className={styles.label}>
                  <span className={styles.dot} style={{ background: "var(--ink-500)" }}></span>
                  Falhas + mão de obra
                </span>
                <span className={styles.val}>R$ 9,20</span>
              </div>
              <div className={styles.calcRow} data-calc-anim>
                <span className={styles.label}>
                  <span className={styles.dot} style={{ background: "var(--emerald)" }}></span>
                  Sua margem (35%)
                </span>
                <span className={styles.val}>R$ 13,84</span>
              </div>
              <div className={styles.calcTotal} data-calc-anim>
                <span className={styles.label}>Preço final sugerido</span>
                <span className={styles.val}>R$ 53,34</span>
              </div>
              <div className={styles.calcFoot}>
                <span className={styles.pulse}></span>calculado com sua fórmula personalizada
              </div>
            </div>
          </div>
        </section>

        {/* PAIN */}
        <section className={`${styles.section} ${styles.pain}`}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`} data-reveal>
              <span className={styles.eyebrow}>O problema de sempre</span>
              <h2>A planilha não conta a história toda</h2>
              <p>
                A maioria dos makers e pequenas oficinas de impressão 3D precifica no olho — ou
                numa planilha que ninguém mais lembra como funciona. O resultado: peças vendidas
                abaixo do custo real.
              </p>
            </div>
            <div className={styles.painGrid}>
              <div className={`${styles.painCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 19h16M4 15l4-4 3 3 6-6 3 3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3>Depreciação nunca entra na conta</h3>
                <p>
                  Desgaste da máquina, manutenção e vida útil ficam de fora — e é dinheiro saindo
                  do seu bolso a cada impressão.
                </p>
              </div>
              <div className={`${styles.painCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2v6m0 8v6m10-10h-6M8 12H2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h3>Cada orçamento é refeito do zero</h3>
                <p>
                  Sem histórico, sem máquinas e materiais salvos — o mesmo cálculo, na mão, toda
                  vez que um cliente pede um preço.
                </p>
              </div>
              <div className={`${styles.painCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 8v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3>PDF de orçamento não passa confiança</h3>
                <p>
                  Print de planilha ou mensagem de WhatsApp não parece profissional na hora de
                  fechar negócio com um cliente novo.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="funcionalidades" className={styles.section}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`} data-reveal>
              <span className={styles.eyebrow}>O que o Pricify3D faz</span>
              <h2>Tudo que precifica uma peça, num só lugar</h2>
              <p>
                Cadastre suas máquinas e materiais uma vez. Cada orçamento novo puxa esses dados
                automaticamente e devolve um preço justo — pra você e pro cliente.
              </p>
            </div>
            <div className={styles.featGrid}>
              <div className={`${styles.featCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 3h6l1 4h4v2h-2l-1.6 11.2A2 2 0 0114.4 22H9.6a2 2 0 01-2-1.8L6 9H4V7h4l1-4z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3>Motor de cálculo preciso</h3>
                <p>
                  Custo de filamento por grama, energia por kWh, depreciação e manutenção da
                  máquina por hora, mais taxas extras como cartão e administrativa — tudo somado
                  automaticamente.
                </p>
              </div>

              <div className={`${styles.featCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 17l6-6-4-4M13 19h7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3>Fórmulas do seu jeito, sem código</h3>
                <p>
                  Crie e teste suas próprias fórmulas de precificação com variáveis
                  personalizadas. Se uma fórmula falhar, o sistema cai automaticamente na fórmula
                  padrão — o orçamento nunca trava.
                </p>
                <span className={styles.tag}>testado antes de salvar</span>
              </div>

              <div className={`${styles.featCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M9 13h6M9 17h4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h3>Orçamentos multi-peça em PDF</h3>
                <p>
                  Monte um orçamento com várias peças de uma vez e exporte um PDF profissional
                  pronto pra enviar. O valor fica congelado no histórico — nunca muda se você
                  atualizar um preço depois.
                </p>
              </div>

              <div className={`${styles.featCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </div>
                <h3>Máquinas e materiais organizados</h3>
                <p>
                  Cadastre suas impressoras com busca automática num catálogo de referência com
                  marcas e modelos reais, e seus materiais com custo derivado direto do preço de
                  compra.
                </p>
              </div>

              <div className={`${styles.featCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M4 19V10M12 19V5M20 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <h3>Dashboard financeiro</h3>
                <p>
                  Acompanhe quanto sua operação fatura e quanto custa de verdade. Os relatórios
                  preservam o histórico exato de cada orçamento, mesmo que preços de material ou
                  máquina mudem depois.
                </p>
              </div>

              <div className={`${styles.featCard} ${styles.reveal}`} data-reveal>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 21c-4-1.5-7-5-7-10V6l7-3 7 3v5c0 5-3 8.5-7 10z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3>Seus dados, na sua mão</h3>
                <p>
                  Exporte o histórico de faturamento, lucro e mix de materiais em CSV ou JSON
                  sempre que quiser, para cruzar com sua própria planilha ou contabilidade.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="como-funciona" className={`${styles.section} ${styles.how}`}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`} data-reveal>
              <span className={styles.eyebrow}>Do zero ao orçamento</span>
              <h2>Três passos até o primeiro PDF</h2>
            </div>
            <div className={styles.howList}>
              <div className={`${styles.howStep} ${styles.reveal}`} data-reveal>
                <div className={styles.howNum}>01</div>
                <h3>Cadastre máquina e material</h3>
                <p>
                  Busque sua impressora no catálogo ou cadastre na mão. Adicione o filamento com
                  preço de compra e peso — o custo por grama é calculado sozinho.
                </p>
              </div>
              <div className={`${styles.howStep} ${styles.reveal}`} data-reveal>
                <div className={styles.howNum}>02</div>
                <h3>Monte o orçamento</h3>
                <p>
                  Adicione as peças, tempo de impressão e quantidade. O Pricify3D aplica sua
                  fórmula (ou a padrão) e mostra o breakdown de custo em tempo real.
                </p>
              </div>
              <div className={`${styles.howStep} ${styles.reveal}`} data-reveal>
                <div className={styles.howNum}>03</div>
                <h3>Exporte e envie</h3>
                <p>
                  Gere o PDF profissional com um clique e mande pro cliente. O valor fica
                  registrado no histórico, do jeito que foi fechado.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section id="seguranca" className={styles.section}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`} data-reveal>
              <span className={styles.eyebrow}>Segurança que não é frase de efeito</span>
              <h2>Seus dados, isolados e auditados</h2>
              <p>
                Cada empresa enxerga só os próprios orçamentos, máquinas e materiais — construído
                assim desde a primeira linha, não como um remendo.
              </p>
            </div>
            <ul className={`${styles.trustList} ${styles.trustGrid} ${styles.reveal}`} data-reveal>
              <li>
                <span className={styles.check}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <strong>Isolamento por empresa</strong>
                  <span>
                    Nenhuma consulta ou alteração atravessa dados de outra conta — recurso fora do
                    seu escopo simplesmente não é encontrado.
                  </span>
                </div>
              </li>
              <li>
                <span className={styles.check}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <strong>Sessão com renovação segura</strong>
                  <span>
                    Login expira rápido por padrão e se renova sozinho por trás dos panos, sem te
                    derrubar no meio de um orçamento.
                  </span>
                </div>
              </li>
              <li>
                <span className={styles.check}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <strong>Trilha de auditoria</strong>
                  <span>
                    Mudanças sensíveis de plano, usuários e fórmulas ficam registradas — nada muda
                    silenciosamente.
                  </span>
                </div>
              </li>
              <li>
                <span className={styles.check}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <strong>Fórmulas sem risco de execução</strong>
                  <span>
                    Suas fórmulas rodam num interpretador restrito, sem acesso a nada fora do
                    próprio cálculo.
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* PRICING */}
        <section id="planos" className={`${styles.section} ${styles.pricing}`}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`} data-reveal>
              <span className={styles.eyebrow}>Planos</span>
              <h2>Comece de graça, cresça quando precisar</h2>
              <p>Pagamento via cartão de crédito. Cancele quando quiser, sem burocracia.</p>
            </div>

            <div className={styles.priceGrid}>
              <div className={`${styles.priceCard} ${styles.reveal}`} data-reveal>
                <h3>Free</h3>
                <div className={styles.sub}>Pra testar e organizar os primeiros orçamentos</div>
                <div className={styles.priceAmount}>
                  <span className={styles.num}>R$ 0</span>
                  <span className={styles.period}>/sempre</span>
                </div>
                <div className={styles.priceNote}>Sem cartão de crédito</div>
                <ul className={styles.priceFeats}>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Cadastro de máquinas e materiais
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Orçamentos com limite mensal
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Exportação de PDF
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Fórmula padrão do sistema
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Interface em português ou inglês
                  </li>
                </ul>
                <Link href="/register" className={`${styles.btn} ${styles.btnGhost} ${styles.btnBlock}`}>
                  Começar grátis
                </Link>
              </div>

              <div className={`${styles.priceCard} ${styles.featured} ${styles.reveal}`} data-reveal>
                <h3>Pro</h3>
                <div className={styles.sub}>Pra quem já vive de imprimir</div>
                <div className={styles.priceAmount}>
                  {/* Texto fixo, não vem do banco — esta landing page é
                      estática. O preço de verdade (cobrado de fato) vive em
                      Plan.price, editável em /admin/plans e mostrado ao
                      vivo em /dashboard/billing. Se o preço do plano Pro
                      mudar lá, atualizar aqui também à mão (ver
                      Contextos/Decisoes.md, 2026-08-27). */}
                  <span className={styles.num}>R$ 29,90</span>
                  <span className={styles.period}>/mês</span>
                </div>
                <div className={styles.priceNote}>Cancele quando quiser</div>
                <ul className={styles.priceFeats}>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Orçamentos sem limite mensal
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Fórmulas customizadas ilimitadas
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Dashboard financeiro completo
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Notificações por e-mail de orçamento
                  </li>
                  <li>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Interface em português ou inglês
                  </li>
                </ul>
                <Link href="/register" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}>
                  Assinar Pro
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={styles.section}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`} data-reveal>
              <span className={styles.eyebrow}>Dúvidas frequentes</span>
              <h2>Você pode querer saber</h2>
            </div>
            <div className={`${styles.faqList} ${styles.reveal}`} data-reveal>
              <details className={styles.faqItem} open>
                <summary>Preciso saber programar pra criar minhas próprias fórmulas de preço?</summary>
                <p>
                  Não. O editor de fórmulas usa variáveis prontas (custo de material, energia,
                  depreciação da máquina, margem) e testa o resultado antes de salvar. Se alguma
                  fórmula falhar em algum momento, o sistema usa a fórmula padrão automaticamente
                  — o cálculo nunca para.
                </p>
              </details>
              <details className={styles.faqItem}>
                <summary>O que acontece se eu mudar o preço de um material depois?</summary>
                <p>
                  Um orçamento já salvo mantém o valor calculado na hora em que foi feito, mesmo
                  que o preço do material mude depois. Se quiser atualizar esse orçamento com os
                  custos atuais, é só abrir e salvar de novo — aí o valor é recalculado.
                </p>
              </details>
              <details className={styles.faqItem}>
                <summary>Dá pra usar o sistema em inglês?</summary>
                <p>
                  Sim. A interface, os PDFs de orçamento e os e-mails têm versão em português e em
                  inglês — cada usuário escolhe o próprio idioma.
                </p>
              </details>
              <details className={styles.faqItem}>
                <summary>Como funciona o pagamento da assinatura?</summary>
                <p>
                  Via cartão de crédito, processado com segurança. Você pode trocar de plano ou
                  cancelar quando quiser — ao cancelar, sua conta volta pro plano Free, sem perder
                  os dados cadastrados.
                </p>
              </details>
              <details className={styles.faqItem}>
                <summary>Meus dados ficam visíveis pra outras empresas que usam o Pricify3D?</summary>
                <p>
                  Não. Cada empresa só acessa os próprios orçamentos, máquinas, materiais e
                  fórmulas. Tentativas de acessar dados de outra conta são bloqueadas no servidor,
                  não só escondidas na tela.
                </p>
              </details>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className={styles.finalCta}>
          <div className={styles.wrap}>
            <span className={`${styles.eyebrow} ${styles.reveal}`} data-reveal>
              pricify3d.com
            </span>
            <h2 className={styles.reveal} data-reveal>
              Seu próximo orçamento já pode ser o certo.
            </h2>
            <p className={styles.reveal} data-reveal>
              Cadastre sua primeira máquina agora e veja o preço real de uma peça em menos de 5
              minutos.
            </p>
            <div className={`${styles.heroCta} ${styles.reveal}`} data-reveal>
              <Link href="/register" className={`${styles.btn} ${styles.btnEmerald}`}>
                Começar grátis
              </Link>
              <a href="#planos" className={`${styles.btn} ${styles.btnGhost}`}>
                Ver planos
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.siteFooter}>
        <div className={styles.wrap}>
          <div className={styles.footGrid}>
            <div>
              <a href="#top" className={styles.logo} style={{ marginBottom: "12px" }}>
                <Image src="/logo_full.webp" alt="Pricify3D" width={140} height={26} />
              </a>
              <p style={{ color: "var(--ink-500)", fontSize: "13.5px", maxWidth: "260px" }}>
                Precificação de impressão 3D sem achismo, do orçamento ao PDF.
              </p>
            </div>
            <div className={styles.footLinks}>
              <div className={styles.footCol}>
                <h4>Produto</h4>
                <a href="#funcionalidades">Funcionalidades</a>
                <a href="#como-funciona">Como funciona</a>
                <a href="#planos">Planos</a>
              </div>
              <div className={styles.footCol}>
                <h4>Empresa</h4>
                <a href="#seguranca">Segurança</a>
                <a href="#faq">Dúvidas</a>
              </div>
            </div>
          </div>
          <div className={styles.footBottom}>
            <span>© 2026 Pricify3D. Todos os direitos reservados.</span>
            <span>pricify3d.com</span>
          </div>
        </div>
      </footer>

      <RevealOnScroll />
    </div>
  );
}
