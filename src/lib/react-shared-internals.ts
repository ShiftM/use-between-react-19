import * as React from 'react'

type AnyHook = (...args: any[]) => any;
type ReactSharedInternalsType = {
  H: {
    current?: {
      [name: string]: AnyHook
    };
  };
}

export const ReactSharedInternals =
  (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE  as ReactSharedInternalsType

export const ReactCurrentDispatcher = ReactSharedInternals.H
