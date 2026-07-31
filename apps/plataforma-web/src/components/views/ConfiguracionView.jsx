import ShellLayout from '../ShellLayout';
import ProfileCard from '../ProfileCard';
import TeamPanel from '../TeamPanel';
import { PageHeader, PageLayout } from '../../ui/components';
import '../Configuracion.css';

export default function ConfiguracionView({
  user,
  setUser,
  apiFetch,
  addToast,
  org,
  orgLoading,
  setOrg,
}) {
  return (
    <ShellLayout className="configuracion-shell">
      <PageLayout className="configuracion-page">
        <PageHeader
          eyebrow="Cuenta y equipo"
          title="Configuración"
          description="Tu perfil, la identidad de tu organización y quién forma parte del equipo."
        />

        <div className="cfg-grid">
          <div className="cfg-col">
            <ProfileCard user={user} setUser={setUser} apiFetch={apiFetch} addToast={addToast} />
          </div>
          <div className="cfg-col">
            <TeamPanel
              user={user}
              apiFetch={apiFetch}
              addToast={addToast}
              org={org}
              orgLoading={orgLoading}
              setOrg={setOrg}
            />
          </div>
        </div>
      </PageLayout>
    </ShellLayout>
  );
}
