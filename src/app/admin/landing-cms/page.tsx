import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getLandingContent } from '@/lib/supabase/landing';
import { LandingCmsForm } from './LandingCmsForm';
import { ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/admin/bo';
import { PedidosWhatsApp } from './PedidosWhatsApp';

export default async function LandingCmsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const content = await getLandingContent();

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Contenido del sitio"
        title="Landing CMS"
        description="Editá los textos de la landing. Los cambios se reflejan en el sitio al instante."
        actions={
          <a href="/" target="_blank" rel="noopener noreferrer" className="bo-btn">
            <ExternalLink className="w-4 h-4" />
            Ver landing
          </a>
        }
      />

      <PedidosWhatsApp />

      <LandingCmsForm initialContent={content} />
    </div>
  );
}
