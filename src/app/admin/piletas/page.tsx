import { redirect } from 'next/navigation';

/** Las piletas se ven junto con sus clientes, en una sola planilla: "Clientes y piletas". */
export default function PiletasPage() {
  redirect('/admin/clientes');
}
