import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BlockUserButton } from './BlockUserButton';
import { Shield, Building2, FileText, Waves, Users } from 'lucide-react';
import { PageHeader, Panel, StatusBadge, Avatar, type BadgeTone } from '@/components/admin/bo';
import { RoleChangeButton } from './RoleChangeButton';
import { CrearUsuarioForm } from './CrearUsuarioForm';

async function getAllUsers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, status, role, created_at')
    .order('role')
    .order('full_name');
  if (error) throw error;
  return data ?? [];
}

const roleLabel: Record<string, string> = {
  super_admin: 'Super Admin', owner: 'Owner', marketing: 'Marketing',
  employee: 'Empleado', client: 'Cliente',
};
const roleTone: Record<string, Exclude<BadgeTone, 'red' | 'gray'>> = {
  super_admin: 'blue', owner: 'green', marketing: 'purple',
  employee: 'amber', client: 'blue',
};
const roleIcon: Record<string, typeof Shield> = {
  super_admin: Shield, owner: Building2, marketing: FileText,
  employee: Waves, client: Users,
};

const ALL_ROLES = ['super_admin', 'owner', 'marketing', 'employee', 'client'] as const;

export default async function RolesPage() {
  const users = await getAllUsers();
  const supabase = await createSupabaseServerClient();
  const { data: { user: me } } = await supabase.auth.getUser();

  const groups = ALL_ROLES.map((role) => ({
    role,
    users: users.filter((u) => u.role === role),
  })).filter((g) => g.users.length > 0);

  return (
    <div className="bo-page bo-page-narrow">
      <PageHeader
        eyebrow="Acceso y seguridad"
        title="Gestión de roles"
        description="Solo los super_admin pueden cambiar roles. Los cambios tienen efecto inmediato."
      />

      <CrearUsuarioForm />

      <div className="space-y-5">
        {groups.map(({ role, users: groupUsers }) => {
          const RoleIcon = roleIcon[role];
          return (
            <Panel key={role}>
              <div className="bo-panel-header bordered">
                <div className="flex items-center gap-3">
                  <span className={`bo-icon-tile ${roleTone[role]}`}>
                    <RoleIcon />
                  </span>
                  <div>
                    <StatusBadge tone={roleTone[role]}>{roleLabel[role]}</StatusBadge>
                    <p className="bo-panel-sub">{groupUsers.length} usuarios</p>
                  </div>
                </div>
              </div>
              <div className="bo-rows">
                {groupUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-4 px-5 py-3">
                    <Avatar name={user.full_name as string} small />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user.full_name as string}
                        {user.status === 'blocked' && <span className="ml-2 align-middle"><StatusBadge tone="red">Bloqueado</StatusBadge></span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(user.created_at as string).toLocaleDateString('es-AR')}
                      </p>
                    </div>
                    <BlockUserButton userId={user.id} initiallyBlocked={user.status === 'blocked'} isSelf={user.id === me?.id} />
                    <RoleChangeButton
                      userId={user.id}
                      currentRole={user.role as string}
                      allRoles={ALL_ROLES as unknown as string[]}
                    />
                  </div>
                ))}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
