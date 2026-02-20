import { useEffect, useMemo, useState } from 'react';

const EMPTY_ROLE_SET = new Set();

export function useUserRoles({ currentUserId, supabaseClient, enabled }) {
  const [rolesReady, setRolesReady] = useState(!enabled);
  const [rolesError, setRolesError] = useState('');
  const [roleNames, setRoleNames] = useState(EMPTY_ROLE_SET);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId) {
      setRoleNames(EMPTY_ROLE_SET);
      setRolesError('');
      setRolesReady(true);
      return;
    }

    let cancelled = false;

    const loadRoles = async () => {
      setRolesReady(false);
      setRolesError('');
      try {
        const { data, error } = await supabaseClient
          .from('app_user_roles')
          .select('role_name')
          .eq('user_id', currentUserId);

        if (cancelled) return;

        if (error) {
          setRolesError(error.message || 'Unable to load user roles.');
          setRoleNames(new Set());
          return;
        }

        const nextRoles = new Set(
          (data || [])
            .map((row) => String(row.role_name || '').trim())
            .filter(Boolean)
        );
        setRoleNames(nextRoles);
      } catch (error) {
        if (cancelled) return;
        setRolesError(error?.message || 'Unable to load user roles.');
        setRoleNames(new Set());
        console.error('Failed to load user roles', error);
      } finally {
        if (!cancelled) setRolesReady(true);
      }
    };

    loadRoles();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, enabled, supabaseClient]);

  const isAdmin = useMemo(() => roleNames.has('admin'), [roleNames]);
  const canAuthorMode = useMemo(
    () => roleNames.has('admin') || roleNames.has('author'),
    [roleNames]
  );

  return {
    rolesReady,
    rolesError,
    roleNames,
    isAdmin,
    canAuthorMode,
  };
}
