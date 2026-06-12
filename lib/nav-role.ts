export type NavRole = 'junior' | 'senior' | 'crisp' | 'sac'

export function profileToNavRole(p: {
  is_sac?: boolean | null
  is_crisp?: boolean | null
  can_host_gd?: boolean | null
  can_host_pi?: boolean | null
}): NavRole {
  if (p.is_sac) return 'sac'
  if (p.is_crisp) return 'crisp'
  if (p.can_host_gd || p.can_host_pi) return 'senior'
  return 'junior'
}
