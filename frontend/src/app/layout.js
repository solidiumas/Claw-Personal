// ============================================================
// Claw Personal — Root Layout (Fase 6)
// ============================================================
// App Router root layout med Inter-font, metadata for SEO,
// og den globale design-system CSS-en.
// ============================================================

import './globals.css';

export const metadata = {
  title: 'Claw Personal — Din AI-agent for YouTube',
  description:
    'Få din egen AI-agent som analyserer innboks, kalender og YouTube-kanal. Satt opp på 3 minutter. Trygt, privat og helt automatisk.',
  keywords: ['AI agent', 'YouTube', 'NanoClaw', 'Claw Personal', 'innholdsprodusent'],
  openGraph: {
    title: 'Claw Personal — Din AI-agent for YouTube',
    description: 'Satt opp på 3 minutter. Trygt, privat og helt automatisk.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="no">
      <body>
        {/* Ambient glow-effekt i bakgrunnen */}
        <div className="bg-glow" aria-hidden="true" />

        {children}
      </body>
    </html>
  );
}
