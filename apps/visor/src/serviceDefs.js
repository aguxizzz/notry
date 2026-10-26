// Servicios del loteo (agua, luz, gas…): etiqueta e ícono por `tipo`.

import {
  IconWater, IconGas, IconElectricity, IconSecurity, IconLighting, IconWaste,
} from './components/serviceIcons.jsx';

export const SERVICE_DEFS = {
  water: { label: 'Agua potable', Icon: IconWater },
  electricity: { label: 'Luz eléctrica', Icon: IconElectricity },
  gas: { label: 'Gas', Icon: IconGas },
  lighting: { label: 'Alumbrado público', Icon: IconLighting },
  security: { label: 'Seguridad', Icon: IconSecurity },
  waste: { label: 'Recolección de residuos', Icon: IconWaste },
};

export const hasServices = (services) => (services ?? []).some((s) => SERVICE_DEFS[s?.tipo]);
