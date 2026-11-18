/**
 * Crea (o reutiliza) los 5 usuarios de prueba para Playwright (uno por rol).
 * Corre: node scripts/seed-test-users.mjs
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const USERS = [
  { email: 'test-admin@piletaspancho.test',    password: 'TestAdmin123!',    role: 'super_admin', label: 'admin' },
  { email: 'test-owner@piletaspancho.test',    password: 'TestOwner123!',    role: 'owner',       label: 'owner' },
  { email: 'test-marketing@piletaspancho.test', password: 'TestMarketing123!', role: 'marketing',  label: 'marketing' },
  { email: 'test-employee@piletaspancho.test', password: 'TestEmployee123!', role: 'employee',    label: 'employee' },
  { email: 'test-client@piletaspancho.test',   password: 'TestClient123!',   role: 'client',      label: 'client' },
];

async function adminFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

async function listUsers() {
  const { json } = await adminFetch('/auth/v1/admin/users?per_page=200');
  return json.users ?? [];
}

async function createUser(email, password) {
  return adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
}

async function updateProfileRole(userId, role) {
  return adminFetch(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
    headers: { Prefer: 'return=minimal' },
  });
}

async function main() {
  console.log('Leyendo usuarios existentes...');
  const existing = await listUsers();
  const existingByEmail = Object.fromEntries(existing.map(u => [u.email, u]));

  const results = [];

  for (const u of USERS) {
    let userId;

    if (existingByEmail[u.email]) {
      userId = existingByEmail[u.email].id;
      console.log(`  [skip] ${u.email} ya existe (${userId})`);
    } else {
      const { ok, status, json } = await createUser(u.email, u.password);
      if (!ok) {
        console.error(`  [error] crear ${u.email}: ${status}`, json);
        process.exit(1);
      }
      userId = json.id;
      console.log(`  [ok] ${u.email} creado (${userId})`);
    }

    // Esperar un poco para que el trigger cree el perfil
    await new Promise(r => setTimeout(r, 800));

    const { ok: pOk, status: pStatus } = await updateProfileRole(userId, u.role);
    if (!pOk && pStatus !== 204) {
      console.warn(`  [warn] no se pudo setear rol ${u.role} para ${u.email} (status ${pStatus}) — puede que el perfil aún no exista, reintentando...`);
      await new Promise(r => setTimeout(r, 1500));
      await updateProfileRole(userId, u.role);
    } else {
      console.log(`  [ok] rol ${u.role} seteado para ${u.email}`);
    }

    results.push({ label: u.label, email: u.email, password: u.password });
  }

  // Asignar nivel Bronce al test-client
  const clientUser = results.find(r => r.label === 'client');
  if (clientUser) {
    const { json: levelsJson } = await adminFetch('/rest/v1/client_levels?min_points=eq.0&select=id,name');
    const bronceId = Array.isArray(levelsJson) && levelsJson[0]?.id;
    if (bronceId) {
      // Encontrar userId del cliente
      const clientExisting = existingByEmail['test-client@piletaspancho.test'];
      const clientId = clientExisting?.id ?? results.find(r => r.label === 'client')?.id;
      if (clientId) {
        const { status } = await adminFetch(`/rest/v1/profiles?id=eq.${clientId}`, {
          method: 'PATCH',
          body: JSON.stringify({ client_level_id: bronceId }),
          headers: { Prefer: 'return=minimal' },
        });
        console.log(`  [ok] nivel Bronce (${bronceId}) asignado al test-client (status ${status})`);
      }
    } else {
      console.log('  [warn] no se encontró el nivel Bronce en client_levels');
    }
  }

  // Generar .env.test
  const envLines = [
    '# Usuarios de prueba para Playwright — generado por seed-test-users.mjs',
    ...results.map(r => [
      `TEST_${r.label.toUpperCase()}_EMAIL=${r.email}`,
      `TEST_${r.label.toUpperCase()}_PASSWORD=${r.password}`,
    ].join('\n')),
  ].join('\n');

  const fs = await import('fs');
  fs.writeFileSync('.env.test', envLines + '\n');
  console.log('\n.env.test generado:');
  console.log(envLines);
  console.log('\nListo.');
}

main().catch(e => { console.error(e); process.exit(1); });
