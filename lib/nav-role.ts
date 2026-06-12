export type NavRole = 'junior' | 'senior' | 'crisp' | 'sac' | 'committee'

export function profileToNavRole(p: {
  is_sac?: boolean | null
  is_crisp?: boolean | null
  is_committee?: boolean | null
  can_host_gd?: boolean | null
  can_host_pi?: boolean | null
}): NavRole {
  // Priority order for the header badge: CRISP > SAC > committee > senior > junior
  // Capabilities are ADDITIVE — this only controls the badge label, not page access.
  if (p.is_crisp) return 'crisp'
  if (p.is_sac) return 'sac'
  if (p.is_committee) return 'committee'
  if (p.can_host_gd || p.can_host_pi) return 'senior'
  return 'junior'
}
