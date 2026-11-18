import { redirect } from 'next/navigation';

// Por ahora nadie puede crearse una cuenta solo: las cuentas las crea el súper admin.
export default function RegisterPage() {
  redirect('/login');
}
