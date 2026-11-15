import type { UserProfile } from './healthCheck';

/**
 * Canonical frontend RBAC helper for staff operations (ADMIN or WORKER).
 * Treats profiles without an explicit status field (seeded/legacy fixtures) as APPROVED,
 * while strictly blocking PENDING and REJECTED staff profiles.
 */
export function isApprovedStaffProfile(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  const isStaffRole = profile.role === 'ADMIN' || profile.role === 'WORKER';
  const isApproved = !profile.status || profile.status === 'APPROVED';
  return isStaffRole && isApproved;
}

/**
 * Canonical frontend RBAC helper for administrator-only operations (ADMIN).
 */
export function isApprovedAdminProfile(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  const isApproved = !profile.status || profile.status === 'APPROVED';
  return profile.role === 'ADMIN' && isApproved;
}
