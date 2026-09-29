-- ============================================================
-- supabase/seed.sql
-- Development and testing seed data only.
-- NO real persons. NO credentials. NO secrets.
-- ============================================================

-- ---------------------------------------------------------------
-- Seed keys/laboratories
-- ---------------------------------------------------------------
INSERT INTO public.keys (id, codigo, nome, descricao, localizacao, status, ativo)
VALUES
  (
    '00000000-0000-0000-0001-000000000001',
    'LAB-01',
    'Laboratório de Informática 1',
    'Laboratório principal com 30 computadores para aulas práticas.',
    'Bloco A, Sala 101',
    'available',
    true
  ),
  (
    '00000000-0000-0000-0001-000000000002',
    'LAB-02',
    'Laboratório de Informática 2',
    'Laboratório de hardware e redes.',
    'Bloco A, Sala 102',
    'available',
    true
  ),
  (
    '00000000-0000-0000-0001-000000000003',
    'LAB-03',
    'Laboratório de Eletrônica',
    'Bancadas para experimentos de eletrônica.',
    'Bloco B, Sala 201',
    'available',
    true
  ),
  (
    '00000000-0000-0000-0001-000000000004',
    'LAB-04',
    'Laboratório de Redes',
    'Infraestrutura de servidores e equipamentos de rede.',
    'Bloco B, Sala 202',
    'maintenance',
    true
  ),
  (
    '00000000-0000-0000-0001-000000000005',
    'SALA-EST',
    'Sala de Estudos',
    'Sala reservada para estudos e reuniões de grupos.',
    'Bloco C, Sala 301',
    'available',
    true
  ),
  (
    '00000000-0000-0000-0001-000000000006',
    'LAB-05',
    'Laboratório Desativado',
    'Laboratório desativado para fins de teste.',
    'Bloco D, Sala 001',
    'inactive',
    false
  )
ON CONFLICT (id) DO NOTHING;
