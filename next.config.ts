import type { NextConfig } from 'next';

// Mantém o pg (driver do PostgreSQL) rodando no servidor, sem o Next tentar empacotá-lo.
const nextConfig: NextConfig = {
  serverExternalPackages: ['pg'],
};

export default nextConfig;
