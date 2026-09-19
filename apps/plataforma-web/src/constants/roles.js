// Constantes de roles. Hay DOS sistemas de roles distintos en la app, NO se
// mezclan:
//
// 1. PLATFORM: rol global del usuario en la plataforma (Sidebar, App.jsx).
//    - lote_owner: cliente que paga → ve su inventario
//    - admin:      staff de la plataforma
//    - super_admin: dueño de la plataforma
//
// 2. ORG: rol del usuario dentro de una organización (TeamPanel, invites).
//    - owner:  dueño de la org (puede invitar, cambiar roles, borrar org)
//    - admin:  puede editar datos de la org e invitar miembros
//    - member: solo lectura de los datos de la org
//
// Antes estaban hardcodeados en Sidebar.jsx, TeamPanel.jsx y
// AcceptInviteView.jsx, con la label "admin" inconsistente entre archivos
// ("Admin" vs "Administrador"). Acá se centralizan.

import { Crown, Shield, User } from 'lucide-react';

// ─── Roles de plataforma (Sidebar, App.jsx) ─────────────────────────────────

export const PLATFORM_ROLE_LABELS = {
  admin: 'Administrador',
  super_admin: 'Super admin',
};

// ─── Roles de organización (TeamPanel, AcceptInviteView) ─────────────────────

export const ORG_ROLE_LABELS = {
  owner: 'Dueño',
  admin: 'Administrador',
  member: 'Miembro',
};

export const ORG_ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: User,
};

// Roles con permiso para editar los datos de la organización (nombre, WhatsApp).
export const CAN_EDIT_ORG_ROLES = ['owner', 'admin'];

// Opciones para el <Select> de cambio de rol al invitar/cambiar miembro.
// El owner no aparece (no se puede degradar a uno mismo ni promover a otro).
export const ORG_ROLE_OPTIONS = [
  { value: 'member', label: ORG_ROLE_LABELS.member },
  { value: 'admin', label: ORG_ROLE_LABELS.admin },
];