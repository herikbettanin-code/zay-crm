import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRM Truckfort',
  description: 'CRM comercial da Truckfort, operado pela ZAY e pela equipe de vendas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <span className="marca">Truckfort</span>
          <nav>
            <a href="/">Funil</a>
          </nav>
        </header>
        <main className="conteudo">{children}</main>
      </body>
    </html>
  );
}
